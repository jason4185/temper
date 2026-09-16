import type { FeeSuggestions } from "@genlayer/transaction-kit";

/**
 * Measured Studio Dev fee profile for TEMPER's two external-transfer writes.
 *
 * The message allocation itself is recipient-dependent, so it is completed by
 * the address-aware fee adapter immediately before signing. These values seed
 * the existing Transaction Kit policy estimate and keep the external-message
 * budget non-zero for both methods.
 */
export const TEMPER_FEE_PROFILE: FeeSuggestions = {
  version: 1,
  chainId: 61997,
  network: "studio-dev",
  measuredAt: "2026-09-15",
  methods: {
    request_payout: {
      leaderTimeunitsAllocation: "100",
      validatorTimeunitsAllocation: "200",
      executionBudgetPerRound: "303132300000000",
      totalMessageFees: "150000000000000",
      rotationsPerRound: "3",
    },
    withdraw_remaining_bond: {
      leaderTimeunitsAllocation: "100",
      validatorTimeunitsAllocation: "200",
      executionBudgetPerRound: "303132300000000",
      totalMessageFees: "150000000000000",
      rotationsPerRound: "3",
    },
  },
};
