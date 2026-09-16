import { studioDevnet } from "genlayer-js/chains";
import type { GenLayerChain } from "@genlayer/transaction-kit";

export const STUDIO_NEXT_CHAIN_ID = 61997;
export const STUDIO_NEXT_RPC_URL =
  import.meta.env["VITE_GENLAYER_RPC_URL"] || "https://studio-dev.genlayer.com/api";
export const STUDIO_NEXT_EXPLORER_URL = "https://explorer-studio-dev.genlayer.com";

export const studioNext = {
  ...studioDevnet,
  id: STUDIO_NEXT_CHAIN_ID,
  name: "GenLayer Studio Dev",
  rpcUrls: {
    default: {
      http: [STUDIO_NEXT_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: "GenLayer Studio Explorer",
      url: STUDIO_NEXT_EXPLORER_URL,
    },
  },
} satisfies GenLayerChain;

export const explorerTransactionUrl = (txId: string) => `${STUDIO_NEXT_EXPLORER_URL}/tx/${txId}`;

export const studioNextChainIdHex = `0x${STUDIO_NEXT_CHAIN_ID.toString(16)}`;
