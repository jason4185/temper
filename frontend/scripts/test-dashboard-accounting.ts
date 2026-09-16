import { strict as assert } from "node:assert";
import {
  currentSecuredBond,
  currentWalletLockedBond,
  requiresDashboardAction,
  scopeAgreementsForWallet,
} from "../src/lib/temper/dashboard";

const agreement = (remainingBond: bigint) => ({ remainingBond });

assert.equal(currentSecuredBond([agreement(8n)]), 8n);
assert.equal(currentSecuredBond([agreement(3n)]), 3n);
assert.equal(currentSecuredBond([agreement(0n)]), 0n);
assert.equal(currentSecuredBond([agreement(8n), agreement(3n), agreement(0n)]), 11n);

const provider = "0xProvider";
const otherParty = "0xOtherParty";
const observer = "0xObserver";
const fundedAgreement = (remainingBond: bigint) => ({
  provider,
  otherParty,
  remainingBond,
});

assert.equal(scopeAgreementsForWallet([fundedAgreement(10n)], provider).length, 1);
assert.equal(scopeAgreementsForWallet([fundedAgreement(10n)], otherParty).length, 1);
assert.equal(scopeAgreementsForWallet([fundedAgreement(10n)], observer).length, 0);
assert.equal(currentWalletLockedBond([fundedAgreement(10n)], provider), 10n);
assert.equal(currentWalletLockedBond([fundedAgreement(10n)], otherParty), 0n);
assert.equal(currentWalletLockedBond([fundedAgreement(10n)], observer), 0n);

assert.equal(
  requiresDashboardAction({
    status: "ACTIVE",
    role: "Other party",
    caseId: undefined,
    nextAction: {
      label: "Start Demo Case",
      description: "Create a confirmed-loss test record and open a case.",
      kind: "agreement",
    },
  }),
  false,
);
assert.equal(
  requiresDashboardAction({
    status: "ACCEPTED",
    role: "Provider",
    caseId: undefined,
    nextAction: {
      label: "Fund Bond",
      description: "Fund the exact agreed bond to activate the agreement.",
      kind: "agreement",
    },
  }),
  true,
);

console.log("Dashboard current secured-bond aggregation assertions passed.");
