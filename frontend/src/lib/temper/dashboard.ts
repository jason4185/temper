import type { Agreement } from "./types";

type WalletParticipant = Pick<Agreement, "provider" | "otherParty">;

type DashboardAgreementAction = Pick<Agreement, "status" | "role" | "caseId" | "nextAction">;

/** Keep personal dashboard workspaces limited to agreements involving this wallet. */
export function scopeAgreementsForWallet<T extends WalletParticipant>(
  agreements: T[],
  wallet?: string,
): T[] {
  if (!wallet) return [];
  const normalizedWallet = wallet.toLowerCase();
  return agreements.filter(
    (agreement) =>
      agreement.provider.toLowerCase() === normalizedWallet ||
      agreement.otherParty.toLowerCase() === normalizedWallet,
  );
}

/** Sum the bond balances currently held by TEMPER for the dashboard. */
export function currentSecuredBond(agreements: Pick<Agreement, "remainingBond">[]): bigint {
  return agreements.reduce((total, agreement) => total + agreement.remainingBond, 0n);
}

/** Sum only the current bond balances funded by this wallet. */
export function currentWalletLockedBond(
  agreements: Pick<Agreement, "provider" | "remainingBond">[],
  wallet?: string,
): bigint {
  if (!wallet) return 0n;
  const normalizedWallet = wallet.toLowerCase();
  return currentSecuredBond(
    agreements.filter((agreement) => agreement.provider.toLowerCase() === normalizedWallet),
  );
}

/** Return whether an agreement is waiting on a required action from this wallet. */
export function requiresDashboardAction(agreement: DashboardAgreementAction): boolean {
  if (!agreement.nextAction || agreement.nextAction.label.startsWith("Waiting")) return false;

  // Starting a demo case is optional claimant-side initiation, not a required protocol step.
  // Keep it visible on the agreement card, but out of the action queue.
  if (agreement.status === "ACTIVE" && agreement.role === "Other party" && !agreement.caseId) {
    return false;
  }

  return true;
}
