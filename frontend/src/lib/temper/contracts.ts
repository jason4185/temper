import type { Address } from "viem";

export const TEMPER_CONTRACT_ADDRESS = (import.meta.env["VITE_TEMPER_CONTRACT_ADDRESS"] ||
  "0x1f156EB776698C283774Bfb7d2B9608257d6c47d") as Address;
export const DEMO_LIABILITY_SOURCE_ADDRESS = (import.meta.env[
  "VITE_DEMO_LIABILITY_SOURCE_ADDRESS"
] || "0x357c1a93EaEA2B4FcC1Bc706EF478A0Bb9A794a9") as Address;

export const TEMPER_CONTRACT = TEMPER_CONTRACT_ADDRESS;
export const LOSS_RECORD_SOURCE = DEMO_LIABILITY_SOURCE_ADDRESS;

export function isSupportedDemoLiabilitySource(source: string | undefined): boolean {
  return Boolean(source && source.toLowerCase() === DEMO_LIABILITY_SOURCE_ADDRESS.toLowerCase());
}
