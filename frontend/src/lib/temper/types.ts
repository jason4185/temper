import type { Address } from "viem";

export type AgreementStatus =
  | "PROPOSED"
  | "ACCEPTED"
  | "ACTIVE"
  | "CLAIM_OPEN"
  | "MITIGATION_CHALLENGED"
  | "MITIGATION_DISPUTED"
  | "JUDGMENT_PENDING"
  | "RESOLVED"
  | "SETTLED"
  | "CLOSED";
export type CaseStatus = Exclude<AgreementStatus, "PROPOSED" | "ACCEPTED" | "ACTIVE">;
export type ContractStatus = AgreementStatus;
export type Verdict = "VALID_MITIGATION" | "INVALID_MITIGATION" | "UNDETERMINED";
export type UserRole = "Provider" | "Other party" | "Observer";

export interface Evidence {
  id: string;
  side: "provider" | "other-party";
  source: string;
  description: string;
  status: "Submitted" | "Challenged" | "Accepted";
  submittedAt: string;
  hash: string;
}

export interface NextAction {
  label: string;
  description: string;
  kind: "agreement" | "case";
}

export interface Agreement {
  id: string;
  title: string;
  role: UserRole;
  status: AgreementStatus;
  provider: string;
  otherParty: string;
  mainSource: string;
  backupSource: string;
  asset: string;
  bond: bigint;
  coverageLimitWei: bigint;
  lengthDays?: bigint;
  agreementExpiry: bigint;
  totalBondFunded: bigint;
  amountAlreadyPaid: bigint;
  amountWithdrawn: bigint;
  remainingBond: bigint;
  nextAction?: NextAction | undefined;
  caseId?: string | undefined;
  caseOverview?: CaseOverview | undefined;
  serviceDescription: string;
  mitigationCovenant: string;
  allowedMitigationPolicy: string;
  trustedLiabilitySource: string;
}

export interface TemperCase {
  id: string;
  agreementId: string;
  title: string;
  role: UserRole;
  status: CaseStatus;
  bond: bigint;
  confirmedLoss: bigint;
  lossAtBackup: bigint;
  backupSource: string;
  verdict?: Verdict | undefined;
  recoverableAmount: bigint;
  avoidableAmount: bigint;
  providerRemainder: bigint;
  amountWithdrawn: bigint;
  remainingBond: bigint;
  evidence: Evidence[];
  claimantResponse?: string;
  openedAt: string;
  nextAction?: NextAction | undefined;
  resolutionBasis: string;
  stageDeadline: bigint;
  provider: string;
  otherParty: string;
  liabilityReceiptId: string;
  establishedBreachTimestamp: bigint;
  trustedLiabilitySource: string;
}

export interface CaseOverview extends TemperCase {
  mitigationAvailableAt: bigint;
  allowedMitigationPolicy: string;
}

export interface CreateAgreementInput {
  kind: "price-feed" | "custom";
  otherParty: string;
  service: string;
  fallback: string;
  availabilityRule: string;
  bond: string;
  lengthDays: string;
  mainSource?: string;
  backupSource?: string;
  asset?: string;
}

export interface ContractWrite {
  kind: "write";
  address: Address;
  method: string;
  args: unknown[];
  value?: bigint;
}
