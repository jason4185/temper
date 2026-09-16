import { createClient } from "genlayer-js";
import type { Eip1193Provider } from "@genlayer/transaction-kit";
import type { Address } from "viem";
import { studioNext } from "./network";

export type BrowserProvider = Eip1193Provider;

let readClient: ReturnType<typeof createClient> | undefined;

export function getReadClient() {
  readClient ??= createClient({ chain: studioNext });
  return readClient;
}

export function getConnectedClient(provider: BrowserProvider, account: Address) {
  return createClient({ chain: studioNext, provider, account });
}

export function getInjectedProvider(): BrowserProvider | undefined {
  if (typeof window === "undefined") return undefined;
  const provider = (window as Window & { ethereum?: BrowserProvider }).ethereum;
  return provider;
}
