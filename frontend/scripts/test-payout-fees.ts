import { strict as assert } from "node:assert";
import type { PolicyQuote, TransactionKit } from "@genlayer/transaction-kit";
import { withExternalMessageFees } from "../src/lib/genlayer/external-message-fees";
import { TEMPER_FEE_PROFILE } from "../src/lib/genlayer/fee-profile";

for (const method of ["request_payout", "withdraw_remaining_bond"]) {
  const suggestedFees = TEMPER_FEE_PROFILE.methods?.[method];
  assert.ok(suggestedFees);
  assert.equal(suggestedFees.totalMessageFees, "150000000000000");
}

const allocation = {
  messageType: 0 as const,
  onAcceptance: false,
  parentIndex: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  recipient: "0x1111111111111111111111111111111111111111" as const,
  callKey: "0x0000000000000000000000000000000000000000000000000000000000000000" as const,
  budget: "150000000000000",
  feeParams: "0x00" as const,
};

const distribution = {
  leaderTimeunitsAllocation: 100n,
  validatorTimeunitsAllocation: 200n,
  appealRounds: 0n,
  executionBudgetPerRound: 303132300000000n,
  executionConsumed: 0n,
  totalMessageFees: 150000000000000n,
  rotations: [3n],
  maxPriceGenPerTimeUnit: 2n,
  storageFeeMaxGasPrice: 300000000n,
  receiptFeeMaxGasPrice: 300000000n,
};

const baseQuote: PolicyQuote = {
  distribution,
  feeValue: 500000000000000n,
  userValue: 0n,
  total: 500000000000000n,
  source: "developer",
  verification: { status: "verified" },
  breakdown: {
    timeUnitFees: 1n,
    executionBudget: 1n,
    messageFees: 1n,
  },
  caps: { genPerTimeUnit: 2n, storagePrice: 300000000n, receiptPrice: 300000000n },
  refundable: true,
};

let submittedFees: unknown;
const baseKit = {
  estimate: async () => baseQuote,
  submit: async () => {
    throw new Error("base submit must not be used for payout writes");
  },
  cancel: async () => ({ transaction_hash: "", status: "" }),
  topUp: async () => "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as const,
  track: async () => ({ phase: "decided" as const, genlayerTxId: "0x1234" as const }),
  verification: () => ({ feeConfigHash: "0x00" as `0x${string}`, summary: {} }),
} as unknown as TransactionKit;

const client = {
  estimateTransactionFeesForWrite: async (args: { functionName: string }) => {
    assert.ok(["request_payout", "withdraw_remaining_bond"].includes(args.functionName));
    return {
      distribution,
      feeValue: 500000000000000n,
      messageAllocations: [allocation],
      policy: {
        enabled: true,
        genPerTimeUnit: 2n,
        storageUnitPrice: 300000000n,
        receiptGasPrice: 300000000n,
        executionBudgetFloor: 0n,
      },
    };
  },
  writeContract: async (args: { fees?: unknown }) => {
    submittedFees = args.fees;
    return "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd" as const;
  },
} as never;

const kit = withExternalMessageFees(baseKit, client);

for (const method of ["request_payout", "withdraw_remaining_bond"]) {
  const tx = {
    kind: "write" as const,
    address: "0x2222222222222222222222222222222222222222" as const,
    method,
    args: ["agreement-id"],
  };
  const quote = await kit.estimate({ preset: "standard" }, tx);
  const messageAllocations = (quote as PolicyQuote & { messageAllocations: unknown[] })
    .messageAllocations;
  assert.equal(messageAllocations.length, 1);
  assert.equal((messageAllocations[0] as { messageType: number }).messageType, 0);
  const result = await kit.submit(quote, tx);
  assert.match(result.genlayerTxId, /^0x[0-9a-f]+$/u);
  assert.equal((submittedFees as { messageAllocations: unknown[] }).messageAllocations.length, 1);
}

console.log("Payout fee preparation: external allocation present for both methods.");
