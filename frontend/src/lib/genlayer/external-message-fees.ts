import type {
  PolicyInput,
  PolicyQuote,
  SubmitInput,
  TransactionKit,
} from "@genlayer/transaction-kit";
import type { MessageFeeAllocationInput } from "genlayer-js/types";
import type { getConnectedClient } from "./client";

type Client = ReturnType<typeof getConnectedClient>;

type MessageAwareQuote = PolicyQuote & {
  messageAllocations?: MessageFeeAllocationInput[];
};

const EXTERNAL_TRANSFER_METHODS = new Set(["request_payout", "withdraw_remaining_bond"]);

function usesExternalTransfer(
  tx: SubmitInput | undefined,
): tx is Extract<SubmitInput, { kind: "write" }> {
  return tx?.kind === "write" && EXTERNAL_TRANSFER_METHODS.has(tx.method);
}

function leaderRounds(distribution: PolicyQuote["distribution"]) {
  return distribution.rotations.reduce((total, rotations) => total + rotations + 1n, 1n);
}

function buildBreakdown(estimate: { distribution: PolicyQuote["distribution"]; feeValue: bigint }) {
  const messageFees = estimate.distribution.totalMessageFees;
  const executionBudget =
    estimate.distribution.executionBudgetPerRound * leaderRounds(estimate.distribution);
  const timeUnitFees = estimate.feeValue - messageFees - executionBudget;
  return {
    timeUnitFees: timeUnitFees > 0n ? timeUnitFees : 0n,
    executionBudget,
    messageFees,
  };
}

function feeEstimateOptions(baseQuote: PolicyQuote, tx: Extract<SubmitInput, { kind: "write" }>) {
  const distribution = baseQuote.distribution;
  return {
    address: tx.address,
    functionName: tx.method,
    ...(tx.args === undefined ? {} : { args: tx.args as never[] }),
    value: baseQuote.userValue,
    leaderTimeunitsAllocation: distribution.leaderTimeunitsAllocation,
    validatorTimeunitsAllocation: distribution.validatorTimeunitsAllocation,
    appealRounds: distribution.appealRounds,
    executionBudgetPerRound: distribution.executionBudgetPerRound,
    totalMessageFees: distribution.totalMessageFees,
    rotations: distribution.rotations,
    maxPriceGenPerTimeUnit: distribution.maxPriceGenPerTimeUnit,
    storageFeeMaxGasPrice: distribution.storageFeeMaxGasPrice,
    receiptFeeMaxGasPrice: distribution.receiptFeeMaxGasPrice,
  };
}

/**
 * Keeps the installed Transaction Kit policy flow while preserving the
 * dynamic external-message allocation returned by genlayer-js. The current
 * kit release exposes the allocation during estimation but does not forward it
 * when submitting, so these two transfer methods use the public SDK write
 * path with the measured allocation attached.
 */
export function withExternalMessageFees(baseKit: TransactionKit, client: Client): TransactionKit {
  const wrapped: TransactionKit = {
    ...(baseKit.allowUnverified ? { allowUnverified: true } : {}),
    estimate: async (input: PolicyInput, tx?: SubmitInput) => {
      const baseQuote = await baseKit.estimate(input, tx);
      if (!usesExternalTransfer(tx)) return baseQuote;

      const measured = await client.estimateTransactionFeesForWrite(
        feeEstimateOptions(baseQuote, tx),
      );
      if (!measured.messageAllocations?.length) {
        throw new Error(`No external-message fee allocation was returned for ${tx.method}.`);
      }

      const quote: MessageAwareQuote = {
        ...baseQuote,
        distribution: measured.distribution,
        feeValue: measured.feeValue,
        total: measured.feeValue + baseQuote.userValue,
        breakdown: buildBreakdown(measured),
        caps: {
          genPerTimeUnit: measured.distribution.maxPriceGenPerTimeUnit,
          storagePrice: measured.distribution.storageFeeMaxGasPrice,
          receiptPrice: measured.distribution.receiptFeeMaxGasPrice,
        },
        messageAllocations: measured.messageAllocations,
      };
      return quote;
    },
    submit: async (quote: PolicyQuote, tx: SubmitInput) => {
      if (!usesExternalTransfer(tx)) return baseKit.submit(quote, tx);

      const messageAllocations = (quote as MessageAwareQuote).messageAllocations;
      if (!messageAllocations?.length) {
        throw new Error(`No external-message fee allocation is available for ${tx.method}.`);
      }

      const genlayerTxId = await client.writeContract({
        address: tx.address,
        functionName: tx.method,
        ...(tx.args === undefined ? {} : { args: tx.args as never[] }),
        value: quote.userValue,
        fees: {
          distribution: quote.distribution,
          messageAllocations,
          feeValue: quote.feeValue,
        },
      });
      return { genlayerTxId };
    },
    cancel: baseKit.cancel,
    topUp: baseKit.topUp,
    track: baseKit.track,
    verification: baseKit.verification,
  };

  return wrapped;
}
