import JSONbig from "json-bigint";
import type { Address } from "viem";
import { getReadClient } from "@/lib/genlayer/client";
import { STUDIO_NEXT_CHAIN_ID } from "@/lib/genlayer/network";
import { DEMO_LIABILITY_SOURCE_ADDRESS, TEMPER_CONTRACT_ADDRESS } from "./contracts";
import { formatGen, shortAddress, toAddress, toBigInt } from "./format";
import type {
  Agreement,
  CaseOverview,
  ContractStatus,
  ContractWrite,
  CreateAgreementInput,
  Evidence,
  NextAction,
  TemperCase,
  UserRole,
  Verdict,
} from "./types";

const jsonParser = JSONbig({ useNativeBigInt: true });
const CASE_STATUSES = new Set<ContractStatus>([
  "CLAIM_OPEN",
  "MITIGATION_CHALLENGED",
  "MITIGATION_DISPUTED",
  "JUDGMENT_PENDING",
  "RESOLVED",
  "SETTLED",
  "CLOSED",
]);
const AGREEMENT_STATUSES = new Set<ContractStatus>([
  "PROPOSED",
  "ACCEPTED",
  "ACTIVE",
  ...CASE_STATUSES,
]);
const READ_BATCH_SIZE = 10;
const READ_CACHE_TTL_MS = 60_000;
const READ_WINDOW_MS = 60_000;
const READ_SAFETY_LIMIT = 20;
const READ_INITIAL_BURST = 6;
const READ_NORMAL_PACE_MS = 1_500;
const READ_BACKGROUND_PACE_MS = 3_000;
const RATE_LIMIT_COOLDOWN_MS = 30_000;
const SERVER_BUSY_COOLDOWN_MS = 5_000;
const AUTHORITATIVE_READ_BOOST_MS = 5_000;
const MANUAL_REFRESH_COOLDOWN_MS = 4_000;
const readCache = new Map<string, { value: unknown; expiresAt: number }>();
const inFlightReads = new Map<string, { version: number; promise: Promise<unknown> }>();
const recentReadStarts: number[] = [];
const queuedReads: QueuedRead[] = [];
const refreshCooldowns = new Map<string, number>();
let readQueueTimer: ReturnType<typeof setTimeout> | undefined;
let readSequence = 0;
let lastReadStartAt = 0;
let rateLimitCooldownUntil = 0;
let serverBusyCooldownUntil = 0;
let authoritativeReadBoostUntil = 0;
let readCacheVersion = 0;

export type ReadPriority = "critical" | "user" | "normal" | "background";

type QueuedRead = {
  priority: ReadPriority;
  sequence: number;
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

export type DemoLiabilityReceiptCheck =
  { status: "NOT_FOUND" } | { status: "EXISTS_VALID" } | { status: "EXISTS_MISMATCH" };

export type DemoLiabilityRecord = {
  receiptId: string;
  agreementId: string;
  provider: string;
  claimant: string;
  finalized: boolean;
  outcome: string;
  breachTimestamp: bigint;
  totalClaimedLoss: bigint;
  lossRecordedAt: bigint;
};

export type DemoLiabilityVerification =
  | { status: "NOT_FOUND" }
  | { status: "EXISTS_VALID"; record: DemoLiabilityRecord }
  | { status: "EXISTS_MISMATCH"; record: DemoLiabilityRecord };

export type TemperRpcStats = {
  networkReads: number;
  cacheHits: number;
  dedupedReads: number;
  readsByMethod: Record<string, number>;
  queueDepth: number;
  rateLimitCooldownActive: boolean;
  serverBusyCooldownActive: boolean;
};

const rpcStats: TemperRpcStats = {
  networkReads: 0,
  cacheHits: 0,
  dedupedReads: 0,
  readsByMethod: {},
  queueDepth: 0,
  rateLimitCooldownActive: false,
  serverBusyCooldownActive: false,
};

type Summary = {
  agreement_id: string;
  provider: string;
  claimant: string;
  service_description: string;
  mitigation_covenant: string;
  allowed_mitigation_policy: string;
  trusted_liability_source: string;
  coverage_limit: bigint;
  agreement_expiry: bigint;
  agreement_accepted: boolean;
  status: ContractStatus;
  stage_deadline: bigint;
  total_bond_funded: bigint;
  amount_already_paid: bigint;
  amount_withdrawn: bigint;
  remaining_bond: bigint;
  liability_receipt_id: string;
  established_breach_timestamp: bigint;
  liability_finalized: boolean;
  total_claimed_loss: bigint;
  claim_status: string;
  mitigation_available_at: bigint;
  provider_mitigation_note: string;
  primary_evidence_url: string;
  primary_evidence_hash: string;
  corroborating_evidence_url: string;
  corroborating_evidence_hash: string;
  deterministic_loss_at_mitigation: bigint;
  challenge_status: string;
  claimant_response_statement: string;
  claimant_evidence_url: string;
  claimant_evidence_hash: string;
  dispute_submitted: boolean;
  final_verdict: string;
  judgment_summary: string;
  judgment_finalized: boolean;
  recoverable_amount: bigint;
  avoidable_amount: bigint;
  resolution_basis: string;
  resolution_summary: string;
  payout_requested: boolean;
  payout_requested_amount: bigint;
  settled: boolean;
  timeout_triggered: boolean;
};

function readArgs(args: unknown[] = []) {
  return args as never[];
}

function readKey(address: Address, functionName: string, args: unknown[]) {
  return JSON.stringify(
    [STUDIO_NEXT_CHAIN_ID, address.toLowerCase(), functionName, args],
    (_, value) => (typeof value === "bigint" ? `${value}n` : value),
  );
}

export const temperQueryKey = (...parts: readonly unknown[]) =>
  ["temper", STUDIO_NEXT_CHAIN_ID, TEMPER_CONTRACT_ADDRESS.toLowerCase(), ...parts] as const;

function logRead(kind: "NETWORK" | "CACHE" | "DEDUPE", functionName: string, args: unknown[]) {
  if (!import.meta.env.DEV) return;
  const suffix = args.length ? ` ${args.map(String).join(" ")}` : "";
  console.debug(`[temper-rpc] ${kind} ${functionName}${suffix} ${new Date().toISOString()}`);
}

function recordNetworkRead(functionName: string, args: unknown[]) {
  const now = Date.now();
  recentReadStarts.push(now);
  pruneRecentReadStarts(now);
  lastReadStartAt = now;
  if (import.meta.env.DEV) {
    rpcStats.networkReads += 1;
    rpcStats.readsByMethod[functionName] = (rpcStats.readsByMethod[functionName] ?? 0) + 1;
    logRead("NETWORK", functionName, args);
  }
}

export function getTemperRpcStats(): TemperRpcStats {
  return {
    ...rpcStats,
    readsByMethod: { ...rpcStats.readsByMethod },
    queueDepth: queuedReads.length,
    rateLimitCooldownActive: rateLimitCooldownUntil > Date.now(),
    serverBusyCooldownActive: serverBusyCooldownUntil > Date.now(),
  };
}

export function resetTemperRpcStats() {
  rpcStats.networkReads = 0;
  rpcStats.cacheHits = 0;
  rpcStats.dedupedReads = 0;
  rpcStats.readsByMethod = {};
}

if (import.meta.env.DEV) {
  (
    globalThis as typeof globalThis & {
      __TEMPER_RPC__?: { getStats: () => TemperRpcStats; reset: () => void };
    }
  ).__TEMPER_RPC__ = {
    getStats: getTemperRpcStats,
    reset: resetTemperRpcStats,
  };
}

export type RpcErrorClass =
  | "RATE_LIMIT"
  | "SERVER_BUSY"
  | "TRANSPORT_FAILURE"
  | "CONTRACT_USER_ERROR"
  | "PARSE_FRONTEND_ERROR"
  | "UNKNOWN";

function rpcErrorText(reason: unknown): string {
  if (typeof reason === "string") return reason;
  const candidate = reason as {
    name?: unknown;
    message?: unknown;
    shortMessage?: unknown;
    details?: unknown;
    cause?: unknown;
  };
  return [
    candidate.name,
    candidate.message,
    candidate.shortMessage,
    candidate.details,
    candidate.cause ? rpcErrorText(candidate.cause) : undefined,
    String(reason),
  ]
    .filter(Boolean)
    .join(" ");
}

export function classifyRpcError(reason: unknown): RpcErrorClass {
  const detail = rpcErrorText(reason);
  if (/rate[- ]limit|too many requests|requests per minute|\b429\b/i.test(detail)) {
    return "RATE_LIMIT";
  }
  if (/server[- ]busy|all execution slots occupied|retry later|temporarily busy/i.test(detail)) {
    return "SERVER_BUSY";
  }
  if (
    /failed to fetch|fetch failed|network error|connection error|request failed(?: due)? to transport|endpoint.*(?:unreachable|unavailable)|network request failed|load failed/i.test(
      detail,
    )
  ) {
    return "TRANSPORT_FAILURE";
  }
  if (
    /user error|execution reverted| reverted|insufficient funds|unauthorized|not authorized|permission denied|caller is not/i.test(
      detail,
    )
  ) {
    return "CONTRACT_USER_ERROR";
  }
  if (
    /parse error|failed to parse|decode error|invalid .*response|unexpected .*response|missing .*field/i.test(
      detail,
    )
  ) {
    return "PARSE_FRONTEND_ERROR";
  }
  return "UNKNOWN";
}

function isRateLimitError(reason: unknown) {
  return classifyRpcError(reason) === "RATE_LIMIT";
}

function isServerBusyError(reason: unknown) {
  return classifyRpcError(reason) === "SERVER_BUSY";
}

function pruneRecentReadStarts(now = Date.now()) {
  while (recentReadStarts[0] !== undefined && recentReadStarts[0] <= now - READ_WINDOW_MS) {
    recentReadStarts.shift();
  }
}

function priorityRank(priority: ReadPriority) {
  return priority === "critical" ? 0 : priority === "user" ? 1 : priority === "normal" ? 2 : 3;
}

function cooldownError(kind: "rate-limit" | "server-busy") {
  return new Error(
    kind === "rate-limit"
      ? "Studio Dev read rate-limit cooldown is active."
      : "Studio Dev server-busy cooldown is active.",
  );
}

function rejectQueuedNoncriticalReads(reason: Error) {
  const retained: QueuedRead[] = [];
  for (const queued of queuedReads) {
    if (queued.priority === "critical") retained.push(queued);
    else queued.reject(reason);
  }
  queuedReads.splice(0, queuedReads.length, ...retained);
}

function activateReadCooldown(kind: "rate-limit" | "server-busy") {
  const until =
    Date.now() + (kind === "rate-limit" ? RATE_LIMIT_COOLDOWN_MS : SERVER_BUSY_COOLDOWN_MS);
  if (kind === "rate-limit") rateLimitCooldownUntil = Math.max(rateLimitCooldownUntil, until);
  else serverBusyCooldownUntil = Math.max(serverBusyCooldownUntil, until);
  if (import.meta.env.DEV) {
    console.debug(`[temper-rpc] ${kind} cooldown ${Math.ceil((until - Date.now()) / 1000)}s`);
  }
  rejectQueuedNoncriticalReads(cooldownError(kind));
  if (readQueueTimer !== undefined) {
    clearTimeout(readQueueTimer);
    readQueueTimer = undefined;
  }
  pumpReadQueue();
}

function nextReadDelay(priority: ReadPriority) {
  const now = Date.now();
  pruneRecentReadStarts(now);
  if (priority !== "critical") {
    const cooldownUntil = Math.max(rateLimitCooldownUntil, serverBusyCooldownUntil);
    if (cooldownUntil > now) return cooldownUntil - now;
  }
  if (priority === "critical") return 0;
  if (recentReadStarts.length >= READ_SAFETY_LIMIT) {
    const oldestReadStart = recentReadStarts[0];
    return oldestReadStart === undefined ? 0 : Math.max(0, oldestReadStart + READ_WINDOW_MS - now);
  }
  if (priority === "user" || recentReadStarts.length < READ_INITIAL_BURST) return 0;
  const pace = priority === "background" ? READ_BACKGROUND_PACE_MS : READ_NORMAL_PACE_MS;
  return Math.max(0, lastReadStartAt + pace - now);
}

function pumpReadQueue() {
  if (readQueueTimer !== undefined || queuedReads.length === 0) return;
  queuedReads.sort(
    (left, right) =>
      priorityRank(left.priority) - priorityRank(right.priority) || left.sequence - right.sequence,
  );
  const next = queuedReads[0];
  if (!next) return;
  const delay = nextReadDelay(next.priority);
  if (delay > 0) {
    readQueueTimer = setTimeout(() => {
      readQueueTimer = undefined;
      pumpReadQueue();
    }, delay);
    return;
  }
  queuedReads.shift();
  void next
    .run()
    .then(next.resolve, next.reject)
    .finally(() => {
      pumpReadQueue();
    });
  pumpReadQueue();
}

function scheduleRead<T>(run: () => Promise<T>, priority: ReadPriority) {
  return new Promise<T>((resolve, reject) => {
    const now = Date.now();
    if (priority !== "critical") {
      if (rateLimitCooldownUntil > now) {
        reject(cooldownError("rate-limit"));
        return;
      }
      if (serverBusyCooldownUntil > now) {
        reject(cooldownError("server-busy"));
        return;
      }
    }
    if (priority === "critical" && readQueueTimer !== undefined) {
      clearTimeout(readQueueTimer);
      readQueueTimer = undefined;
    }
    queuedReads.push({
      priority,
      sequence: readSequence++,
      run: async () => run(),
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    pumpReadQueue();
  });
}

export function allowTemperManualRefresh(resource: string) {
  const now = Date.now();
  const nextAllowedAt = refreshCooldowns.get(resource) ?? 0;
  if (nextAllowedAt > now) return false;
  refreshCooldowns.set(resource, now + MANUAL_REFRESH_COOLDOWN_MS);
  return true;
}

export function rpcErrorMessage(reason: unknown, hasStaleData = false) {
  const errorClass = classifyRpcError(reason);
  if (import.meta.env.DEV) {
    console.debug("[temper-rpc] error class=" + errorClass + " stale=" + hasStaleData, reason);
  }
  if (errorClass === "RATE_LIMIT") {
    return hasStaleData
      ? "Studio Dev is temporarily rate-limiting reads. Showing the latest loaded state. Try refreshing shortly."
      : "Studio Dev is temporarily rate-limiting reads. Try refreshing shortly.";
  }
  if (errorClass === "SERVER_BUSY") {
    return hasStaleData
      ? "Studio Dev is temporarily busy. Showing the latest loaded state. Try refreshing shortly."
      : "Studio Dev is temporarily busy. Try refreshing shortly.";
  }
  if (errorClass === "TRANSPORT_FAILURE") {
    return hasStaleData
      ? "Studio Dev could not be reached. Showing the latest loaded state. Try refreshing shortly."
      : "Studio Dev could not be reached. Try again shortly.";
  }
  if (errorClass === "CONTRACT_USER_ERROR") {
    return "Studio Dev rejected the request. Check the wallet permissions and current agreement state.";
  }
  if (errorClass === "PARSE_FRONTEND_ERROR") {
    return "TEMPER could not interpret the Studio Dev response. Try again shortly.";
  }
  return "TEMPER could not load this Studio Dev state. Try again shortly.";
}

async function requestRead(
  address: Address,
  functionName: string,
  args: unknown[],
  version: number,
  cacheResult = true,
) {
  try {
    recordNetworkRead(functionName, args);
    const value = await getReadClient().readContract({
      address,
      functionName,
      args: readArgs(args),
    });
    if (cacheResult && version === readCacheVersion) {
      readCache.set(readKey(address, functionName, args), {
        value,
        expiresAt: Date.now() + READ_CACHE_TTL_MS,
      });
    }
    return value;
  } catch (reason) {
    if (isRateLimitError(reason)) activateReadCooldown("rate-limit");
    else if (isServerBusyError(reason)) activateReadCooldown("server-busy");
    throw reason;
  }
}

async function readAt(
  address: Address,
  functionName: string,
  args: unknown[] = [],
  cacheResult = true,
  priority: ReadPriority = "normal",
): Promise<unknown> {
  const key = readKey(address, functionName, args);
  if (cacheResult) {
    const cached = readCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      if (import.meta.env.DEV) {
        rpcStats.cacheHits += 1;
        logRead("CACHE", functionName, args);
      }
      return cached.value;
    }
    if (cached) readCache.delete(key);
  }
  const pending = inFlightReads.get(key);
  if (pending) {
    if (import.meta.env.DEV) {
      rpcStats.dedupedReads += 1;
      logRead("DEDUPE", functionName, args);
    }
    return pending.version === readCacheVersion
      ? pending.promise
      : pending.promise.then(() => readAt(address, functionName, args, cacheResult, priority));
  }
  const version = readCacheVersion;
  const effectivePriority = Date.now() < authoritativeReadBoostUntil ? "critical" : priority;
  const request = scheduleRead(
    () => requestRead(address, functionName, args, version, cacheResult),
    effectivePriority,
  );
  const trackedRequest = request.finally(() => {
    if (inFlightReads.get(key)?.promise === trackedRequest) inFlightReads.delete(key);
  });
  inFlightReads.set(key, { version, promise: trackedRequest });
  return trackedRequest;
}

function readTemper(functionName: string, args: unknown[] = [], priority: ReadPriority = "normal") {
  return readAt(TEMPER_CONTRACT_ADDRESS, functionName, args, true, priority);
}

function readDemo(
  sourceAddress: string,
  functionName: string,
  args: unknown[] = [],
  cacheResult = false,
  priority: ReadPriority = "normal",
) {
  return readAt(sourceAddress as Address, functionName, args, cacheResult, priority);
}

export function clearTemperReadCache() {
  readCacheVersion += 1;
  readCache.clear();
  authoritativeReadBoostUntil = Date.now() + AUTHORITATIVE_READ_BOOST_MS;
}

export function clearTemperRegistryReadCache() {
  readCacheVersion += 1;
  authoritativeReadBoostUntil = Date.now() + AUTHORITATIVE_READ_BOOST_MS;
  const registryFunctions = new Set([
    "get_agreement_count",
    "get_agreement_id_at",
    "agreement_exists",
    "get_summary",
    "get_case_overview",
  ]);
  for (const key of readCache.keys()) {
    try {
      const [, address, functionName] = JSON.parse(key) as [unknown, unknown, unknown];
      if (
        address === TEMPER_CONTRACT_ADDRESS.toLowerCase() &&
        typeof functionName === "string" &&
        registryFunctions.has(functionName)
      ) {
        readCache.delete(key);
      }
    } catch {
      // Ignore malformed cache keys; a full cache clear remains available for writes.
    }
  }
}

export function clearAgreementReadCache(id: string) {
  readCacheVersion += 1;
  authoritativeReadBoostUntil = Date.now() + AUTHORITATIVE_READ_BOOST_MS;
  for (const functionName of ["agreement_exists", "get_summary", "get_case_overview"]) {
    const key = readKey(TEMPER_CONTRACT_ADDRESS, functionName, [id]);
    readCache.delete(key);
  }
}

function isMissingDemoReceiptError(reason: unknown) {
  const candidate = reason as {
    code?: unknown;
    details?: unknown;
    cause?: {
      message?: unknown;
      data?: { receipt?: { result?: unknown } };
    };
  };
  const encodedResult = candidate.cause?.data?.receipt?.result;
  let decodedResult = "";
  if (typeof encodedResult === "string" && typeof globalThis.atob === "function") {
    try {
      decodedResult = globalThis.atob(encodedResult);
    } catch {
      decodedResult = "";
    }
  }
  const detail = [
    reason instanceof Error ? reason.message : String(reason),
    candidate.details,
    candidate.cause?.message,
    decodedResult,
  ]
    .filter(Boolean)
    .join(" ");
  return /liability receipt does not exist|liability receipt not found/i.test(detail);
}

export async function checkDemoLiabilityReceipt(
  sourceAddress: string,
  receiptId: string,
  agreementId: string,
  provider: string,
  claimant: string,
): Promise<DemoLiabilityReceiptCheck> {
  const verification = await verifyDemoLiabilityRecord(sourceAddress, receiptId, {
    agreementId,
    provider,
    claimant,
  });
  return { status: verification.status };
}

export async function verifyDemoLiabilityRecord(
  sourceAddress: string,
  receiptId: string,
  expected: {
    agreementId: string;
    provider: string;
    claimant: string;
    breachTimestamp?: bigint;
    totalClaimedLoss?: bigint;
    lossRecordedAt?: bigint;
  },
  priority: ReadPriority = "normal",
): Promise<DemoLiabilityVerification> {
  let record: DemoLiabilityRecord;
  try {
    record = await readDemoLiabilityRecord(sourceAddress, receiptId, priority);
  } catch (reason) {
    if (isMissingDemoReceiptError(reason)) return { status: "NOT_FOUND" };
    throw reason;
  }
  const matches =
    record.receiptId === receiptId &&
    record.agreementId === expected.agreementId &&
    record.provider.toLowerCase() === expected.provider.toLowerCase() &&
    record.claimant.toLowerCase() === expected.claimant.toLowerCase() &&
    record.finalized &&
    record.outcome === "PROVIDER_LIABLE" &&
    (expected.breachTimestamp === undefined ||
      record.breachTimestamp === expected.breachTimestamp) &&
    (expected.totalClaimedLoss === undefined ||
      record.totalClaimedLoss === expected.totalClaimedLoss) &&
    (expected.lossRecordedAt === undefined || record.lossRecordedAt === expected.lossRecordedAt);
  return { status: matches ? "EXISTS_VALID" : "EXISTS_MISMATCH", record };
}

export async function readDemoLiabilityRecord(
  sourceAddress: string,
  receiptId: string,
  priority: ReadPriority = "normal",
): Promise<DemoLiabilityRecord> {
  const [
    sourceReceiptId,
    sourceAgreementId,
    sourceProvider,
    sourceClaimant,
    finalized,
    outcome,
    breachTimestamp,
    totalClaimedLoss,
    lossRecordedAt,
  ] = await Promise.all([
    readDemo(sourceAddress, "get_liability_receipt_id", [receiptId], false, priority),
    readDemo(sourceAddress, "get_liability_agreement_id", [receiptId], false, priority),
    readDemo(sourceAddress, "get_liability_provider_address", [receiptId], false, priority),
    readDemo(sourceAddress, "get_liability_claimant_address", [receiptId], false, priority),
    readDemo(sourceAddress, "is_liability_finalized", [receiptId], false, priority),
    readDemo(sourceAddress, "get_liability_outcome", [receiptId], false, priority),
    readDemo(sourceAddress, "get_established_breach_timestamp", [receiptId], false, priority),
    readDemo(sourceAddress, "get_total_claimed_loss", [receiptId], false, priority),
    readDemo(sourceAddress, "get_loss_recorded_at", [receiptId], false, priority),
  ]);
  return {
    receiptId: String(sourceReceiptId),
    agreementId: String(sourceAgreementId),
    provider: toAddress(sourceProvider),
    claimant: toAddress(sourceClaimant),
    finalized: Boolean(finalized),
    outcome: String(outcome),
    breachTimestamp: toBigInt(breachTimestamp, "breach timestamp"),
    totalClaimedLoss: toBigInt(totalClaimedLoss, "claimed loss"),
    lossRecordedAt: toBigInt(lossRecordedAt, "loss recorded timestamp"),
  };
}

export async function getDemoLossRecordedAt(
  sourceAddress: string,
  receiptId: string,
  priority: ReadPriority = "normal",
): Promise<bigint> {
  return toBigInt(
    await readDemo(sourceAddress, "get_loss_recorded_at", [receiptId], true, priority),
    "loss recorded timestamp",
  );
}

function parseJson(value: unknown, label: string): Record<string, unknown> {
  if (typeof value === "string") {
    const parsed = jsonParser.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }
  throw new Error(`Contract returned invalid ${label}.`);
}

function field<T>(record: Record<string, unknown>, name: string): T {
  const value = record[name];
  if (value === undefined) throw new Error(`Contract response is missing ${name}.`);
  return value as T;
}

function roleFor(provider: string, claimant: string, wallet?: Address): UserRole {
  if (!wallet) return "Observer";
  if (wallet.toLowerCase() === provider.toLowerCase()) return "Provider";
  if (wallet.toLowerCase() === claimant.toLowerCase()) return "Other party";
  return "Observer";
}

function statusFrom(value: unknown): ContractStatus {
  if (typeof value !== "string" || !AGREEMENT_STATUSES.has(value as ContractStatus)) {
    throw new Error("Contract returned an unknown agreement status.");
  }
  return value as ContractStatus;
}

function deadlineExpired(deadline: bigint) {
  return deadline !== 0n && deadline <= BigInt(Math.floor(Date.now() / 1000));
}

function nextAction(
  status: ContractStatus,
  role: UserRole,
  deadline: bigint,
  connected: boolean,
): NextAction | undefined {
  if (!connected) return undefined;
  if (deadlineExpired(deadline)) {
    return {
      label: "Trigger timeout",
      description: "The contract deadline has passed.",
      kind: "case",
    };
  }
  const actions: Record<ContractStatus, [string, string, UserRole[]] | undefined> = {
    PROPOSED: ["Accept Agreement", "Review and accept the proposed terms.", ["Other party"]],
    ACCEPTED: ["Fund Bond", "Fund the exact agreed bond to activate the agreement.", ["Provider"]],
    ACTIVE: [
      "Start Demo Case",
      "Create a confirmed-loss test record and open a case.",
      ["Other party"],
    ],
    CLAIM_OPEN: [
      "Submit Mitigation",
      "The provider must submit the mitigation evidence.",
      ["Provider"],
    ],
    MITIGATION_CHALLENGED: [
      "Submit Response",
      "Review and respond to the provider's mitigation evidence.",
      ["Other party"],
    ],
    MITIGATION_DISPUTED: [
      "Request GenLayer Verdict",
      "Either party can request adjudication.",
      ["Provider", "Other party"],
    ],
    JUDGMENT_PENDING: [
      "Waiting for GenLayer",
      "The adjudication transaction is being finalized.",
      [],
    ],
    RESOLVED: [
      "Settle Case",
      "Anyone can execute the fixed settlement.",
      ["Provider", "Other party", "Observer"],
    ],
    SETTLED: [
      "Withdraw Remaining Bond",
      "The provider can withdraw the remaining bond.",
      ["Provider"],
    ],
    CLOSED: undefined,
  };
  const action = actions[status];
  if (!action || !action[2].includes(role)) {
    if (status === "PROPOSED")
      return {
        label: "Waiting for acceptance",
        description: "The other party must accept the terms.",
        kind: "agreement",
      };
    if (status === "ACCEPTED")
      return {
        label: "Waiting for bond",
        description: "The provider must fund the bond.",
        kind: "agreement",
      };
    if (status === "ACTIVE")
      return {
        label: "Waiting for the other party",
        description: "No action is required from you right now.",
        kind: "agreement",
      };
    if (status === "MITIGATION_CHALLENGED")
      return {
        label: "Waiting for claimant response",
        description: "The claimant can respond to the provider's mitigation claim.",
        kind: "case",
      };
    if (status === "SETTLED")
      return {
        label: "Waiting for withdrawal",
        description: "The provider can withdraw the remainder.",
        kind: "case",
      };
    return undefined;
  }
  return {
    label: action[0],
    description: action[1],
    kind:
      status === "PROPOSED" || status === "ACCEPTED" || status === "ACTIVE" ? "agreement" : "case",
  };
}

function titleFrom(summary: Summary) {
  const service = summary.service_description.trim();
  return service.length > 64
    ? `${service.slice(0, 61)}…`
    : service || `Agreement ${summary.agreement_id}`;
}

function evidenceFromSummary(summary: Summary): Evidence[] {
  const submittedAt = "Recorded onchain";
  const evidence: Evidence[] = [];
  if (summary.primary_evidence_url) {
    evidence.push({
      id: "provider-1",
      side: "provider",
      source: summary.primary_evidence_url,
      description: "Provider evidence source 1",
      status: "Submitted",
      submittedAt,
      hash: summary.primary_evidence_hash,
    });
  }
  if (summary.corroborating_evidence_url) {
    evidence.push({
      id: "provider-2",
      side: "provider",
      source: summary.corroborating_evidence_url,
      description: "Provider evidence source 2",
      status: "Submitted",
      submittedAt,
      hash: summary.corroborating_evidence_hash,
    });
  }
  if (summary.claimant_evidence_url) {
    evidence.push({
      id: "other-party-1",
      side: "other-party",
      source: summary.claimant_evidence_url,
      description: "Other party response evidence",
      status: "Submitted",
      submittedAt,
      hash: summary.claimant_evidence_hash,
    });
  }
  return evidence;
}

function toSummary(value: unknown): Summary {
  const record = parseJson(value, "agreement summary");
  return {
    agreement_id: field(record, "agreement_id"),
    provider: field(record, "provider"),
    claimant: field(record, "claimant"),
    service_description: field(record, "service_description"),
    mitigation_covenant: field(record, "mitigation_covenant"),
    allowed_mitigation_policy: field(record, "allowed_mitigation_policy"),
    trusted_liability_source: field(record, "trusted_liability_source"),
    coverage_limit: toBigInt(field(record, "coverage_limit"), "coverage limit"),
    agreement_expiry: toBigInt(field(record, "agreement_expiry"), "agreement expiry"),
    agreement_accepted: field(record, "agreement_accepted"),
    status: statusFrom(field(record, "status")),
    stage_deadline: toBigInt(field(record, "stage_deadline"), "stage deadline"),
    total_bond_funded: toBigInt(field(record, "total_bond_funded"), "bond funded"),
    amount_already_paid: toBigInt(field(record, "amount_already_paid"), "amount paid"),
    amount_withdrawn: toBigInt(field(record, "amount_withdrawn"), "amount withdrawn"),
    remaining_bond: toBigInt(field(record, "remaining_bond"), "remaining bond"),
    liability_receipt_id: field(record, "liability_receipt_id"),
    established_breach_timestamp: toBigInt(
      field(record, "established_breach_timestamp"),
      "breach timestamp",
    ),
    liability_finalized: field(record, "liability_finalized"),
    total_claimed_loss: toBigInt(field(record, "total_claimed_loss"), "claimed loss"),
    claim_status: field(record, "claim_status"),
    mitigation_available_at: toBigInt(
      field(record, "mitigation_available_at"),
      "mitigation timestamp",
    ),
    provider_mitigation_note: field(record, "provider_mitigation_note"),
    primary_evidence_url: field(record, "primary_evidence_url"),
    primary_evidence_hash: field(record, "primary_evidence_hash"),
    corroborating_evidence_url: field(record, "corroborating_evidence_url"),
    corroborating_evidence_hash: field(record, "corroborating_evidence_hash"),
    deterministic_loss_at_mitigation: toBigInt(
      field(record, "deterministic_loss_at_mitigation"),
      "mitigation loss",
    ),
    challenge_status: field(record, "challenge_status"),
    claimant_response_statement: field(record, "claimant_response_statement"),
    claimant_evidence_url: field(record, "claimant_evidence_url"),
    claimant_evidence_hash: field(record, "claimant_evidence_hash"),
    dispute_submitted: field(record, "dispute_submitted"),
    final_verdict: field(record, "final_verdict"),
    judgment_summary: field(record, "judgment_summary"),
    judgment_finalized: field(record, "judgment_finalized"),
    recoverable_amount: toBigInt(field(record, "recoverable_amount"), "recoverable amount"),
    avoidable_amount: toBigInt(field(record, "avoidable_amount"), "avoidable amount"),
    resolution_basis: field(record, "resolution_basis"),
    resolution_summary: field(record, "resolution_summary"),
    payout_requested: field(record, "payout_requested"),
    payout_requested_amount: toBigInt(field(record, "payout_requested_amount"), "payout amount"),
    settled: field(record, "settled"),
    timeout_triggered: field(record, "timeout_triggered"),
  };
}

function fromSummary(summary: Summary, wallet?: Address, overview?: CaseOverview): Agreement {
  const role = roleFor(summary.provider, summary.claimant, wallet);
  return {
    id: summary.agreement_id,
    title: titleFrom(summary),
    role,
    status: summary.status,
    provider: summary.provider,
    otherParty: summary.claimant,
    mainSource: "Primary service",
    backupSource: summary.mitigation_covenant || "Agreed mitigation",
    asset: summary.service_description,
    bond: summary.coverage_limit,
    coverageLimitWei: summary.coverage_limit,
    agreementExpiry: summary.agreement_expiry,
    totalBondFunded: summary.total_bond_funded,
    amountAlreadyPaid: summary.amount_already_paid,
    amountWithdrawn: summary.amount_withdrawn,
    remainingBond: summary.remaining_bond,
    nextAction: nextAction(
      summary.status,
      role,
      overview?.stageDeadline ?? summary.stage_deadline,
      Boolean(wallet),
    ),
    caseId: CASE_STATUSES.has(summary.status) ? summary.agreement_id : undefined,
    caseOverview: overview,
    serviceDescription: summary.service_description,
    mitigationCovenant: summary.mitigation_covenant,
    allowedMitigationPolicy: summary.allowed_mitigation_policy,
    trustedLiabilitySource: summary.trusted_liability_source,
  };
}

function fromSummaryCase(summary: Summary, wallet?: Address): CaseOverview {
  const role = roleFor(summary.provider, summary.claimant, wallet);
  const evidence = evidenceFromSummary(summary);
  const providerRemainder =
    summary.total_bond_funded - summary.recoverable_amount - summary.amount_withdrawn;
  return {
    id: summary.agreement_id,
    agreementId: summary.agreement_id,
    title: titleFrom(summary),
    role,
    status: summary.status as TemperCase["status"],
    bond: summary.coverage_limit,
    confirmedLoss: summary.total_claimed_loss,
    lossAtBackup: summary.deterministic_loss_at_mitigation,
    backupSource: summary.mitigation_covenant || "Agreed mitigation",
    verdict: ["VALID_MITIGATION", "INVALID_MITIGATION", "UNDETERMINED"].includes(
      summary.final_verdict,
    )
      ? (summary.final_verdict as Verdict)
      : undefined,
    recoverableAmount: summary.recoverable_amount,
    avoidableAmount: summary.avoidable_amount,
    providerRemainder: providerRemainder > 0n ? providerRemainder : 0n,
    amountWithdrawn: summary.amount_withdrawn,
    remainingBond: summary.remaining_bond,
    evidence,
    claimantResponse: summary.claimant_response_statement,
    openedAt: summary.liability_receipt_id ? "Onchain case record" : "Not opened",
    nextAction: nextAction(summary.status, role, summary.stage_deadline, Boolean(wallet)),
    resolutionBasis: summary.resolution_basis,
    stageDeadline: summary.stage_deadline,
    mitigationAvailableAt: summary.mitigation_available_at,
    provider: summary.provider,
    otherParty: summary.claimant,
    liabilityReceiptId: summary.liability_receipt_id,
    establishedBreachTimestamp: summary.established_breach_timestamp,
    trustedLiabilitySource: summary.trusted_liability_source,
    allowedMitigationPolicy: summary.allowed_mitigation_policy,
  };
}

function fromOverview(value: unknown, summary: Summary, wallet?: Address): CaseOverview {
  const record = parseJson(value, "case overview");
  const overviewSummary: Summary = {
    ...summary,
    status: statusFrom(field(record, "status")),
    stage_deadline: toBigInt(field(record, "stage_deadline"), "stage deadline"),
    total_claimed_loss: toBigInt(field(record, "total_claimed_loss"), "claimed loss"),
    mitigation_available_at: toBigInt(
      field(record, "mitigation_available_at"),
      "mitigation timestamp",
    ),
    deterministic_loss_at_mitigation: toBigInt(
      field(record, "deterministic_loss_at_mitigation"),
      "mitigation loss",
    ),
    final_verdict: field(record, "final_verdict"),
    recoverable_amount: toBigInt(field(record, "recoverable_amount"), "recoverable amount"),
    avoidable_amount: toBigInt(field(record, "avoidable_amount"), "avoidable amount"),
    resolution_basis: field(record, "resolution_basis"),
  };
  return fromSummaryCase(overviewSummary, wallet);
}

export async function agreementExists(
  id: string,
  priority: ReadPriority = "normal",
): Promise<boolean> {
  return Boolean(await readTemper("agreement_exists", [id], priority));
}

export async function getAgreement(
  id: string,
  wallet?: Address,
  priority: ReadPriority = "normal",
): Promise<Agreement | undefined> {
  if (!(await agreementExists(id, priority))) return undefined;
  return getAgreementFromKnownId(id, wallet, priority);
}

async function getAgreementFromKnownId(
  id: string,
  wallet?: Address,
  priority: ReadPriority = "normal",
): Promise<Agreement> {
  const summary = toSummary(await readTemper("get_summary", [id], priority));
  if (!CASE_STATUSES.has(summary.status)) return fromSummary(summary, wallet);
  const overview = fromOverview(
    await readTemper("get_case_overview", [id], priority),
    summary,
    wallet,
  );
  return fromSummary(summary, wallet, overview);
}

export async function getCaseOverview(
  id: string,
  wallet?: Address,
  priority: ReadPriority = "normal",
): Promise<CaseOverview | undefined> {
  const summary = toSummary(await readTemper("get_summary", [id], priority));
  if (!CASE_STATUSES.has(summary.status)) return undefined;
  return fromOverview(await readTemper("get_case_overview", [id], priority), summary, wallet);
}

export async function enumerateAgreements(
  wallet?: Address,
  priority: ReadPriority = "normal",
): Promise<Agreement[]> {
  const count = toBigInt(await readTemper("get_agreement_count", [], priority), "agreement count");
  if (count > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Agreement count is too large to enumerate safely.");
  const total = Number(count);
  const ids: unknown[] = [];
  for (let start = 0; start < total; start += READ_BATCH_SIZE) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(READ_BATCH_SIZE, total - start) }, (_, offset) =>
        readTemper("get_agreement_id_at", [BigInt(start + offset)], priority),
      ),
    );
    ids.push(...batch);
  }
  const agreements: Agreement[] = [];
  for (let start = 0; start < ids.length; start += READ_BATCH_SIZE) {
    const batch = await Promise.all(
      ids
        .slice(start, start + READ_BATCH_SIZE)
        .map((id) => getAgreementFromKnownId(String(id), wallet, priority)),
    );
    for (const agreement of batch) {
      if (agreement) agreements.push(agreement);
    }
  }
  return agreements;
}

export async function enumerateCases(
  wallet?: Address,
  priority: ReadPriority = "normal",
): Promise<TemperCase[]> {
  const agreements = await enumerateAgreements(wallet, priority);
  return agreements
    .filter((agreement) => agreement.caseOverview && CASE_STATUSES.has(agreement.status))
    .map((agreement) => agreement.caseOverview as CaseOverview);
}

function wholeGen(value: string) {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized) || normalized === "0")
    throw new Error("Enter a positive whole GEN amount.");
  return BigInt(normalized);
}

export function buildCreateAgreement(
  input: CreateAgreementInput,
  agreementId: string,
): ContractWrite {
  const service = input.service.trim();
  const mitigation = input.fallback.trim();
  const policy = input.availabilityRule.trim();
  if (!service || !mitigation || !policy)
    throw new Error("Complete the agreement terms before creating it.");
  return {
    kind: "write",
    address: TEMPER_CONTRACT_ADDRESS,
    method: "create_agreement",
    args: [
      input.otherParty.trim(),
      service,
      mitigation,
      policy,
      agreementId,
      DEMO_LIABILITY_SOURCE_ADDRESS,
      wholeGen(input.bond),
      wholeGen(input.lengthDays),
    ],
  };
}

export const buildAcceptAgreement = (id: string): ContractWrite => ({
  kind: "write",
  address: TEMPER_CONTRACT_ADDRESS,
  method: "accept_agreement",
  args: [id],
});

export function buildFundBond(id: string, coverageLimitWei: bigint): ContractWrite {
  return {
    kind: "write",
    address: TEMPER_CONTRACT_ADDRESS,
    method: "fund_bond",
    args: [id],
    value: coverageLimitWei,
  };
}

export function buildDemoLiability(
  sourceAddress: string,
  receiptId: string,
  agreementId: string,
  provider: string,
  claimant: string,
  breachTimestamp: bigint,
  totalLoss: bigint,
  lossRecordedAt: bigint,
): ContractWrite {
  return {
    kind: "write",
    address: sourceAddress as Address,
    method: "create_demo_liability",
    args: [receiptId, agreementId, provider, claimant, breachTimestamp, totalLoss, lossRecordedAt],
  };
}

export const buildOpenClaim = (id: string, receiptId: string): ContractWrite => ({
  kind: "write",
  address: TEMPER_CONTRACT_ADDRESS,
  method: "open_claim",
  args: [id, receiptId],
});
export const buildSubmitMitigation = (
  id: string,
  availableAt: bigint,
  note: string,
  url1: string,
  hash1: string,
  url2: string,
  hash2: string,
): ContractWrite => ({
  kind: "write",
  address: TEMPER_CONTRACT_ADDRESS,
  method: "submit_mitigation",
  args: [id, availableAt, note, url1, hash1, url2, hash2],
});
export const buildDisputeMitigation = (
  id: string,
  response: string,
  url: string,
  hash: string,
): ContractWrite => ({
  kind: "write",
  address: TEMPER_CONTRACT_ADDRESS,
  method: "dispute_mitigation",
  args: [id, response, url, hash],
});
export const buildRequestJudgment = (id: string): ContractWrite => ({
  kind: "write",
  address: TEMPER_CONTRACT_ADDRESS,
  method: "request_judgment",
  args: [id],
});
export const buildRequestPayout = (id: string): ContractWrite => ({
  kind: "write",
  address: TEMPER_CONTRACT_ADDRESS,
  method: "request_payout",
  args: [id],
});
export const buildWithdrawBond = (id: string): ContractWrite => ({
  kind: "write",
  address: TEMPER_CONTRACT_ADDRESS,
  method: "withdraw_remaining_bond",
  args: [id],
});
export const buildTriggerTimeout = (id: string): ContractWrite => ({
  kind: "write",
  address: TEMPER_CONTRACT_ADDRESS,
  method: "trigger_timeout",
  args: [id],
});

export const roleLabel = (role: UserRole) => (role === "Other party" ? "Other party" : role);
export const amountLabel = (amount: bigint) => `${formatGen(amount)} GEN`;
export const addressLabel = (address: string) => shortAddress(address);

export const temperAdapter = {
  enumerateAgreements,
  getAgreement,
  enumerateCases,
  getCaseOverview,
  agreementExists,
};
