import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Search, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppPage, PageContainer } from "@/components/temper/shell";
import { CaseCard, EmptyState, TestnetBadge } from "@/components/temper/ui";
import {
  allowTemperManualRefresh,
  clearTemperRegistryReadCache,
  classifyRpcError,
  enumerateCases,
  rpcErrorMessage,
  temperQueryKey,
} from "@/lib/temper/adapter";
import { useWallet } from "@/lib/genlayer/wallet";
import { deriveTemperReadState } from "@/lib/temper/read-state";

const defaultEmptyState = {
  title: "No cases yet.",
  copy: "Cases opened through TEMPER will appear here.",
};
const emptyStateByTab: Record<string, { title: string; copy: string }> = {
  all: defaultEmptyState,
  open: {
    title: "No open cases.",
    copy: "Cases in evidence or adjudication will appear here.",
  },
  ready: {
    title: "No cases ready to settle.",
    copy: "Resolved cases awaiting settlement will appear here.",
  },
  completed: {
    title: "No completed cases.",
    copy: "Settled or closed cases will appear here.",
  },
};

export const Route = createFileRoute("/cases/")({
  head: () => ({
    meta: [
      { title: "Cases · TEMPER" },
      {
        name: "description",
        content:
          "Explore confirmed-loss cases about whether further loss could reasonably have been avoided.",
      },
    ],
  }),
  component: CasesPage,
});

function CasesPage() {
  const { address } = useWallet();
  const [tab, setTab] = useState("all");
  const [queryText, setQueryText] = useState("");
  const query = useQuery({
    queryKey: temperQueryKey("cases", address),
    queryFn: () => enumerateCases(address),
  });
  const hasData = query.data !== undefined;
  const cases = query.data ?? [];
  const readState = deriveTemperReadState({
    hasData,
    hasRecords: cases.length > 0,
    isFetching: query.isFetching,
    isError: query.isError,
  });
  const emptyState = emptyStateByTab[tab] ?? defaultEmptyState;
  const filtered = cases.filter((item) => {
    const match =
      item.title.toLowerCase().includes(queryText.toLowerCase()) ||
      item.id.toLowerCase().includes(queryText.toLowerCase());
    const group =
      tab === "all" ||
      (tab === "open" && !["RESOLVED", "SETTLED", "CLOSED"].includes(item.status)) ||
      (tab === "ready" && item.status === "RESOLVED") ||
      (tab === "completed" && ["SETTLED", "CLOSED"].includes(item.status));
    return match && group;
  });
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug("[TEMPER cases]", {
      state: readState,
      cachedCount: cases.length,
      errorClass: query.error ? classifyRpcError(query.error) : undefined,
      previousDataPreserved: hasData,
    });
  }, [cases.length, hasData, query.error, readState]);
  const refreshCases = () => {
    if (!allowTemperManualRefresh("cases")) return;
    clearTemperRegistryReadCache();
    void query.refetch();
  };
  return (
    <AppPage>
      <PageContainer>
        <TestnetBadge label="STUDIO DEV" />
        <div className="mt-4 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-4xl font-extrabold sm:text-5xl">Remedy Cases</h1>
            <p className="mt-3 text-paper/55">
              Browse remedy cases about whether an agreed fallback could reasonably have stopped
              further loss.
            </p>
          </div>
          <div className="flex gap-2">
            <label className="relative block w-full md:max-w-xs">
              <span className="sr-only">Search cases</span>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/40" />
              <Input
                value={queryText}
                onChange={(event) => setQueryText(event.target.value)}
                placeholder="Search cases"
                className="h-11 border-paper/15 bg-paper/5 pl-10 text-paper"
              />
            </label>
            <Button variant="glass" size="icon" onClick={refreshCases} aria-label="Refresh cases">
              <RefreshCw className={query.isFetching ? "animate-spin" : ""} />
            </Button>
          </div>
        </div>
        {readState === "ERROR_WITH_STALE_DATA" && query.error && (
          <p className="mt-6 text-sm text-coral" role="alert">
            {rpcErrorMessage(query.error, hasData)}
          </p>
        )}
        <div className="mt-10 overflow-hidden rounded-xl border border-paper/10 bg-paper/[0.025]">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-paper/10 bg-paper/[0.04] p-2">
              <TabsTrigger value="all">All Cases</TabsTrigger>
              <TabsTrigger value="open">Open</TabsTrigger>
              <TabsTrigger value="ready">Ready to Settle</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="p-4 sm:p-5">
            {readState === "INITIAL_LOADING" ? (
              <p className="text-sm text-paper/55">Loading cases from Studio Dev…</p>
            ) : readState === "ERROR_WITHOUT_DATA" ? (
              <div className="rounded-lg border border-coral/25 bg-coral/5 p-5">
                <p className="text-sm font-semibold">Could not load cases</p>
                <p className="mt-2 text-sm text-paper/65">
                  {query.error
                    ? rpcErrorMessage(query.error, false)
                    : "Studio Dev could not be reached. Try again shortly."}
                </p>
                <Button className="mt-4" variant="hero" onClick={refreshCases}>
                  Retry
                </Button>
              </div>
            ) : filtered.length ? (
              <div className="grid gap-4">
                {filtered.map((item) => (
                  <CaseCard key={item.id} item={item} />
                ))}
              </div>
            ) : cases.length > 0 ? (
              <div className="flex justify-center">
                <div className="w-full max-w-[680px]">
                  <EmptyState
                    title={queryText.trim() ? "No matching cases." : emptyState.title}
                    copy={queryText.trim() ? "Try a different case title or ID." : emptyState.copy}
                  />
                </div>
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="w-full max-w-[680px]">
                  <EmptyState title={emptyState.title} copy={emptyState.copy} />
                </div>
              </div>
            )}
          </div>
        </div>
      </PageContainer>
    </AppPage>
  );
}
