import type { Address } from "viem";
import { STUDIO_NEXT_CHAIN_ID } from "@/lib/genlayer/network";
import { TEMPER_CONTRACT_ADDRESS } from "@/lib/temper/contracts";

export const GEN_WEI = 10n ** 18n;

export function parseWholeGen(value: string): bigint {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) throw new Error("Enter a whole GEN amount.");
  const amount = BigInt(normalized);
  if (amount === 0n) throw new Error("Amount must be greater than zero.");
  return amount * GEN_WEI;
}

export function parseGenOrZero(value: string): bigint {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) throw new Error("Enter a whole GEN amount.");
  return BigInt(normalized) * GEN_WEI;
}

export function formatGen(wei: bigint): string {
  const negative = wei < 0n;
  const absolute = negative ? -wei : wei;
  const whole = absolute / GEN_WEI;
  const fraction = (absolute % GEN_WEI).toString().padStart(18, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function securedLoss(totalLoss: bigint, bond: bigint): bigint {
  return totalLoss < bond ? totalLoss : bond;
}

export function outsideTemperBond(totalLoss: bigint, bond: bigint): bigint {
  return totalLoss > bond ? totalLoss - bond : 0n;
}

export function unusedBond(totalLoss: bigint, bond: bigint): bigint {
  return bond - securedLoss(totalLoss, bond);
}

export function avoidableSecuredLoss(
  totalLoss: bigint,
  bond: bigint,
  lossAtMitigation: bigint,
): bigint {
  const secured = securedLoss(totalLoss, bond);
  const recoverable = lossAtMitigation < secured ? lossAtMitigation : secured;
  return secured - recoverable;
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

export function toAddress(value: unknown): Address {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error("Contract returned an invalid address.");
  }
  return value as Address;
}

export function toBigInt(value: unknown, field: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  throw new Error(`Contract returned an invalid ${field}.`);
}

export function unixNow(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

export async function createLiabilityReceiptId(
  agreementId: string,
  chainId = STUDIO_NEXT_CHAIN_ID,
  temperAddress: string = TEMPER_CONTRACT_ADDRESS,
): Promise<string> {
  const input = `TEMPER-LIABILITY-V1|${chainId}|${temperAddress.toLowerCase()}|${agreementId}`;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `LIABILITY-${hash}`;
}
