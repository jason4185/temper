import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, FileCheck2, RefreshCw, Scale } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppPage, PageContainer } from "@/components/temper/shell";
import { TransactionRunner } from "@/components/temper/transaction";
import {
  AmountSplit,
  EvidenceCard,
  StatusBadge,
  TechnicalDetails,
  TestnetBadge,
} from "@/components/temper/ui";
import {
  allowTemperManualRefresh,
  buildDisputeMitigation,
  buildRequestJudgment,
  buildRequestPayout,
  buildSubmitMitigation,
  buildTriggerTimeout,
  buildWithdrawBond,
  clearAgreementReadCache,
  getDemoLossRecordedAt,
  getCaseOverview,
  rpcErrorMessage,
  temperQueryKey,
} from "@/lib/temper/adapter";
import {
  prepareEvidence,
  validateHttpsEvidence,
  validateProviderEvidence,
} from "@/lib/temper/evidence";
import { formatGen, outsideTemperBond, securedLoss, unixNow } from "@/lib/temper/format";
import { isSupportedDemoLiabilitySource } from "@/lib/temper/contracts";
import { useWallet } from "@/lib/genlayer/wallet";
import type { CaseOverview, ContractWrite, Verdict } from "@/lib/temper/types";

const DEMO_EVIDENCE_LIBRARY_URL = "https://temper-evidence-demo.netlify.app/";

export const Route = createFileRoute("/cases/$id")({
  head: () => ({
    meta: [
      { title: "Case Review · TEMPER" },
      {
        name: "description",
        content:
          "Review the confirmed loss, disputed mitigation question, evidence, verdict, and settlement.",
      },
    ],
  }),
  component: CaseDetail,
});

function CaseDetail() {
  const { id } = Route.useParams();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const [providerNote, setProviderNote] = useState("");
  const [availableAt, setAvailableAt] = useState("");
  const [evidence1, setEvidence1] = useState("");
  const [evidence2, setEvidence2] = useState("");
  const [response, setResponse] = useState("");
  const [counterEvidence, setCounterEvidence] = useState("");
  const [write, setWrite] = useState<ContractWrite>();
  const [error, setError] = useState<string>();
  const query = useQuery({
    queryKey: temperQueryKey("case", id, wallet.address),
    queryFn: () => getCaseOverview(id, wallet.address),
  });
  const item = query.data;
  const isDemoLiabilitySource = Boolean(
    item?.liabilityReceiptId && isSupportedDemoLiabilitySource(item.trustedLiabilitySource),
  );
  const demoLossRecordedAtQuery = useQuery({
    queryKey: temperQueryKey(
      "demo-loss-recorded-at",
      item?.trustedLiabilitySource ?? "",
      id,
      item?.liabilityReceiptId ?? "",
    ),
    queryFn: () => getDemoLossRecordedAt(item!.trustedLiabilitySource, item!.liabilityReceiptId),
    enabled: isDemoLiabilitySource,
  });
  const claimantResponseSubmitted = Boolean(
    item &&
    (item.evidence.some((e) => e.side === "other-party") ||
      Boolean(item.claimantResponse?.trim()) ||
      ["MITIGATION_DISPUTED", "JUDGMENT_PENDING", "RESOLVED", "SETTLED", "CLOSED"].includes(
        item.status,
      )),
  );
  const responseWindowDeadline = item?.stageDeadline ?? 0n;
  const responseWindowActive =
    item?.status === "MITIGATION_CHALLENGED" &&
    !claimantResponseSubmitted &&
    responseWindowDeadline !== 0n;
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const expiryRefreshDeadline = useRef<bigint | null>(null);
  const refetchCase = query.refetch;
  useEffect(() => {
    if (!responseWindowActive) {
      expiryRefreshDeadline.current = null;
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | undefined;
    const tick = () => {
      const currentSeconds = Math.floor(Date.now() / 1000);
      setNowSeconds(currentSeconds);
      if (BigInt(currentSeconds) >= responseWindowDeadline) {
        if (expiryRefreshDeadline.current !== responseWindowDeadline) {
          expiryRefreshDeadline.current = responseWindowDeadline;
          void refetchCase();
        }
        if (intervalId !== undefined) clearInterval(intervalId);
      }
    };

    tick();
    if (BigInt(Math.floor(Date.now() / 1000)) < responseWindowDeadline) {
      intervalId = setInterval(tick, 1000);
    }

    return () => {
      if (intervalId !== undefined) clearInterval(intervalId);
    };
  }, [refetchCase, responseWindowActive, responseWindowDeadline]);
  const refresh = async () => {
    setError(undefined);
    clearAgreementReadCache(id);
    await queryClient.invalidateQueries({
      queryKey: temperQueryKey("case", id),
      refetchType: "active",
    });
    await queryClient.invalidateQueries({
      queryKey: temperQueryKey("agreement", id),
      refetchType: "none",
    });
    await queryClient.invalidateQueries({
      queryKey: temperQueryKey("agreements"),
      refetchType: "none",
    });
    await queryClient.invalidateQueries({
      queryKey: temperQueryKey("cases"),
      refetchType: "none",
    });
    setWrite(undefined);
  };

  if (query.isLoading)
    return (
      <AppPage>
        <PageContainer>
          <p className="text-paper/60">Loading case from Studio Dev…</p>
        </PageContainer>
      </AppPage>
    );
  if (query.isError && !item)
    return (
      <AppPage>
        <PageContainer>
          <section className="rounded-lg border border-coral/30 bg-coral/10 p-6">
            <h1 className="text-xl font-bold">Could not load case</h1>
            <p className="mt-2 text-paper/70">{rpcErrorMessage(query.error, false)}</p>
            <Button
              className="mt-5"
              variant="hero"
              onClick={() => {
                if (!allowTemperManualRefresh(`case:${id}`)) return;
                clearAgreementReadCache(id);
                void query.refetch();
              }}
            >
              Refresh
            </Button>
          </section>
        </PageContainer>
      </AppPage>
    );
  if (!item)
    return (
      <AppPage>
        <PageContainer>
          <section className="rounded-lg border border-coral/30 bg-coral/10 p-6">
            <h1 className="text-xl font-bold">Case unavailable</h1>
            <p className="mt-2 text-paper/70">This agreement has no case on Studio Dev.</p>
            <Button
              className="mt-5"
              variant="hero"
              onClick={() => {
                if (!allowTemperManualRefresh(`case:${id}`)) return;
                void query.refetch();
              }}
            >
              Refresh
            </Button>
          </section>
        </PageContainer>
      </AppPage>
    );
  const providerEvidence = item.evidence.filter((e) => e.side === "provider");
  const challengeEvidence = item.evidence.filter((e) => e.side === "other-party");
  const resolved =
    item.status === "RESOLVED" || item.status === "SETTLED" || item.status === "CLOSED";
  const responseWindowExpired =
    responseWindowActive && BigInt(nowSeconds) >= responseWindowDeadline;
  const responseWindowRemainingSeconds = responseWindowActive
    ? Number(
        responseWindowDeadline > BigInt(nowSeconds)
          ? responseWindowDeadline - BigInt(nowSeconds)
          : 0n,
      )
    : 0;
  const deadlinePassed = item.stageDeadline !== 0n && item.stageDeadline <= unixNow();
  const canSubmit = item.status === "CLAIM_OPEN" && item.role === "Provider" && !deadlinePassed;
  const canDispute =
    item.status === "MITIGATION_CHALLENGED" && item.role === "Other party" && !deadlinePassed;
  const canJudge =
    item.status === "MITIGATION_DISPUTED" &&
    !deadlinePassed &&
    (item.role === "Provider" || item.role === "Other party");
  const canPayout = item.status === "RESOLVED" && Boolean(wallet.address);
  const canWithdraw = item.status === "SETTLED" && item.role === "Provider";
  const canTimeout =
    deadlinePassed &&
    ["CLAIM_OPEN", "MITIGATION_CHALLENGED", "MITIGATION_DISPUTED"].includes(item.status) &&
    Boolean(wallet.address);
  const mitigationSubmitted = item.status !== "CLAIM_OPEN";
  const question = "Could the agreed fallback reasonably have stopped further loss?";
  const secured = securedLoss(item.confirmedLoss, item.bond);
  const outside = outsideTemperBond(item.confirmedLoss, item.bond);
  const unused = item.bond - secured;
  const potentialRecoverable = item.lossAtBackup < secured ? item.lossAtBackup : secured;
  const potentialAvoidable = secured - potentialRecoverable;
  const resolvedQuestion =
    item.verdict === "VALID_MITIGATION"
      ? "The agreed fallback was reasonably available at the claimed point."
      : item.verdict === "INVALID_MITIGATION"
        ? "The agreed fallback was not reasonably available at the claimed point."
        : item.verdict === "UNDETERMINED"
          ? "GenLayer could not determine whether the agreed fallback was reasonably available."
          : item.resolutionBasis === "UNCHALLENGED_MITIGATION"
            ? "The mitigation claim went unchallenged."
            : "The remedy was determined under the agreement.";
  const resolvedQuestionSupportingCopy =
    item.verdict === "VALID_MITIGATION"
      ? `GenLayer determined that the agreed mitigation was reasonably available when ${formatGen(item.lossAtBackup)} GEN had been lost.`
      : item.verdict === "INVALID_MITIGATION"
        ? "GenLayer determined that the agreed mitigation was not reasonably available at the claimed point."
        : item.verdict === "UNDETERMINED"
          ? "The secured loss remains fully recoverable."
          : item.resolutionBasis === "UNCHALLENGED_MITIGATION"
            ? "The submitted mitigation claim was not challenged within the contract window."
            : "The resolved remedy follows the agreement’s recorded case outcome.";
  const actionSummary = canSubmit
    ? "PROVIDER ACTION REQUIRED"
    : canDispute
      ? "RESPONSE REQUIRED"
      : canJudge
        ? "READY FOR GENLAYER JUDGMENT"
        : canTimeout
          ? "Contract deadline passed · Timeout available"
          : item.status === "JUDGMENT_PENDING"
            ? "GenLayer judgment in progress"
            : item.status === "RESOLVED"
              ? "Remedy resolved · Settlement available"
              : item.status === "SETTLED"
                ? "Settlement executed"
                : item.status === "CLOSED"
                  ? "Case closed"
                  : item.status === "CLAIM_OPEN"
                    ? "Provider must show when the agreed fallback became reasonably available"
                    : item.status === "MITIGATION_CHALLENGED"
                      ? item.role === "Provider"
                        ? "WAITING FOR SERVICE USER RESPONSE"
                        : "Claimant may now respond to the provider’s mitigation claim"
                      : item.status === "MITIGATION_DISPUTED"
                        ? "Ready for GenLayer judgment"
                        : "No action required from you right now";

  const submitProviderEvidence = async () => {
    setError(undefined);
    try {
      if (!providerNote.trim()) throw new Error("Your explanation is required.");
      validateProviderEvidence(evidence1, evidence2);
      if (!availableAt) throw new Error("Choose when you claim the mitigation became available.");
      const timestamp = BigInt(Math.floor(new Date(availableAt).getTime() / 1000));
      if (!Number.isFinite(Number(timestamp))) throw new Error("Choose a valid mitigation time.");
      const [prepared1, prepared2] = await Promise.all([
        prepareEvidence(evidence1),
        prepareEvidence(evidence2),
      ]);
      setWrite(
        buildSubmitMitigation(
          id,
          timestamp,
          providerNote,
          prepared1.url,
          prepared1.sha256,
          prepared2.url,
          prepared2.sha256,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const submitDispute = async () => {
    setError(undefined);
    try {
      if (!response.trim()) throw new Error("Your response is required.");
      if (counterEvidence) validateHttpsEvidence(counterEvidence, "Response evidence URL");
      const prepared = counterEvidence ? await prepareEvidence(counterEvidence) : undefined;
      setWrite(buildDisputeMitigation(id, response, prepared?.url ?? "", prepared?.sha256 ?? ""));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const begin = (next: ContractWrite) => {
    setError(undefined);
    setWrite(next);
  };
  const afterSuccess = () => refresh();
  return (
    <AppPage>
      <PageContainer>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex gap-2">
              <TestnetBadge label="STUDIO DEV" />
              <StatusBadge status={item.status} />
            </div>
            <h1 className="mt-4 text-4xl font-extrabold sm:text-5xl">{item.title}</h1>
            <p className="mt-3 max-w-full truncate font-mono text-xs text-paper/40" title={item.id}>
              Case {item.id}
            </p>
            <p className="mt-2 text-sm text-paper/50">
              Bond {formatGen(item.bond)} GEN · Actual confirmed loss{" "}
              {formatGen(item.confirmedLoss)} GEN
            </p>
          </div>
          <Button
            variant="glass"
            size="icon"
            onClick={() => {
              if (!allowTemperManualRefresh(`case:${id}`)) return;
              clearAgreementReadCache(id);
              void query.refetch();
            }}
            aria-label="Refresh case"
          >
            <RefreshCw className={query.isFetching ? "animate-spin" : ""} />
          </Button>
        </div>
        {query.isError && (
          <p className="mt-4 text-sm text-coral" role="alert">
            {rpcErrorMessage(query.error, item !== undefined)}
          </p>
        )}
        <section className="mt-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet">
            {resolved ? "Case outcome" : "Current action"}
          </p>
          {canSubmit ? (
            <div className="mt-3 rounded-lg border border-paper/12 bg-paper/[0.035] p-4 sm:p-5">
              <ActionContext
                summary={actionSummary}
                confirmedLoss={item.confirmedLoss}
                secured={secured}
              />
              <ProviderEvidenceForm
                note={providerNote}
                setNote={setProviderNote}
                availableAt={availableAt}
                setAvailableAt={setAvailableAt}
                evidence1={evidence1}
                setEvidence1={setEvidence1}
                evidence2={evidence2}
                setEvidence2={setEvidence2}
                agreementRule={item.allowedMitigationPolicy}
                breachTimestamp={item.establishedBreachTimestamp}
                confirmedLoss={item.confirmedLoss}
                secured={secured}
                demoLossRecordedAt={
                  isDemoLiabilitySource ? demoLossRecordedAtQuery.data : undefined
                }
                onSubmit={() => void submitProviderEvidence()}
                disabled={Boolean(write)}
              />
            </div>
          ) : canDispute ? (
            <div className="mt-3 rounded-lg border border-violet/35 bg-violet/10 p-4 sm:p-5">
              <ActionContext
                summary={actionSummary}
                confirmedLoss={item.confirmedLoss}
                secured={secured}
              />
              <ResponseWindowNotice
                audience="claimant"
                remainingSeconds={responseWindowRemainingSeconds}
                expired={responseWindowExpired}
              />
              <DisputeForm
                response={response}
                setResponse={setResponse}
                counterEvidence={counterEvidence}
                setCounterEvidence={setCounterEvidence}
                fallback={item.backupSource}
                mitigationAvailableAt={item.mitigationAvailableAt}
                lossAtBackup={item.lossAtBackup}
                confirmedLoss={item.confirmedLoss}
                onSubmit={() => void submitDispute()}
                disabled={Boolean(write)}
              />
            </div>
          ) : canJudge ? (
            <div className="mt-3">
              <JudgmentCard
                item={item}
                actionSummary={actionSummary}
                onRequest={() => begin(buildRequestJudgment(id))}
                disabled={!canJudge || Boolean(write)}
              />
            </div>
          ) : canTimeout ? (
            <div className="mt-3 rounded-lg border border-coral/30 bg-coral/10 p-6">
              {responseWindowActive && responseWindowExpired ? (
                <ResponseWindowNotice
                  audience={item.role === "Other party" ? "claimant" : "provider"}
                  remainingSeconds={0}
                  expired
                />
              ) : (
                <>
                  <ActionContext
                    summary={actionSummary}
                    confirmedLoss={item.confirmedLoss}
                    secured={secured}
                  />
                  <h2 className="text-xl font-bold">Timeout available</h2>
                  <p className="mt-2 text-sm text-paper/65">
                    The contract deadline has passed. Trigger the permissionless timeout resolution.
                  </p>
                </>
              )}
              <Button
                variant="hero"
                className="mt-5"
                onClick={() => begin(buildTriggerTimeout(id))}
                disabled={Boolean(write)}
              >
                Resolve Timeout
              </Button>
            </div>
          ) : item.status === "JUDGMENT_PENDING" ? (
            <section className="mt-3 rounded-lg border border-violet/30 bg-violet/10 p-8 text-center">
              <ActionContext
                summary={actionSummary}
                confirmedLoss={item.confirmedLoss}
                secured={secured}
              />
              <div className="mx-auto flex w-fit gap-3">
                {[0, 1, 2, 3, 4].map((index) => (
                  <span
                    key={index}
                    className="validator-pulse h-3 w-3 rounded-full bg-violet"
                    style={{ animationDelay: `${index * 0.18}s` }}
                  />
                ))}
              </div>
              <h2 className="mt-6 text-2xl font-bold">GenLayer is deciding the remedy question.</h2>
              <p className="mt-2 text-paper/60">
                GenLayer validators are independently evaluating the evidence.
              </p>
              <p className="mt-2 text-sm text-paper/50">
                Was the agreed fallback reasonably available at the provider’s claimed mitigation
                point? The answer determines the remedy TEMPER can settle.
              </p>
            </section>
          ) : resolved && (item.verdict || item.resolutionBasis) ? (
            <div className="mt-3">
              <VerdictPanel
                item={item}
                onAction={(next) => begin(next)}
                walletConnected={Boolean(wallet.address)}
                canExecute={
                  Boolean(wallet.kit && wallet.connectedClient) &&
                  (item.status === "RESOLVED" || item.role === "Provider")
                }
              />
            </div>
          ) : item.status === "CLAIM_OPEN" ? (
            <div className="mt-3 rounded-lg border border-violet/25 bg-paper/[0.035] px-4 py-3.5 sm:px-5">
              <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.12em] text-violet">
                    Provider must show when the agreed fallback became reasonably available
                  </p>
                  <p className="mt-1 text-sm leading-5 text-paper/65">
                    Provider must submit the claimed mitigation time and supporting evidence.
                  </p>
                </div>
                <p className="text-xs font-semibold text-paper/45">
                  {formatGen(item.confirmedLoss)} GEN confirmed loss · {formatGen(secured)} GEN
                  secured
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-paper/15 bg-paper/[0.045] p-5 sm:p-6">
              <ActionContext
                summary={actionSummary}
                confirmedLoss={item.confirmedLoss}
                secured={secured}
              />
              {responseWindowActive ? (
                <ResponseWindowNotice
                  audience={item.role === "Other party" ? "claimant" : "provider"}
                  remainingSeconds={responseWindowRemainingSeconds}
                  expired={responseWindowExpired}
                />
              ) : (
                <>
                  <h2 className="text-xl font-bold">
                    {item.status === "MITIGATION_CHALLENGED"
                      ? "Claimant may now respond to the provider’s mitigation claim"
                      : item.status === "MITIGATION_DISPUTED"
                        ? "Ready for GenLayer judgment"
                        : item.status === "SETTLED"
                          ? "Waiting for provider withdrawal"
                          : item.status === "CLOSED"
                            ? "Case closed"
                            : "No action required right now"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-paper/60">
                    {item.status === "MITIGATION_CHALLENGED"
                      ? "The claimant may now respond to the provider’s mitigation evidence during the dispute window."
                      : item.status === "MITIGATION_DISPUTED"
                        ? "A provider or claimant wallet can request GenLayer to decide the remedy question."
                        : item.status === "SETTLED"
                          ? "The provider can withdraw any remaining bond to close the case."
                          : item.status === "CLOSED"
                            ? "The remedy has been fully settled under the agreement."
                            : "The case is waiting for its next onchain state transition."}
                  </p>
                </>
              )}
            </div>
          )}
        </section>
        <section className="mt-8 overflow-hidden rounded-lg border border-paper/12 bg-paper/[0.045]">
          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-8">
            <div className="rounded-md border border-paper/12 border-l-2 border-l-coral/65 bg-paper/[0.03] p-4 sm:p-5">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-paper/65">
                Responsibility established
              </p>
              <p className="mt-2 text-3xl font-extrabold text-coral">
                {formatGen(item.confirmedLoss)} GEN
              </p>
              <p className="mt-1 text-sm text-paper/50">Actual confirmed loss</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-paper/10 pt-3 text-sm sm:grid-cols-3">
                <Metric label="Secured by TEMPER" value={secured} />
                <Metric label="Outside coverage" value={outside} />
                <Metric
                  label={item.status === "CLOSED" ? "Unused coverage at resolution" : "Unused bond"}
                  value={unused}
                />
              </dl>
              <p className="mt-3 text-xs leading-5 text-paper/55">
                The original service failure has already been established upstream. TEMPER begins
                from this point.
              </p>
            </div>
            <div>
              {resolved ? (
                <>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet">
                    The Remedy Question · Resolved
                  </p>
                  <h2 className="mt-2 max-w-4xl text-2xl font-bold leading-8 sm:text-3xl">
                    {resolvedQuestion}
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-paper/60">
                    {resolvedQuestionSupportingCopy}
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-md border border-mint/20 bg-mint/10 p-3.5">
                      <p className="text-xs font-bold uppercase tracking-[0.1em] text-paper/65">
                        Recoverable from bond
                      </p>
                      <p className="mt-1 text-xl font-bold">
                        {formatGen(item.recoverableAmount)} GEN
                      </p>
                    </div>
                    <div className="rounded-md border border-violet/20 bg-violet/10 p-3.5">
                      <p className="text-xs font-bold uppercase tracking-[0.1em] text-paper/65">
                        Avoidable secured loss
                      </p>
                      <p className="mt-1 text-xl font-bold">
                        {formatGen(item.avoidableAmount)} GEN
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet">
                    The Remedy Question
                  </p>
                  <h2 className="mt-2 max-w-4xl text-2xl font-bold leading-8 sm:text-3xl">
                    {question}
                  </h2>
                  {mitigationSubmitted ? (
                    <>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-md border border-mint/20 bg-mint/10 p-3.5">
                          <b>If YES</b>
                          <p className="mt-1 text-sm text-paper/60">
                            {formatGen(potentialRecoverable)} GEN recoverable from bond
                            <br />
                            {formatGen(potentialAvoidable)} GEN avoidable secured loss
                          </p>
                        </div>
                        <div className="rounded-md border border-coral/20 bg-coral/10 p-3.5">
                          <b>If NO</b>
                          <p className="mt-1 text-sm text-paper/60">
                            {formatGen(secured)} GEN recoverable from bond
                            <br />0 GEN avoidable secured loss
                          </p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-paper/45">
                        If GenLayer cannot determine mitigation availability, the secured loss
                        remains fully recoverable.
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-paper/60">
                      The provider must first submit a claimed mitigation point and evidence about
                      when the fallback became practically usable.
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-paper/45">
                    <span className="rounded-full border border-paper/12 px-2.5 py-1">
                      Responsibility established
                    </span>
                    <span aria-hidden="true" className="text-violet">
                      →
                    </span>
                    <span className="rounded-full border border-violet/25 bg-violet/10 px-2.5 py-1 text-violet">
                      Mitigation availability
                    </span>
                    <span aria-hidden="true" className="text-violet">
                      →
                    </span>
                    <span className="rounded-full border border-paper/12 px-2.5 py-1">
                      Recoverable amount
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-paper/55">
                    TEMPER applies the adjudicated fact to determine how much of the continuing loss
                    remains recoverable.
                  </p>
                </>
              )}
            </div>
          </div>
        </section>
        {isDemoLiabilitySource && demoLossRecordedAtQuery.data !== undefined && (
          <section className="mt-5 rounded-lg border border-violet/20 bg-violet/5 p-4 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet">
              Demo Loss Record
            </p>
            <DemoLossTimeline item={item} recordedAt={demoLossRecordedAtQuery.data} />
            <p className="mt-3 text-xs leading-5 text-paper/50">
              For this controlled demo source, loss between breach and measurement time is
              interpolated linearly.
            </p>
          </section>
        )}
        {write && wallet.kit && wallet.connectedClient && (
          <TransactionRunner
            kit={wallet.kit}
            client={wallet.connectedClient}
            write={write}
            onError={(reason) => setError(reason.message)}
            onDismiss={() => {
              setWrite(undefined);
            }}
            onSuccess={async (txId) => {
              await afterSuccess();
              toastSuccess(write.method);
              void txId;
            }}
            label={write.method}
          />
        )}
        {error && (
          <p className="mt-5 text-sm text-coral" role="alert">
            {error}
          </p>
        )}
        <Tabs
          key={`${item.status}-${item.role}`}
          defaultValue={
            item.status === "MITIGATION_CHALLENGED" && item.role === "Other party"
              ? "challenge"
              : "provider"
          }
          className="mt-8"
        >
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto border border-paper/10 bg-paper/[0.035] p-1">
            <TabsTrigger
              value="provider"
              className="border border-transparent px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-paper/50 data-[state=active]:border-violet/30 data-[state=active]:bg-violet/10 data-[state=active]:text-violet"
            >
              Provider Evidence
            </TabsTrigger>
            <TabsTrigger
              value="challenge"
              className="border border-transparent px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-paper/40 data-[state=active]:border-violet/30 data-[state=active]:bg-violet/10 data-[state=active]:text-violet"
            >
              Claimant Response
            </TabsTrigger>
            <TabsTrigger
              value="timeline"
              className="border border-transparent px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-paper/40 data-[state=active]:border-violet/30 data-[state=active]:bg-violet/10 data-[state=active]:text-violet"
            >
              Timeline
            </TabsTrigger>
            <TabsTrigger
              value="technical"
              className="border border-transparent px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-paper/40 data-[state=active]:border-violet/30 data-[state=active]:bg-violet/10 data-[state=active]:text-violet"
            >
              Technical
            </TabsTrigger>
          </TabsList>
          <TabsContent value="provider" className="pt-3">
            <div className="space-y-3">
              {providerEvidence.length ? (
                providerEvidence.map((e) => <EvidenceCard key={e.id} evidence={e} />)
              ) : (
                <EmptyEvidence
                  {...(item.status === "CLAIM_OPEN" && !canSubmit
                    ? { title: "Waiting for provider evidence" }
                    : {})}
                  text={
                    canSubmit
                      ? "Use the Current Action section above to submit mitigation evidence."
                      : "Evidence submitted by the provider will appear here."
                  }
                />
              )}
            </div>
          </TabsContent>
          <TabsContent value="challenge" className="pt-5">
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-3">
                {challengeEvidence.length ? (
                  challengeEvidence.map((e) => <EvidenceCard key={e.id} evidence={e} />)
                ) : (
                  <EmptyEvidence text="No response evidence was submitted." />
                )}
              </div>
              <div className="space-y-5">
                <div className="rounded-md border border-violet/25 bg-violet/10 p-5">
                  <p className="text-xs font-bold uppercase text-violet">Provider claim</p>
                  <p className="mt-3 text-sm leading-6 text-paper/70">
                    “The agreed mitigation was reasonably available when only{" "}
                    {formatGen(item.lossAtBackup)} GEN had been lost.”
                  </p>
                </div>
                {canDispute ? (
                  <EmptyEvidence text="Use the Current Action section above to submit your response." />
                ) : claimantResponseSubmitted ? (
                  <div className="rounded-md border border-paper/10 bg-paper/[0.025] p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet">
                      Claimant response
                    </p>
                    {item.claimantResponse?.trim() ? (
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-paper/70">
                        {item.claimantResponse}
                      </p>
                    ) : (
                      <>
                        <p className="mt-3 text-sm font-semibold text-paper/75">
                          Claimant response submitted.
                        </p>
                        <p className="mt-1 text-xs leading-5 text-paper/50">
                          Response evidence has been recorded onchain.
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <EmptyEvidence text="The other party’s response will appear here when submitted." />
                )}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="timeline" className="pt-4">
            <div className="rounded-lg border border-paper/12 p-5">
              <Timeline item={item} />
            </div>
          </TabsContent>
          <TabsContent value="technical" className="pt-5">
            <TechnicalDetails caseId={item.id} />
            <div className="mt-4 rounded-lg border border-paper/12 p-5 text-xs text-paper/55">
              <p>Resolution basis · {item.resolutionBasis || "Not resolved"}</p>
              <p className="mt-2">
                Stage deadline ·{" "}
                {item.stageDeadline
                  ? new Date(Number(item.stageDeadline) * 1000).toLocaleString()
                  : "None"}
              </p>
              {item.provider && <p className="mt-2">Provider · {item.provider}</p>}
            </div>
          </TabsContent>
        </Tabs>
        {canPayout && (
          <div className="sr-only">Settlement execution is available in the verdict panel.</div>
        )}
        {canWithdraw && (
          <div className="sr-only">Provider withdrawal is available in the verdict panel.</div>
        )}
      </PageContainer>
    </AppPage>
  );
}

function ActionContext({
  summary,
  confirmedLoss,
  secured,
}: {
  summary: string;
  confirmedLoss: bigint;
  secured: bigint;
}) {
  return (
    <div className="border-b border-paper/10 pb-3">
      <p className="text-sm font-semibold text-paper">{summary}</p>
      <p className="mt-1 text-sm text-paper/55">
        {formatGen(confirmedLoss)} GEN confirmed loss · {formatGen(secured)} GEN secured
      </p>
    </div>
  );
}

function ResponseWindowNotice({
  audience,
  remainingSeconds,
  expired,
}: {
  audience: "claimant" | "provider";
  remainingSeconds: number;
  expired: boolean;
}) {
  if (expired) {
    return (
      <div className="mt-4 rounded-md border border-paper/15 bg-paper/[0.035] p-4">
        <p className="text-sm font-bold uppercase tracking-[0.12em] text-paper/75">
          Response window ended
        </p>
        <p className="mt-1 text-sm leading-5 text-paper/60">
          {audience === "claimant"
            ? "You did not respond before the response deadline. The Service Renderer’s mitigation claim is now eligible for procedural timeout resolution. No GenLayer judgment occurs unless a response was submitted and the normal judgment path is used."
            : "The response period has expired. The mitigation claim is eligible for procedural timeout resolution."}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`mt-4 rounded-md border p-4 ${
        audience === "claimant"
          ? "border-violet/35 bg-violet/10"
          : "border-paper/15 bg-paper/[0.035]"
      }`}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.12em] text-paper">
            {audience === "claimant" ? "Response required" : "Waiting for Service User response"}
          </p>
          {audience === "claimant" && (
            <p className="mt-1 text-sm leading-5 text-paper/65">
              The Service Renderer has submitted a mitigation claim. Respond before the response
              window closes.
            </p>
          )}
        </div>
        <p className="font-mono text-xl font-bold tabular-nums text-violet" aria-live="polite">
          {formatResponseCountdown(remainingSeconds)} remaining
        </p>
      </div>
    </div>
  );
}

function formatResponseCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function ProviderEvidenceForm({
  note,
  setNote,
  availableAt,
  setAvailableAt,
  evidence1,
  setEvidence1,
  evidence2,
  setEvidence2,
  agreementRule,
  breachTimestamp,
  confirmedLoss,
  secured,
  demoLossRecordedAt,
  onSubmit,
  disabled,
}: {
  note: string;
  setNote: (value: string) => void;
  availableAt: string;
  setAvailableAt: (value: string) => void;
  evidence1: string;
  setEvidence1: (value: string) => void;
  evidence2: string;
  setEvidence2: (value: string) => void;
  agreementRule: string;
  breachTimestamp: bigint;
  confirmedLoss: bigint;
  secured: bigint;
  demoLossRecordedAt: bigint | undefined;
  onSubmit: () => void;
  disabled: boolean;
}) {
  const claimedTimestamp = parseProviderTimestamp(availableAt);
  const timestampReady =
    claimedTimestamp !== undefined &&
    claimedTimestamp >= breachTimestamp &&
    claimedTimestamp <= BigInt(Math.floor(Date.now() / 1000));
  const evidenceReady =
    evidenceReadiness(evidence1) === "READY TO VERIFY" &&
    evidenceReadiness(evidence2) === "READY TO VERIFY" &&
    evidence1 !== evidence2;
  const formReady = Boolean(note.trim()) && timestampReady && evidenceReady;

  return (
    <div className="mt-4">
      <h2 className="text-xl font-bold">Show that further loss could have been avoided</h2>
      <p className="mt-1 max-w-3xl text-sm leading-5 text-paper/55">
        Submit when the agreed mitigation became available and provide evidence that it was working
        and practically accessible to the claimant.
      </p>
      <div className="mt-4 rounded-md border border-paper/12 border-l-2 border-l-violet/70 bg-paper/[0.025] px-3.5 py-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet">
          Agreed mitigation rule
        </p>
        <p className="mt-2 text-sm font-semibold leading-5 text-paper/85">
          {agreementRule || "No availability standard recorded."}
        </p>
      </div>
      <div className="mt-3 rounded-md border border-violet/20 bg-violet/[0.06] px-3.5 py-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet">
          Provider position
        </p>
        <p className="mt-1.5 text-sm leading-5 text-paper/75">
          You are claiming that the agreed mitigation became reasonably available at the claimed
          mitigation point.
        </p>
        <p className="mt-2 text-xs leading-5 text-paper/50">
          Your evidence should support when the mitigation was working and practically usable by the
          claimant.
        </p>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-md border border-violet/25 border-l-2 border-l-violet bg-violet/[0.035] p-4">
          <div className="flex items-start gap-3">
            <span className="font-mono text-xs font-bold text-violet">01</span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet">
                Claim the point
              </p>
              <p className="mt-1 text-xs text-paper/45">Claimed mitigation point</p>
            </div>
          </div>
          <div className="mt-3">
            <Label htmlFor="provider-mitigation-time">
              When do you claim the agreed mitigation became reasonably available?
              <span className="ml-1 text-coral">*</span>
            </Label>
            <Input
              id="provider-mitigation-time"
              type="datetime-local"
              value={availableAt}
              onChange={(event) => setAvailableAt(event.target.value)}
              className="mt-2 border-paper/15 bg-paper/5 text-paper"
            />
            <p className="mt-2 text-xs leading-5 text-paper/45">
              Must be between the established breach and now.
            </p>
          </div>
          {demoLossRecordedAt !== undefined && (
            <CompactClaimTimeline
              availableAt={availableAt}
              breachTimestamp={breachTimestamp}
              recordedAt={demoLossRecordedAt}
              confirmedLoss={confirmedLoss}
            />
          )}
          <div className="mt-4">
            <Label htmlFor="provider-explanation">
              Provider explanation <span className="text-coral">*</span>
            </Label>
            <Textarea
              id="provider-explanation"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-2 min-h-24 border-paper/15 bg-paper/5 text-paper"
              placeholder="Why was it working, accessible, and usable?"
            />
          </div>
          {demoLossRecordedAt !== undefined && (
            <DemoLossPreview
              availableAt={availableAt}
              breachTimestamp={breachTimestamp}
              recordedAt={demoLossRecordedAt}
              confirmedLoss={confirmedLoss}
              secured={secured}
            />
          )}
        </section>
        <section className="rounded-md border border-paper/12 bg-paper/[0.02] p-4">
          <div className="flex items-start gap-3">
            <span className="font-mono text-xs font-bold text-paper/45">02</span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-paper/70">
                Prove the claim
              </p>
              <p className="mt-1 text-xs text-paper/45">Supporting evidence</p>
            </div>
          </div>
          <div className="mt-3 space-y-3">
            <StudioDevTestingHelper />
            <EvidenceSlot
              index="01"
              kind="Operational"
              question="What proves the agreed mitigation was working?"
              value={evidence1}
              onChange={setEvidence1}
              helper="Provide a public HTTPS source showing the mitigation was operational at the claimed time."
            />
            <EvidenceSlot
              index="02"
              kind="Accessibility"
              question="What proves the claimant could practically access or use it?"
              value={evidence2}
              onChange={setEvidence2}
              helper="Provide a public HTTPS source showing the mitigation could practically be used by the claimant."
            />
          </div>
        </section>
      </div>
      <div className="mt-4 rounded-md border border-paper/10 bg-paper/[0.02] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-paper/60">
            Evidence preparation
          </p>
          <span className="text-xs font-semibold text-paper/45">2 sources</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-paper/60">
          <span>Server validation</span>
          <span aria-hidden="true" className="text-violet">
            →
          </span>
          <span>Hash</span>
          <span aria-hidden="true" className="text-violet">
            →
          </span>
          <span>Onchain submission</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-paper/45">
          Evidence URLs are fetched server-side, validated, and hashed before submission.
        </p>
      </div>
      <div className="mt-3 flex flex-col gap-3 border-t border-paper/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className={formReady ? "text-xs font-semibold text-mint" : "text-xs text-paper/50"}>
          {formReady
            ? "2 evidence sources ready"
            : "Complete the claim and both evidence sources to continue."}
        </p>
        <Button
          variant="hero"
          className="w-full shrink-0 sm:w-auto"
          onClick={onSubmit}
          disabled={disabled || !formReady}
        >
          Submit Evidence <span aria-hidden="true">→</span>
        </Button>
      </div>
    </div>
  );
}

function CompactClaimTimeline({
  availableAt,
  breachTimestamp,
  recordedAt,
  confirmedLoss,
}: {
  availableAt: string;
  breachTimestamp: bigint;
  recordedAt: bigint;
  confirmedLoss: bigint;
}) {
  const timestamp = parseProviderTimestamp(availableAt);
  return (
    <div className="mt-3 rounded-md border border-paper/10 bg-paper/[0.025] p-3">
      <div className="grid gap-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
        <ClaimTimelinePoint
          label="Breach"
          time={formatProviderTimestamp(breachTimestamp)}
          value="0 GEN"
        />
        <ClaimTimelineArrow />
        <ClaimTimelinePoint
          label="Claimed point"
          time={timestamp === undefined ? "Choose a time" : formatProviderTimestamp(timestamp)}
          value={timestamp === undefined ? "Pending" : "Selected"}
          pending={timestamp === undefined}
        />
        <ClaimTimelineArrow />
        <ClaimTimelinePoint
          label="Confirmed loss"
          time={formatProviderTimestamp(recordedAt)}
          value={formatGen(confirmedLoss) + " GEN"}
        />
      </div>
    </div>
  );
}

function ClaimTimelinePoint({
  label,
  time,
  value,
  pending = false,
}: {
  label: string;
  time: string;
  value: string;
  pending?: boolean;
}) {
  return (
    <div className={pending ? "text-paper/45" : "text-paper/70"}>
      <p className="font-bold uppercase tracking-[0.1em]">{label}</p>
      <p className="mt-1 font-mono text-[0.68rem]">{time}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function ClaimTimelineArrow() {
  return (
    <span aria-hidden="true" className="flex justify-center text-violet sm:px-1">
      <span className="sm:hidden">↓</span>
      <span className="hidden sm:inline">→</span>
    </span>
  );
}

function EvidenceSlot({
  index,
  kind,
  question,
  value,
  onChange,
  helper,
}: {
  index: string;
  kind: string;
  question: string;
  value: string;
  onChange: (value: string) => void;
  helper: string;
}) {
  const status = evidenceReadiness(value);
  const statusClass =
    status === "READY TO VERIFY"
      ? "border-mint/30 bg-mint/10 text-mint"
      : status === "CHECK URL"
        ? "border-coral/30 bg-coral/10 text-coral"
        : "border-paper/12 bg-paper/[0.03] text-paper/45";
  return (
    <div className="rounded-md border border-paper/12 bg-paper/[0.035] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-paper/55">
          Evidence {index} · {kind}
        </p>
        <span
          className={
            "rounded-full border px-2 py-1 text-[0.6rem] font-bold uppercase tracking-[0.08em] " +
            statusClass
          }
        >
          {status}
        </span>
      </div>
      <p className="mt-2 text-sm font-medium leading-5 text-paper/80">{question}</p>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 border-paper/15 bg-paper/5 text-paper"
        placeholder="https://"
        aria-label={kind + " evidence URL"}
      />
      <p className="mt-2 text-xs leading-5 text-paper/45">{helper}</p>
    </div>
  );
}

function StudioDevTestingHelper() {
  return (
    <div className="rounded-md border border-paper/10 bg-paper/[0.02] px-3 py-2.5">
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-paper/55">
        Studio Dev testing
      </p>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p className="text-xs text-paper/55">Need demo evidence to test TEMPER?</p>
        <a
          href={DEMO_EVIDENCE_LIBRARY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex whitespace-nowrap rounded-full border border-violet/30 bg-violet/[0.06] px-2.5 py-1.5 text-xs font-semibold text-violet transition-colors hover:border-violet/50 hover:bg-violet/10 hover:text-paper focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet"
        >
          Open Demo Evidence Library <span aria-hidden="true">↗</span>
        </a>
      </div>
      <p className="mt-1.5 text-[0.68rem] leading-4 text-paper/45">
        The library contains reusable Pyth evidence records for Studio Dev testing. You can also
        provide any compatible public HTTPS source.
      </p>
    </div>
  );
}

function evidenceReadiness(value: string) {
  if (!value) return "SOURCE REQUIRED";
  try {
    validateHttpsEvidence(value);
    return "READY TO VERIFY";
  } catch {
    return "CHECK URL";
  }
}

function DemoLossPreview({
  availableAt,
  breachTimestamp,
  recordedAt,
  confirmedLoss,
  secured,
}: {
  availableAt: string;
  breachTimestamp: bigint;
  recordedAt: bigint;
  confirmedLoss: bigint;
  secured: bigint;
}) {
  const timestamp = parseProviderTimestamp(availableAt);
  const lossAtPoint =
    timestamp === undefined
      ? undefined
      : interpolatedDemoLoss(timestamp, breachTimestamp, recordedAt, confirmedLoss);
  const timestampOutOfRange =
    timestamp !== undefined &&
    (timestamp < breachTimestamp || timestamp > BigInt(Math.floor(Date.now() / 1000)));

  const previewReady = lossAtPoint !== undefined && !timestampOutOfRange;
  const potentiallyAvoidable =
    previewReady && lossAtPoint < secured ? secured - lossAtPoint : previewReady ? 0n : undefined;

  return (
    <div className="mt-4 rounded-md border border-violet/30 bg-violet/10 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-violet">
          Demo loss preview
        </p>
        <span className="text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-paper/45">
          Studio Dev
        </span>
      </div>
      {!previewReady ? (
        <p className="mt-3 text-sm leading-5 text-paper/55">
          {timestampOutOfRange
            ? "Choose a time between the breach and now."
            : "Choose a mitigation time to preview the loss at that point."}
        </p>
      ) : (
        <>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.1em] text-paper/55">
            At claimed point · {formatProviderTimestamp(timestamp!)}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div className="rounded-md border border-paper/10 bg-paper/[0.035] p-3">
              <p className="text-2xl font-extrabold text-paper">{formatGen(lossAtPoint!)} GEN</p>
              <p className="mt-1 text-xs text-paper/50">Loss already incurred</p>
            </div>
            <div className="rounded-md border border-violet/25 bg-paper/[0.035] p-3">
              <p className="text-2xl font-extrabold text-violet">
                {formatGen(potentiallyAvoidable ?? 0n)} GEN
              </p>
              <p className="mt-1 text-xs text-paper/50">Potentially avoidable secured loss</p>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-paper/10 pt-3 text-xs">
            <div>
              <dt className="text-paper/45">Confirmed total</dt>
              <dd className="mt-1 font-bold text-paper/80">{formatGen(confirmedLoss)} GEN</dd>
            </div>
            <div>
              <dt className="text-paper/45">Secured</dt>
              <dd className="mt-1 font-bold text-paper/80">{formatGen(secured)} GEN</dd>
            </div>
          </dl>
        </>
      )}
    </div>
  );
}

function parseProviderTimestamp(value: string): bigint | undefined {
  if (!value) return undefined;
  const milliseconds = new Date(value).getTime();
  return Number.isFinite(milliseconds) ? BigInt(Math.floor(milliseconds / 1000)) : undefined;
}

function interpolatedDemoLoss(
  timestamp: bigint,
  breachTimestamp: bigint,
  recordedAt: bigint,
  totalLoss: bigint,
) {
  if (timestamp < breachTimestamp || recordedAt <= breachTimestamp) return undefined;
  if (timestamp >= recordedAt) return totalLoss;
  const elapsed = timestamp - breachTimestamp;
  const duration = recordedAt - breachTimestamp;
  return (totalLoss * elapsed) / duration;
}

function formatProviderTimestamp(value: bigint) {
  return new Date(Number(value) * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DisputeForm({
  response,
  setResponse,
  counterEvidence,
  setCounterEvidence,
  fallback,
  mitigationAvailableAt,
  lossAtBackup,
  confirmedLoss,
  onSubmit,
  disabled,
}: {
  response: string;
  setResponse: (value: string) => void;
  counterEvidence: string;
  setCounterEvidence: (value: string) => void;
  fallback: string;
  mitigationAvailableAt: bigint;
  lossAtBackup: bigint;
  confirmedLoss: bigint;
  onSubmit: () => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet">Claimant position</p>
      <h2 className="mt-2 text-xl font-bold">Respond to the mitigation claim</h2>
      <p className="mt-1 text-sm text-paper/55">
        Review the provider’s claimed mitigation point and submit your response and any evidence
        relevant to whether the agreed fallback was practically usable at that time.
      </p>
      <div className="mt-3 rounded-md border border-paper/10 bg-paper/[0.025] px-3.5 py-3">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-paper/55">
          Provider claim
        </p>
        <p className="mt-1.5 text-sm font-semibold leading-5 text-paper/80">
          {fallback} became reasonably available at {formatProviderTimestamp(mitigationAvailableAt)}
          .
        </p>
        <p className="mt-1 text-xs leading-5 text-paper/45">
          Loss at claimed point: {formatGen(lossAtBackup)} GEN of {formatGen(confirmedLoss)} GEN
          confirmed loss.
        </p>
      </div>
      <StudioDevTestingHelper />
      <div className="mt-4 space-y-4">
        <div>
          <Label>
            Claimant response <span className="text-coral">*</span>
          </Label>
          <Textarea
            value={response}
            onChange={(event) => setResponse(event.target.value)}
            className="mt-2 min-h-28 border-paper/15 bg-paper/5 text-paper"
            placeholder="Explain what was practically possible at the provider’s claimed mitigation point."
          />
        </div>
        <div>
          <Label>Response evidence (optional)</Label>
          <Input
            value={counterEvidence}
            onChange={(event) => setCounterEvidence(event.target.value)}
            className="mt-2 border-paper/15 bg-paper/5 text-paper"
            placeholder="https://"
          />
        </div>
        <p className="text-xs leading-5 text-paper/45">
          Provide a public HTTPS source supporting your response. Leave this blank if you do not
          have additional evidence.
        </p>
        <Button variant="hero" onClick={onSubmit} disabled={disabled}>
          Submit Response
        </Button>
      </div>
    </div>
  );
}
function JudgmentCard({
  item,
  actionSummary,
  onRequest,
  disabled,
}: {
  item: CaseOverview;
  actionSummary: string;
  onRequest: () => void;
  disabled: boolean;
}) {
  return (
    <aside className="rounded-lg border border-violet/30 bg-violet/10 p-5">
      <ActionContext
        summary={actionSummary}
        confirmedLoss={item.confirmedLoss}
        secured={securedLoss(item.confirmedLoss, item.bond)}
      />
      <Scale className="h-7 w-7 text-violet" />
      <h2 className="mt-4 text-xl font-bold">Ready for GenLayer judgment</h2>
      <p className="mt-2 text-sm text-paper/55">Question for validators</p>
      <p className="mt-4 font-semibold leading-6">
        Was the agreed mitigation reasonably available at the claimed point?
      </p>
      <div className="mt-5 space-y-1 text-xs text-paper/50">
        <p>
          Provider evidence · {item.evidence.filter((e) => e.side === "provider").length} sources
        </p>
        <p>
          Claimant evidence · {item.evidence.filter((e) => e.side === "other-party").length} source
          {item.evidence.filter((e) => e.side === "other-party").length === 1 ? "" : "s"}
        </p>
      </div>
      <Button variant="hero" className="mt-6 w-full" onClick={onRequest} disabled={disabled}>
        Request GenLayer Verdict
      </Button>
    </aside>
  );
}
function VerdictPanel({
  item,
  onAction,
  walletConnected,
  canExecute,
}: {
  item: CaseOverview;
  onAction: (write: ContractWrite) => void;
  walletConnected: boolean;
  canExecute: boolean;
}) {
  const verdict = item.verdict;
  const closed = item.status === "CLOSED";
  const settled = item.status === "SETTLED";
  const procedural = !verdict;
  const secured = securedLoss(item.confirmedLoss, item.bond);
  const outside = outsideTemperBond(item.confirmedLoss, item.bond);
  const unused = item.bond - secured;
  const headline =
    verdict === "VALID_MITIGATION"
      ? "Mitigation was reasonably available"
      : verdict === "UNDETERMINED"
        ? "Mitigation could not be established"
        : verdict === "INVALID_MITIGATION"
          ? "Mitigation was not established"
          : item.resolutionBasis === "UNCHALLENGED_MITIGATION"
            ? "Mitigation went unchallenged"
            : item.resolutionBasis === "MITIGATION_JUDGMENT_TIMEOUT"
              ? "Judgment window expired"
              : "No mitigation challenge was submitted";
  const supportingCopy =
    verdict === "UNDETERMINED"
      ? "GenLayer could not establish that the agreed mitigation was reasonably available. Under the agreement, the full secured loss remains recoverable."
      : verdict === "VALID_MITIGATION"
        ? `GenLayer determined that the agreed mitigation was reasonably available when the loss was ${formatGen(item.lossAtBackup)} GEN.`
        : verdict === "INVALID_MITIGATION"
          ? "GenLayer did not establish that the agreed mitigation was reasonably available to the other party."
          : item.resolutionBasis === "UNCHALLENGED_MITIGATION"
            ? "The other party did not dispute the submitted mitigation within the contract window."
            : item.resolutionBasis === "MITIGATION_JUDGMENT_TIMEOUT"
              ? "The mitigation dispute did not complete within the contract judgment window. The full secured loss remains recoverable."
              : "The provider did not submit a mitigation challenge before the contract deadline. The full secured loss remains recoverable.";
  const action =
    item.status === "RESOLVED"
      ? buildRequestPayout(item.id)
      : item.status === "SETTLED"
        ? buildWithdrawBond(item.id)
        : undefined;
  return (
    <section
      className={`rounded-lg border p-5 sm:p-6 ${verdict === "VALID_MITIGATION" || procedural ? "border-mint/30 bg-mint/10" : "border-coral/30 bg-coral/10"}`}
    >
      <div className="flex items-start gap-4">
        {closed ? (
          <FileCheck2 className="h-8 w-8 text-mint" />
        ) : verdict === "VALID_MITIGATION" ? (
          <CheckCircle2 className="h-8 w-8 text-mint" />
        ) : procedural ? (
          <CheckCircle2 className="h-8 w-8 text-mint" />
        ) : (
          <Circle className="h-8 w-8 text-coral" />
        )}
        <div>
          <p className="text-xs font-bold uppercase text-paper/45">
            {procedural
              ? `Procedural resolution · ${item.resolutionBasis}`
              : `GenLayer judgment: ${verdict}`}
          </p>
          <h2 className="mt-2 text-2xl font-bold">
            {closed ? "Remedy fully settled" : "Remedy determined"}
          </h2>
          <p className="mt-2 text-sm text-paper/60">
            {closed ? (
              "The remedy has been fully settled under the agreement."
            ) : (
              <>
                <span className="font-semibold text-paper/80">{headline}.</span> {supportingCopy}
              </>
            )}
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-6 border-t border-paper/10 pt-5 lg:grid-cols-2 lg:gap-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-paper/50">
            Loss &amp; coverage
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
            <Metric label="Actual confirmed loss" value={item.confirmedLoss} />
            <Metric label="Secured by TEMPER" value={secured} />
            <Metric label="Loss at mitigation point" value={item.lossAtBackup} />
            <Metric label="Outside TEMPER bond" value={outside} />
            <Metric
              label={closed ? "Unused coverage at resolution" : "Unused bond"}
              value={unused}
            />
          </dl>
        </div>
        <div className="lg:border-l lg:border-paper/10 lg:pl-8">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-paper/50">
            Remedy outcome
          </p>
          <div className="mt-3">
            <AmountSplit loss={secured} backup={item.recoverableAmount} dark />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-paper/[0.035] px-3 py-2">
            <p className="text-xs text-paper/50">
              {closed ? "Current remaining bond" : "Remaining bond to provider"}
            </p>
            <p className="font-bold">{formatGen(item.providerRemainder)} GEN</p>
          </div>
        </div>
      </div>
      {item.status === "RESOLVED" && (
        <p className="mt-5 text-sm text-paper/65">
          {procedural
            ? "Procedural remedy ready for settlement. The recoverable and avoidable amounts come from the contract’s timeout resolution."
            : "Remedy ready for settlement. The GenLayer judgment has been applied to the secured loss."}
        </p>
      )}
      {settled && (
        <div className="mt-5 rounded-md border border-mint/20 bg-mint/5 p-3.5">
          <p className="text-sm text-paper/65">
            {procedural
              ? "Remedy settled. TEMPER applied the contract’s procedural resolution to the secured bond."
              : "Remedy settled. TEMPER applied the GenLayer judgment to the secured bond."}
          </p>
          <p className="mt-2 text-xs font-semibold text-paper/50">
            {formatGen(item.recoverableAmount)} GEN claimant remedy ·{" "}
            {formatGen(item.providerRemainder)} GEN remaining bond to provider
          </p>
          <div className="mt-4 border-t border-paper/10 pt-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-paper/50">
              Settlement
            </p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-paper/45">Claimant remedy</dt>
                <dd className="mt-1 text-xl font-bold">{formatGen(item.recoverableAmount)} GEN</dd>
              </div>
              <div>
                <dt className="text-xs text-paper/45">Remaining bond to provider</dt>
                <dd className="mt-1 text-xl font-bold">{formatGen(item.providerRemainder)} GEN</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs leading-5 text-paper/55">
              TEMPER executed the {formatGen(item.recoverableAmount)} GEN claimant remedy from the
              secured bond. The remaining {formatGen(item.providerRemainder)} GEN is available for
              the provider to withdraw.
            </p>
            {!canExecute && (
              <div className="mt-3 border-t border-paper/10 pt-3">
                {walletConnected && item.role !== "Provider" ? (
                  <>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet">
                      Provider action required
                    </p>
                    <p className="mt-1 text-xs leading-5 text-paper/60">
                      The remaining {formatGen(item.providerRemainder)} GEN bond can only be
                      withdrawn by the agreement provider.
                    </p>
                    <p className="mt-1 text-xs text-paper/50">
                      Waiting for the provider to withdraw the remaining bond.
                    </p>
                  </>
                ) : !walletConnected ? (
                  <p className="text-xs text-paper/55">
                    Connect the provider wallet to withdraw the remaining bond.
                  </p>
                ) : (
                  <p className="text-xs text-paper/55">
                    The provider wallet is connected, but the wallet session is not ready to
                    withdraw the remaining bond.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {closed && (
        <div className="mt-5 rounded-md border border-mint/20 bg-mint/5 p-3.5">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-paper/50">
            Final settlement
          </p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-paper/45">Claimant remedy</dt>
              <dd className="mt-1 text-xl font-bold">{formatGen(item.recoverableAmount)} GEN</dd>
            </div>
            <div>
              <dt className="text-xs text-paper/45">Returned to provider</dt>
              <dd className="mt-1 text-xl font-bold">{formatGen(item.amountWithdrawn)} GEN</dd>
            </div>
            <div>
              <dt className="text-xs text-paper/45">Remaining bond</dt>
              <dd className="mt-1 text-xl font-bold">{formatGen(item.remainingBond)} GEN</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-paper/55">No further action required.</p>
        </div>
      )}
      {action &&
        !closed &&
        (canExecute ? (
          <Button variant="hero" className="mt-6" onClick={() => onAction(action)}>
            {item.status === "RESOLVED"
              ? "Settle Remedy"
              : item.providerRemainder > 0n
                ? `Withdraw ${formatGen(item.providerRemainder)} GEN Remaining Bond`
                : "Close Case"}
          </Button>
        ) : !settled ? (
          <p className="mt-5 text-sm text-paper/60">
            Connect a wallet with permission to execute this next contract action.
          </p>
        ) : null)}
    </section>
  );
}
function Metric({ label, value }: { label: string; value: bigint }) {
  return (
    <div>
      <dt className="text-paper/45">{label}</dt>
      <dd className="mt-1 font-bold">{formatGen(value)} GEN</dd>
    </div>
  );
}
function DemoLossTimeline({ item, recordedAt }: { item: CaseOverview; recordedAt: bigint }) {
  const mitigationSubmitted = item.mitigationAvailableAt !== 0n;

  return (
    <div className="mt-3">
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-stretch">
        <LossTimelineNode
          label="Breach"
          time={formatTimelineTimestamp(item.establishedBreachTimestamp)}
          value="0 GEN"
          detail="Service failure"
        />
        <TimelineArrow />
        <LossTimelineNode
          label="Mitigation point"
          time={
            mitigationSubmitted
              ? formatTimelineTimestamp(item.mitigationAvailableAt)
              : "Not submitted"
          }
          value={
            mitigationSubmitted
              ? `${formatGen(item.lossAtBackup)} GEN at point`
              : "Provider claim pending"
          }
          detail={
            mitigationSubmitted
              ? "Claimed availability"
              : "Provider has not yet submitted when the mitigation became available."
          }
          pending={!mitigationSubmitted}
        />
        <TimelineArrow />
        <LossTimelineNode
          label="Confirmed loss"
          time={formatTimelineTimestamp(recordedAt)}
          value={`${formatGen(item.confirmedLoss)} GEN`}
          detail="Measured total"
        />
      </div>
    </div>
  );
}

function LossTimelineNode({
  label,
  time,
  value,
  detail,
  pending = false,
}: {
  label: string;
  time: string;
  value: string;
  detail: string;
  pending?: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-3 py-3 ${pending ? "border-violet/30 bg-violet/10" : "border-paper/12 bg-paper/[0.025]"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-paper/55">
          {label}
        </p>
      </div>
      <p className="mt-2 font-mono text-xs text-paper/55">{time}</p>
      <p className="mt-1 font-bold">{value}</p>
      <p className="mt-1 text-xs leading-4 text-paper/45">{detail}</p>
    </div>
  );
}

function TimelineArrow() {
  return (
    <span aria-hidden="true" className="flex items-center justify-center px-1 text-lg text-violet">
      <span className="lg:hidden">↓</span>
      <span className="hidden lg:inline">→</span>
    </span>
  );
}

function formatTimelineTimestamp(value: bigint) {
  return value === 0n
    ? "Not set"
    : new Date(Number(value) * 1000).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}
function EmptyEvidence({ title, text }: { title?: string; text: string }) {
  return (
    <div className="rounded-lg border border-paper/12 bg-paper/[0.02] px-4 py-3.5 text-center">
      {title && (
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-paper/60">{title}</p>
      )}
      <p className={title ? "mt-1 text-sm text-paper/50" : "text-sm text-paper/50"}>{text}</p>
    </div>
  );
}
function Timeline({ item }: { item: CaseOverview }) {
  const providerClaimSubmitted =
    item.evidence.some((evidence) => evidence.side === "provider") ||
    [
      "MITIGATION_CHALLENGED",
      "MITIGATION_DISPUTED",
      "JUDGMENT_PENDING",
      "RESOLVED",
      "SETTLED",
    ].includes(item.status);
  const claimantResponseSubmitted =
    ["MITIGATION_DISPUTED", "JUDGMENT_PENDING", "RESOLVED", "SETTLED"].includes(item.status) ||
    Boolean(item.claimantResponse?.trim()) ||
    item.evidence.some((evidence) => evidence.side === "other-party");
  const judgmentResolved =
    ["RESOLVED", "SETTLED"].includes(item.status) ||
    (item.status === "CLOSED" && Boolean(item.verdict));
  const judgmentRequested = item.status === "JUDGMENT_PENDING";
  const readyForJudgment = item.status === "MITIGATION_DISPUTED";
  const stages = [
    { label: "Case opened", complete: true, current: item.status === "CLAIM_OPEN" },
    {
      label: "Provider mitigation claim submitted",
      complete: providerClaimSubmitted,
      current: item.status === "CLAIM_OPEN",
    },
    {
      label: "Claimant response submitted",
      complete: claimantResponseSubmitted,
      current: item.status === "MITIGATION_CHALLENGED",
    },
    {
      label: judgmentRequested ? "GenLayer judgment pending" : "Ready for GenLayer judgment",
      complete: judgmentResolved,
      current: readyForJudgment || judgmentRequested,
    },
  ];

  if (judgmentResolved) {
    stages.push({
      label: item.status === "CLOSED" ? "Remedy settled" : "Remedy determined",
      complete: true,
      current: item.status === "RESOLVED",
    });
  }
  if (item.status === "SETTLED") {
    stages.push({ label: "Remedy settled", complete: true, current: true });
  }
  if (item.status === "CLOSED") {
    stages.push({ label: "Case closed", complete: true, current: true });
  }

  return (
    <div className="space-y-5">
      {stages.map((stage) => (
        <div key={stage.label} className="flex gap-4">
          {stage.complete ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-violet" />
          ) : (
            <Circle
              className={`h-5 w-5 shrink-0 ${stage.current ? "text-violet" : "text-paper/25"}`}
            />
          )}
          <div>
            <b
              className={`text-sm ${stage.complete || stage.current ? "text-paper" : "text-paper/45"}`}
            >
              {stage.label}
            </b>
          </div>
        </div>
      ))}
    </div>
  );
}
function toastSuccess(method: string) {
  void import("sonner").then(({ toast }) =>
    toast.success(`${method.replaceAll("_", " ")} finalized`),
  );
}
