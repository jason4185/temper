import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createTransactionKit, type TransactionKit } from "@genlayer/transaction-kit";
import { Copy, ExternalLink, LogOut } from "lucide-react";
import type { Address } from "viem";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getConnectedClient, getInjectedProvider, type BrowserProvider } from "./client";
import { TEMPER_FEE_PROFILE } from "./fee-profile";
import { shortAddress } from "@/lib/temper/format";
import {
  STUDIO_NEXT_CHAIN_ID,
  STUDIO_NEXT_RPC_URL,
  STUDIO_NEXT_EXPLORER_URL,
  studioNext,
  studioNextChainIdHex,
} from "./network";

type WalletStatus = "disconnected" | "connecting" | "connected" | "wrong-network";

export interface WalletState {
  address?: Address | undefined;
  chainId?: number | undefined;
  status: WalletStatus;
  error?: string | undefined;
  provider?: BrowserProvider | undefined;
  kit?: TransactionKit | undefined;
  connectedClient?: ReturnType<typeof getConnectedClient> | undefined;
  connect: () => Promise<void>;
  disconnect: () => Promise<boolean>;
  switchToStudioNext: () => Promise<void>;
}

const WalletContext = createContext<WalletState | undefined>(undefined);

function asAddress(value: unknown): Address | undefined {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)
    ? (value as Address)
    : undefined;
}

function asChainId(value: unknown) {
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseInt(value, 16);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function readWallet(provider: BrowserProvider) {
  const [accounts, chainId] = await Promise.all([
    provider.request({ method: "eth_accounts" }),
    provider.request({ method: "eth_chainId" }),
  ]);
  const first = Array.isArray(accounts) ? asAddress(accounts[0]) : undefined;
  return { address: first, chainId: asChainId(chainId) };
}

async function switchWallet(provider: BrowserProvider) {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: studioNextChainIdHex }],
    });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: studioNextChainIdHex,
          chainName: "GenLayer Studio Dev",
          rpcUrls: [STUDIO_NEXT_RPC_URL],
          nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
          blockExplorerUrls: [STUDIO_NEXT_EXPLORER_URL],
        },
      ],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: studioNextChainIdHex }],
    });
  }
}

function readableWalletError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function disconnectInjectedWallet(provider: BrowserProvider) {
  const disconnectable = provider as BrowserProvider & {
    disconnect?: () => Promise<void> | void;
  };
  if (typeof disconnectable.disconnect === "function") {
    await disconnectable.disconnect();
    return;
  }

  await provider.request({
    method: "wallet_revokePermissions",
    params: [{ eth_accounts: {} }],
  });
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [provider, setProvider] = useState<BrowserProvider>();
  const [address, setAddress] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [error, setError] = useState<string>();

  const refresh = async (nextProvider: BrowserProvider) => {
    const result = await readWallet(nextProvider);
    setProvider(nextProvider);
    setAddress(result.address);
    setChainId(result.chainId);
    setStatus(
      result.address
        ? result.chainId === STUDIO_NEXT_CHAIN_ID
          ? "connected"
          : "wrong-network"
        : "disconnected",
    );
  };

  useEffect(() => {
    const injected = getInjectedProvider();
    if (!injected) return;
    void refresh(injected).catch((reason) => setError(readableWalletError(reason)));
    const onAccountsChanged = () => void refresh(injected);
    const onChainChanged = () => void refresh(injected);
    const emitter = injected as BrowserProvider & {
      on?: (event: string, listener: () => void) => void;
      removeListener?: (event: string, listener: () => void) => void;
    };
    emitter.on?.("accountsChanged", onAccountsChanged);
    emitter.on?.("chainChanged", onChainChanged);
    return () => {
      emitter.removeListener?.("accountsChanged", onAccountsChanged);
      emitter.removeListener?.("chainChanged", onChainChanged);
    };
  }, []);

  const connect = async () => {
    const injected = getInjectedProvider();
    if (!injected) {
      setError("Install an EIP-1193 wallet such as MetaMask to connect.");
      return;
    }
    setStatus("connecting");
    setError(undefined);
    try {
      await injected.request({ method: "eth_requestAccounts" });
      await refresh(injected);
    } catch (reason) {
      setStatus("disconnected");
      setError(readableWalletError(reason));
    }
  };

  const disconnect = async () => {
    if (!provider) return false;
    setError(undefined);
    try {
      await disconnectInjectedWallet(provider);
      await refresh(provider);
      return true;
    } catch (reason) {
      setError(readableWalletError(reason));
      return false;
    }
  };

  const switchToStudioNext = async () => {
    if (!provider) return connect();
    setError(undefined);
    try {
      await switchWallet(provider);
      await refresh(provider);
    } catch (reason) {
      setError(readableWalletError(reason));
    }
  };

  const kit = useMemo<TransactionKit | undefined>(
    () =>
      provider && address && status === "connected"
        ? createTransactionKit({
            chain: studioNext,
            provider,
            account: address,
            suggestions: TEMPER_FEE_PROFILE,
          })
        : undefined,
    [provider, address, status],
  );
  const connectedClient = useMemo(
    () =>
      provider && address && status === "connected"
        ? getConnectedClient(provider, address)
        : undefined,
    [provider, address, status],
  );

  const value = useMemo(
    () => ({
      address,
      chainId,
      status,
      error,
      provider,
      connect,
      disconnect,
      switchToStudioNext,
      kit,
      connectedClient,
    }),
    [address, chainId, status, error, provider, kit, connectedClient],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside WalletProvider");
  return value;
}

export function WalletControl({ dark = false }: { dark?: boolean }) {
  const wallet = useWallet();
  const [copied, setCopied] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const copyAddress = async () => {
    if (!wallet.address || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  if (wallet.status === "connecting") {
    return (
      <Button size="sm" variant={dark ? "glass" : "outline"} disabled>
        Connecting…
      </Button>
    );
  }
  if (wallet.status === "wrong-network") {
    return (
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "hidden text-xs font-semibold sm:inline",
            dark ? "text-coral" : "text-coral",
          )}
        >
          Wrong network
        </span>
        <Button size="sm" variant="hero" onClick={() => void wallet.switchToStudioNext()}>
          Switch to Studio Dev
        </Button>
      </div>
    );
  }
  if (wallet.status === "connected" && wallet.address) {
    const explorerAddressUrl = `${STUDIO_NEXT_EXPLORER_URL}/address/${wallet.address}`;
    return (
      <DropdownMenu open={accountOpen} onOpenChange={setAccountOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "rounded-md border px-3 py-2 font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              dark
                ? "border-surface-border bg-paper/5 text-paper hover:bg-paper/10"
                : "border-border bg-background text-ink hover:bg-violet-soft",
            )}
            aria-label={`Open account menu for ${wallet.address}`}
          >
            {shortAddress(wallet.address)}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="bottom"
          sideOffset={10}
          collisionPadding={12}
          className={cn(
            "w-64 rounded-lg p-2",
            dark
              ? "border-surface-border bg-ink text-paper"
              : "border-border bg-background text-ink",
          )}
        >
          <DropdownMenuLabel
            className={cn(
              "px-2 py-1 text-[0.65rem] font-bold uppercase tracking-[0.16em]",
              dark ? "text-paper/45" : "text-muted-foreground",
            )}
          >
            Connected wallet
          </DropdownMenuLabel>
          <div
            className={cn(
              "truncate px-2 pb-2 font-mono text-xs",
              dark ? "text-paper/80" : "text-foreground",
            )}
            title={wallet.address}
          >
            {wallet.address}
          </div>
          <DropdownMenuSeparator className={dark ? "bg-surface-border" : undefined} />
          <DropdownMenuItem
            className={dark ? "text-paper focus:bg-paper/10 focus:text-paper" : undefined}
            onSelect={(event) => {
              event.preventDefault();
              void copyAddress();
            }}
          >
            <Copy />
            {copied ? "Copied" : "Copy address"}
          </DropdownMenuItem>
          <DropdownMenuItem
            className={dark ? "text-paper focus:bg-paper/10 focus:text-paper" : undefined}
            asChild
          >
            <a href={explorerAddressUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
              View on Explorer
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator className={dark ? "bg-surface-border" : undefined} />
          <DropdownMenuItem
            className={cn(
              dark
                ? "text-coral focus:bg-coral/10 focus:text-coral"
                : "text-destructive focus:bg-destructive/10 focus:text-destructive",
            )}
            onSelect={(event) => {
              event.preventDefault();
              void wallet.disconnect().then((disconnected) => {
                if (disconnected) setAccountOpen(false);
              });
            }}
          >
            <LogOut />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  return (
    <Button size="sm" variant={dark ? "glass" : "outline"} onClick={() => void wallet.connect()}>
      Connect Wallet
    </Button>
  );
}
