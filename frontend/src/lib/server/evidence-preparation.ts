export const MAX_EVIDENCE_BYTES = 8192;
export const EVIDENCE_FETCH_TIMEOUT_MS = 10_000;
export const MAX_EVIDENCE_REDIRECTS = 3;

const MAX_URL_LENGTH = 2048;
const DNS_JSON_ENDPOINT = "https://cloudflare-dns.com/dns-query";

type EvidenceErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_URL"
  | "UNSUPPORTED_PROTOCOL"
  | "BLOCKED_HOST"
  | "PRIVATE_ADDRESS"
  | "DNS_FAILED"
  | "EVIDENCE_TIMEOUT"
  | "EVIDENCE_UNREACHABLE"
  | "EVIDENCE_REDIRECT"
  | "EVIDENCE_HTTP_ERROR"
  | "EVIDENCE_TOO_LARGE"
  | "EVIDENCE_EMPTY"
  | "EVIDENCE_INTERNAL";

export class EvidencePreparationError extends Error {
  readonly code: EvidenceErrorCode;
  readonly status: number;

  constructor(code: EvidenceErrorCode, message: string, status: number) {
    super(message);
    this.name = "EvidencePreparationError";
    this.code = code;
    this.status = status;
  }
}

export interface PreparedEvidenceResult {
  url: string;
  sha256: string;
  size: number;
}

export async function prepareEvidenceFromUrl(
  rawUrl: string,
  dependencies: {
    fetchImpl?: typeof fetch;
    dnsFetchImpl?: typeof fetch;
  } = {},
): Promise<PreparedEvidenceResult> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const dnsFetchImpl = dependencies.dnsFetchImpl ?? fetch;
  let currentUrl = parseEvidenceUrl(rawUrl);

  for (let redirectCount = 0; ; redirectCount += 1) {
    await assertPublicTarget(currentUrl.hostname, dnsFetchImpl);
    const { response, body } = await fetchWithTimeout(
      fetchImpl,
      currentUrl.toString(),
      {
        headers: { accept: "*/*" },
        credentials: "omit",
        cache: "no-store",
        redirect: "manual",
      },
      consumeEvidenceBody,
    );

    if (isRedirect(response.status)) {
      if (redirectCount >= MAX_EVIDENCE_REDIRECTS) {
        throw new EvidencePreparationError(
          "EVIDENCE_REDIRECT",
          "The evidence URL redirected too many times.",
          400,
        );
      }
      const location = response.headers.get("location");
      if (!location) {
        throw new EvidencePreparationError(
          "EVIDENCE_REDIRECT",
          "The evidence URL returned an invalid redirect.",
          502,
        );
      }
      currentUrl = parseEvidenceUrl(new URL(location, currentUrl).toString());
      continue;
    }

    if (!response.ok) {
      throw new EvidencePreparationError(
        "EVIDENCE_HTTP_ERROR",
        `The evidence URL returned an HTTP ${response.status} response.`,
        502,
      );
    }
    if (!body || body.byteLength === 0) {
      throw new EvidencePreparationError(
        "EVIDENCE_EMPTY",
        "The evidence URL returned an empty response.",
        400,
      );
    }

    const digestInput = new ArrayBuffer(body.byteLength);
    new Uint8Array(digestInput).set(body);
    const digest = await crypto.subtle.digest("SHA-256", digestInput);
    const sha256 = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return { url: currentUrl.toString(), sha256, size: body.byteLength };
  }
}

export async function readBoundedBody(
  source: Pick<Request, "body" | "headers"> | Pick<Response, "body" | "headers">,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const contentLength = Number(source.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new EvidencePreparationError(
      "EVIDENCE_TOO_LARGE",
      `The evidence is larger than the ${maxBytes}-byte limit.`,
      413,
    );
  }

  if (!source.body) return new Uint8Array();
  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      if (signal?.aborted) {
        throw new EvidencePreparationError(
          "EVIDENCE_TIMEOUT",
          "The evidence request timed out. Check that the URL responds promptly and try again.",
          504,
        );
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new EvidencePreparationError(
          "EVIDENCE_TOO_LARGE",
          `The evidence is larger than the ${maxBytes}-byte limit.`,
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function assertPublicTarget(hostname: string, dnsFetchImpl: typeof fetch) {
  const normalizedHostname = normalizeHostname(hostname);
  if (isBlockedHostname(normalizedHostname)) {
    throw new EvidencePreparationError(
      "BLOCKED_HOST",
      "The evidence URL must be publicly accessible. Private and local network addresses are not supported.",
      400,
    );
  }

  const literalAddress = parseIpLiteral(normalizedHostname);
  if (literalAddress && isPrivateIp(literalAddress)) {
    throw new EvidencePreparationError(
      "PRIVATE_ADDRESS",
      "The evidence URL must be publicly accessible. Private and local network addresses are not supported.",
      400,
    );
  }
  if (literalAddress) return;

  const addresses = await resolveDns(normalizedHostname, dnsFetchImpl);
  if (
    addresses.some((address) => {
      const parsed = parseIpLiteral(address);
      return !parsed || isPrivateIp(parsed);
    })
  ) {
    throw new EvidencePreparationError(
      "PRIVATE_ADDRESS",
      "The evidence URL must be publicly accessible. Private and local network addresses are not supported.",
      400,
    );
  }
}

async function resolveDns(hostname: string, dnsFetchImpl: typeof fetch): Promise<string[]> {
  const addresses = new Set<string>();
  for (const type of ["A", "AAAA"]) {
    const endpoint = new URL(DNS_JSON_ENDPOINT);
    endpoint.searchParams.set("name", hostname);
    endpoint.searchParams.set("type", type);
    const { response, body } = await fetchWithTimeout(
      dnsFetchImpl,
      endpoint.toString(),
      {
        headers: { accept: "application/dns-json" },
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
      },
      (result, signal) => readBoundedBody(result, 64 * 1024, signal),
    );
    if (!response.ok || !body) {
      throw new EvidencePreparationError(
        "DNS_FAILED",
        "The evidence URL could not be resolved. Check that the domain is publicly accessible and try again.",
        502,
      );
    }
    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(body));
    } catch {
      throw new EvidencePreparationError(
        "DNS_FAILED",
        "The evidence URL could not be resolved. Check that the domain is publicly accessible and try again.",
        502,
      );
    }
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("Answer" in payload) ||
      !Array.isArray(payload.Answer)
    ) {
      continue;
    }
    for (const answer of payload.Answer) {
      if (
        typeof answer === "object" &&
        answer !== null &&
        "type" in answer &&
        "data" in answer &&
        (answer.type === 1 || answer.type === 28) &&
        typeof answer.data === "string"
      ) {
        addresses.add(normalizeHostname(answer.data));
      }
    }
  }
  if (!addresses.size) {
    throw new EvidencePreparationError(
      "DNS_FAILED",
      "The evidence URL could not be resolved. Check that the domain is publicly accessible and try again.",
      502,
    );
  }
  return [...addresses];
}

async function fetchWithTimeout<T>(
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit,
  consume?: (response: Response, signal: AbortSignal) => Promise<T>,
): Promise<{ response: Response; body: T | undefined }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EVIDENCE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(input, { ...init, signal: controller.signal });
    const body = consume ? await consume(response, controller.signal) : undefined;
    if (!consume) await response.body?.cancel();
    return { response, body };
  } catch (reason) {
    if (reason instanceof EvidencePreparationError) throw reason;
    if (controller.signal.aborted) {
      throw new EvidencePreparationError(
        "EVIDENCE_TIMEOUT",
        "The evidence request timed out. Check that the URL responds promptly and try again.",
        504,
      );
    }
    throw new EvidencePreparationError(
      "EVIDENCE_UNREACHABLE",
      "The evidence URL could not be reached. Check that it is publicly accessible over HTTPS and try again.",
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function consumeEvidenceBody(
  response: Response,
  signal: AbortSignal,
): Promise<Uint8Array | undefined> {
  if (isRedirect(response.status)) {
    await response.body?.cancel();
    return undefined;
  }
  return readBoundedBody(response, MAX_EVIDENCE_BYTES, signal);
}

function parseEvidenceUrl(rawUrl: string): URL {
  if (typeof rawUrl !== "string" || rawUrl.length === 0 || rawUrl.length > MAX_URL_LENGTH) {
    throw new EvidencePreparationError("INVALID_URL", "Enter a valid evidence URL.", 400);
  }
  if (rawUrl !== rawUrl.trim()) {
    throw new EvidencePreparationError("INVALID_URL", "Enter a valid evidence URL.", 400);
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new EvidencePreparationError("INVALID_URL", "Enter a valid evidence URL.", 400);
  }
  if (url.protocol !== "https:") {
    throw new EvidencePreparationError("UNSUPPORTED_PROTOCOL", "Enter an HTTPS evidence URL.", 400);
  }
  if (url.username || url.password || url.hash || !url.hostname) {
    throw new EvidencePreparationError("INVALID_URL", "Enter a valid evidence URL.", 400);
  }
  const hostname = normalizeHostname(url.hostname);
  if (isBlockedHostname(hostname)) {
    throw new EvidencePreparationError(
      "BLOCKED_HOST",
      "The evidence URL must be publicly accessible. Private and local network addresses are not supported.",
      400,
    );
  }
  const literalAddress = parseIpLiteral(hostname);
  if (literalAddress && isPrivateIp(literalAddress)) {
    throw new EvidencePreparationError(
      "PRIVATE_ADDRESS",
      "The evidence URL must be publicly accessible. Private and local network addresses are not supported.",
      400,
    );
  }
  return url;
}

function isRedirect(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");
}

function isBlockedHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "localhost.localdomain" ||
    hostname === "metadata" ||
    hostname === "metadata.google.internal" ||
    hostname === "instance-data" ||
    hostname === "host.docker.internal" ||
    hostname === "kubernetes.default" ||
    hostname === "kubernetes.default.svc" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan") ||
    hostname.endsWith(".intranet")
  );
}

type IpAddress = { kind: "ipv4"; value: number } | { kind: "ipv6"; value: bigint };

function parseIpLiteral(hostname: string): IpAddress | undefined {
  const ipv4 = parseIpv4(hostname);
  if (ipv4 !== undefined) return { kind: "ipv4", value: ipv4 };
  if (!hostname.includes(":")) return undefined;
  const ipv6 = parseIpv6(hostname);
  if (ipv6 === undefined) {
    throw new EvidencePreparationError("INVALID_URL", "Enter a valid evidence URL.", 400);
  }
  return { kind: "ipv6", value: ipv6 };
}

function parseIpv4(value: string): number | undefined {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return undefined;
  const parts = value.split(".").map(Number);
  if (parts.some((part) => part > 255)) return undefined;
  const [first, second, third, fourth] = parts;
  if (first === undefined || second === undefined || third === undefined || fourth === undefined) {
    return undefined;
  }
  return (((first * 256 + second) * 256 + third) * 256 + fourth) >>> 0;
}

function parseIpv6(value: string): bigint | undefined {
  let normalized = value.toLowerCase();
  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    const ipv4 = parseIpv4(normalized.slice(lastColon + 1));
    if (lastColon < 0 || ipv4 === undefined) return undefined;
    normalized = `${normalized.slice(0, lastColon + 1)}${(ipv4 >>> 16).toString(16)}:${(
      ipv4 & 0xffff
    ).toString(16)}`;
  }

  const sections = normalized.split("::");
  if (sections.length > 2) return undefined;
  const left = sections[0] ? sections[0].split(":") : [];
  const right = sections.length === 2 && sections[1] ? sections[1].split(":") : [];
  if (sections.length === 1 && left.length !== 8) return undefined;
  if (left.length + right.length > 8) return undefined;
  const values = [
    ...left,
    ...Array.from(
      { length: sections.length === 2 ? 8 - left.length - right.length : 0 },
      () => "0",
    ),
    ...right,
  ];
  if (values.length !== 8 || values.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return undefined;
  return values.reduce((result, part) => (result << 16n) | BigInt(`0x${part}`), 0n);
}

function isPrivateIp(address: IpAddress): boolean {
  if (address.kind === "ipv4") {
    const first = address.value >>> 24;
    const second = (address.value >>> 16) & 255;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 0) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 198 && second === 51) ||
      (first === 203 && second === 0 && ((address.value >>> 8) & 255) === 113) ||
      first >= 224
    );
  }

  const value = address.value;
  const prefix7 = value >> 121n;
  const prefix8 = value >> 120n;
  const prefix10 = value >> 118n;
  const mappedIpv4 = value >> 32n === 0xffffn ? Number(value & 0xffffffffn) : undefined;
  return (
    value === 0n ||
    value === 1n ||
    prefix7 === 0x7en ||
    prefix8 === 0xffn ||
    prefix10 === 0x3fan ||
    value >> 32n === 0x20010db8n ||
    (mappedIpv4 !== undefined && isPrivateIp({ kind: "ipv4", value: mappedIpv4 }))
  );
}
