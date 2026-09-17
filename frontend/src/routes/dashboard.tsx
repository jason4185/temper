import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CircleAlert, CircleDot, Coins, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgreementCard, CaseCard, EmptyState, TestnetBadge } from "@/components/temper/ui";
import { AppPage, PageContainer } from "@/components/temper/shell";
import { useEffect, useRef, useState } from "react";
import {
  allowTemperManualRefresh,
  clearTemperRegistryReadCache,
  classifyRpcError,
  enumerateAgreements,
  rpcErrorMessage,
  temperQueryKey,
} from "@/lib/temper/adapter";
import { formatGen } from "@/lib/temper/format";
import {
  currentWalletLockedBond,
  requiresDashboardAction,
  scopeAgreementsForWallet,
} from "@/lib/temper/dashboard";
import { useWallet } from "@/lib/genlayer/wallet";
import { deriveTemperReadState } from "@/lib/temper/read-state";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · TEMPER" },
      {
        name: "description",
        content: "Review TEMPER agreements, remedy cases, bonded GEN, and actions waiting on you.",
      },
    ],
  }),
  component: Dashboard,
});

type WorkspaceTab = "actions" | "active" | "cases" | "completed";

function Dashboard() {
  const { address } = useWallet();
  const query = useQuery({
    queryKey: temperQueryKey("agreements", address),
    queryFn: () => enumerateAgreements(address),
  });
  const hasData = query.data !== undefined;
  const readState = deriveTemperReadState({
    hasData,
    hasRecords: (query.data?.length ?? 0) > 0,
    isFetching: query.isFetching,
    isError: query.isError,
  });
  const agreements = scopeAgreementsForWallet(query.data ?? [], address);
  const cases = agreements.flatMap((item) => (item.caseOverview ? [item.caseOverview] : []));
  const needsAction = agreements.filter(requiresDashboardAction);
  const openCases = cases.filter((item) => item.status !== "CLOSED" && item.status !== "SETTLED");
  const active = agreements.filter((item) => item.status === "ACTIVE");
  const completed = agreements.filter((item) => item.status === "CLOSED");
  const bonded = currentWalletLockedBond(agreements, address);
  const count = needsAction.length;
  const initialWorkspace =
    count > 0
      ? "actions"
      : active.length > 0
        ? "active"
        : openCases.length > 0
          ? "cases"
          : completed.length > 0
            ? "completed"
            : "actions";
  const [workspaceSelection, setWorkspaceSelection] = useState<{
    walletKey: string | undefined;
    tab: WorkspaceTab;
  }>();
  const initializedWallet = useRef<string | undefined>(undefined);
  const walletKey = address?.toLowerCase();

  useEffect(() => {
    if (query.isLoading || initializedWallet.current === walletKey) return;
    initializedWallet.current = walletKey;
    setWorkspaceSelection({ walletKey, tab: initialWorkspace });
  }, [initialWorkspace, query.isLoading, walletKey]);

  const hasWorkspaceSelection =
    workspaceSelection !== undefined && workspaceSelection.walletKey === walletKey;
  const selectedWorkspace = hasWorkspaceSelection
    ? workspaceSelection.tab
    : query.isLoading
      ? "actions"
      : initialWorkspace;
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug("[TEMPER dashboard]", {
      state: readState,
      cachedCount: agreements.length,
      errorClass: query.error ? classifyRpcError(query.error) : undefined,
      previousDataPreserved: hasData,
    });
  }, [agreements.length, hasData, query.error, readState]);
  const refreshDashboard = () => {
    if (!allowTemperManualRefresh("dashboard")) return;
    clearTemperRegistryReadCache();
    void query.refetch();
  };

  if (readState === "INITIAL_LOADING")
    return (
      <AppPage>
        <PageContainer>
          <p className="text-paper/60">Loading dashboard from Studio Dev…</p>
        </PageContainer>
      </AppPage>
    );
  if (readState === "ERROR_WITHOUT_DATA")
    return (
      <AppPage>
        <PageContainer>
          <section className="rounded-lg border border-coral/30 bg-coral/10 p-6">
            <h1 className="text-xl font-bold">TEMPER could not load the dashboard.</h1>
            <p className="mt-2 text-paper/70">
              {query.error
                ? rpcErrorMessage(query.error, false)
                : "Studio Dev could not be reached. Try again shortly."}
            </p>
            <Button className="mt-5" variant="hero" onClick={refreshDashboard}>
              Retry
            </Button>
          </section>
        </PageContainer>
      </AppPage>
    );

  return (
    <AppPage>
      <PageContainer>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <TestnetBadge label="STUDIO DEV" />
            <h1 className="mt-4 text-4xl font-extrabold sm:text-5xl">TEMPER Dashboard</h1>
            <p className="mt-3 text-paper/55">
              Bonded service agreements, open remedy cases, and the next action for your wallet.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="glass"
              size="icon"
              onClick={refreshDashboard}
              aria-label="Refresh dashboard"
            >
              <RefreshCw className={query.isFetching ? "animate-spin" : ""} />
            </Button>
            <Button asChild variant="hero" size="lg">
              <Link to="/agreements/new">
                Create Agreement <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
        {readState === "ERROR_WITH_STALE_DATA" && query.error && (
          <p className="mt-6 text-sm text-coral" role="alert">
            {rpcErrorMessage(query.error, hasData)}
          </p>
        )}
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr]">
          <Metric
            icon={CircleAlert}
            label="Needs Your Action"
            value={count}
            featured
            helper={
              count === 0 ? (
                <>
                  <span className="block text-paper/70">You’re all caught up.</span>
                  <span className="mt-1 block">
                    No agreement or case currently requires action from this wallet.
                  </span>
                </>
              ) : (
                "An agreement or case is waiting on this wallet."
              )
            }
          />
          <Metric
            icon={CircleDot}
            label="Open Cases"
            value={openCases.length}
            helper="Cases currently in evidence, adjudication, or settlement."
          />
          <Metric
            icon={Coins}
            label="GEN Locked"
            value={formatGen(bonded)}
            suffix="GEN"
            helper="GEN currently locked by this wallet in TEMPER agreements."
          />
        </div>
        <Tabs
          value={selectedWorkspace}
          onValueChange={(value) => {
            initializedWallet.current = walletKey;
            setWorkspaceSelection({ walletKey, tab: value as WorkspaceTab });
          }}
          className="mt-10"
        >
          <div className="rounded-xl border border-paper/10 bg-paper/[0.025] p-2">
            <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-paper/40">
              Workspace
            </p>
            <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto bg-transparent p-0">
              <TabsTrigger
                value="actions"
                className="text-paper/50 data-[state=active]:bg-paper/10 data-[state=active]:text-paper"
              >
                Needs Your Action
              </TabsTrigger>
              <TabsTrigger
                value="active"
                className="text-paper/50 data-[state=active]:bg-paper/10 data-[state=active]:text-paper"
              >
                Active Agreements
              </TabsTrigger>
              <TabsTrigger
                value="cases"
                className="text-paper/50 data-[state=active]:bg-paper/10 data-[state=active]:text-paper"
              >
                Open Cases
              </TabsTrigger>
              <TabsTrigger
                value="completed"
                className="text-paper/50 data-[state=active]:bg-paper/10 data-[state=active]:text-paper"
              >
                Completed
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent
            value="actions"
            className="mt-3 rounded-xl border border-paper/10 bg-paper/[0.025] p-4 sm:p-5"
          >
            <p className="text-sm text-paper/50">Cases or agreements waiting on your wallet.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {needsAction.length ? (
                needsAction.map((item) =>
                  item.caseOverview && item.status !== "PROPOSED" && item.status !== "ACCEPTED" ? (
                    <CaseCard key={item.id} item={item.caseOverview} />
                  ) : (
                    <AgreementCard key={item.id} agreement={item} />
                  ),
                )
              ) : (
                <div className="flex justify-center md:col-span-2">
                  <div className="w-full max-w-[680px]">
                    <EmptyState
                      title={
                        address ? "You’re all caught up." : "Connect a wallet to see your actions"
                      }
                      copy={
                        address
                          ? "No agreement or case currently requires action from this wallet."
                          : "Public agreements remain visible after you connect."
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent
            value="cases"
            className="mt-3 rounded-xl border border-paper/10 bg-paper/[0.025] p-4 sm:p-5"
          >
            <p className="text-sm text-paper/50">
              Cases currently in evidence, adjudication, or settlement.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {openCases.length ? (
                openCases.map((item) => <CaseCard key={item.id} item={item} />)
              ) : (
                <div className="flex justify-center md:col-span-2">
                  <div className="w-full max-w-[680px]">
                    <EmptyState
                      title="No open cases"
                      copy="Cases in evidence, adjudication, or settlement will appear here."
                    />
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent
            value="active"
            className="mt-3 rounded-xl border border-paper/10 bg-paper/[0.025] p-4 sm:p-5"
          >
            <p className="text-sm text-paper/50">
              Active bonded service agreements with remedy terms secured before a failure occurs.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {active.length ? (
                active.map((item) => <AgreementCard key={item.id} agreement={item} />)
              ) : (
                <div className="flex justify-center md:col-span-2">
                  <div className="w-full max-w-[680px]">
                    <EmptyState
                      title="No active agreements"
                      copy="Accepted and funded agreements will appear here."
                    />
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent
            value="completed"
            className="mt-3 rounded-xl border border-paper/10 bg-paper/[0.025] p-4 sm:p-5"
          >
            <p className="text-sm text-paper/50">Completed remedies and settled agreements.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {completed.length ? (
                completed.map((item) => <AgreementCard key={item.id} agreement={item} />)
              ) : (
                <div className="flex justify-center md:col-span-2">
                  <div className="w-full max-w-[680px]">
                    <EmptyState
                      title="No completed cases yet"
                      copy="Settled or closed TEMPER cases will appear here."
                    />
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </PageContainer>
    </AppPage>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  suffix,
  helper,
  featured = false,
}: {
  icon: typeof Coins;
  label: string;
  value: string | number;
  suffix?: string;
  helper: React.ReactNode;
  featured?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 sm:p-6 ${
        featured ? "border-violet/35 bg-violet/[0.09]" : "border-paper/12 bg-paper/[0.045]"
      }`}
    >
      <div className="flex items-center justify-between">
        <p
          className={`text-sm ${featured ? "font-bold uppercase tracking-[0.08em] text-paper/75" : "text-paper/55"}`}
        >
          {label}
        </p>
        <Icon className="h-5 w-5 text-violet" />
      </div>
      <p className={`mt-5 font-bold ${featured ? "text-5xl" : "text-3xl"}`}>
        {value}
        {suffix && <span className="ml-2 text-sm text-paper/45">{suffix}</span>}
      </p>
      <p className="mt-2 text-xs leading-5 text-paper/45">{helper}</p>
    </div>
  );
}
