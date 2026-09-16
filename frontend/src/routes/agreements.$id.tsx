import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CircleCheck, Radio, RefreshCw } from "lucide-react";
import { Fragment, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppPage, PageContainer } from "@/components/temper/shell";
import {
  ExplorerLink,
  TransactionRunner,
  TransactionSequence,
} from "@/components/temper/transaction";
import {
  CopyAddress,
  LifecycleStepper,
  StatusBadge,
  TechnicalDetails,
  TestnetBadge,
} from "@/components/temper/ui";
import { useWallet } from "@/lib/genlayer/wallet";
import {
  allowTemperManualRefresh,
  buildAcceptAgreement,
  buildDemoLiability,
  buildFundBond,
  buildOpenClaim,
  buildTriggerTimeout,
  clearAgreementReadCache,
  getAgreement,
  rpcErrorMessage,
  temperQueryKey,
  verifyDemoLiabilityRecord,
} from "@/lib/temper/adapter";
import { isSupportedDemoLiabilitySource } from "@/lib/temper/contracts";
import {
  createLiabilityReceiptId,
  formatGen,
  outsideTemperBond,
  parseGenOrZero,
  securedLoss,
  shortAddress,
  unixNow,
} from "@/lib/temper/format";
import type { DemoLiabilityRecord } from "@/lib/temper/adapter";
import type { Agreement, ContractWrite } from "@/lib/temper/types";

type CaseStartState =
  "idle" | "checking" | "new_record_required" | "verifying" | "resume_open_claim" | "error";
type DemoCaseStep = "liability" | "case";
type VerificationIssue = "not_found" | "read_error" | "mismatch";

export const Route = createFileRoute("/agreements/$id")({
  head: () => ({
    meta: [
      { title: "Agreement Details · TEMPER" },
      {
        name: "description",
        content: "Review the service, agreed mitigation, bond, lifecycle, and any open case.",
      },
    ],
  }),
  component: AgreementDetail,
});

function AgreementDetail() {
  const { id } = Route.useParams();
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const [showCaseForm, setShowCaseForm] = useState(false);
  const [loss, setLoss] = useState("");
  const [breachAt, setBreachAt] = useState("");
  const [lossRecordedAt, setLossRecordedAt] = useState("");
  const [liabilityReceiptId, setLiabilityReceiptId] = useState<string>();
  const [verifiedLiabilityRecord, setVerifiedLiabilityRecord] = useState<DemoLiabilityRecord>();
  const [receiptCheck, setReceiptCheck] = useState<
    "NOT_FOUND" | "EXISTS_VALID" | "EXISTS_MISMATCH"
  >();
  const [checkingReceipt, setCheckingReceipt] = useState(false);
  const [caseStartState, setCaseStartState] = useState<CaseStartState>("idle");
  const [demoStep, setDemoStep] = useState<DemoCaseStep>("liability");
  const [demoTransactionRequested, setDemoTransactionRequested] = useState(false);
  const [verificationIssue, setVerificationIssue] = useState<VerificationIssue>();
  const [demoFormAttempted, setDemoFormAttempted] = useState(false);
  const [activeWrite, setActiveWrite] = useState<"accept" | "fund" | "timeout" | undefined>();
  const [error, setError] = useState<string>();
  const casePreparationRun = useRef(0);
  const {
    data: agreement,
    isLoading,
    isFetching,
    isError,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: temperQueryKey("agreement", id, wallet.address),
    queryFn: () => getAgreement(id, wallet.address),
  });

  const invalidate = async () => {
    setError(undefined);
    clearAgreementReadCache(id);
    await queryClient.invalidateQueries({
      queryKey: temperQueryKey("agreement", id),
      refetchType: "active",
    });
    await queryClient.invalidateQueries({
      queryKey: temperQueryKey("agreements"),
      refetchType: "none",
    });
    await queryClient.invalidateQueries({
      queryKey: temperQueryKey("cases"),
      refetchType: "none",
    });
  };

  const agreementExpired = Boolean(
    agreement && agreement.agreementExpiry !== 0n && agreement.agreementExpiry <= unixNow(),
  );
  const canStartCase = Boolean(
    agreement &&
    agreement.status === "ACTIVE" &&
    agreement.role === "Other party" &&
    !agreement.caseId &&
    !agreementExpired,
  );
  const providerWaitingForCase = Boolean(
    agreement &&
    agreement.status === "ACTIVE" &&
    agreement.role === "Provider" &&
    !agreement.caseId &&
    !agreementExpired &&
    (!agreement.nextAction || agreement.nextAction.label.startsWith("Waiting")),
  );
  const supportedDemoSource = isSupportedDemoLiabilitySource(agreement?.trustedLiabilitySource);
  const closeCaseForm = () => {
    casePreparationRun.current += 1;
    setShowCaseForm(false);
    setLiabilityReceiptId(undefined);
    setVerifiedLiabilityRecord(undefined);
    setReceiptCheck(undefined);
    setCheckingReceipt(false);
    setCaseStartState("idle");
    setDemoStep("liability");
    setDemoTransactionRequested(false);
    setVerificationIssue(undefined);
    setDemoFormAttempted(false);
  };
  const beginCaseStart = () => {
    if (!agreement || !supportedDemoSource) {
      setError(
        "This agreement is bound to an unsupported liability source. Create a new agreement to use the current demo-case flow.",
      );
      setCaseStartState("error");
      return;
    }
    setError(undefined);
    setVerificationIssue(undefined);
    setVerifiedLiabilityRecord(undefined);
    setReceiptCheck(undefined);
    setCheckingReceipt(true);
    setCaseStartState("checking");
    setShowCaseForm(false);
    setDemoTransactionRequested(false);
    setDemoFormAttempted(false);
    const run = ++casePreparationRun.current;
    void (async () => {
      try {
        const receiptId = await createLiabilityReceiptId(agreement!.id);
        const check = await verifyDemoLiabilityRecord(
          agreement.trustedLiabilitySource,
          receiptId,
          {
            agreementId: agreement.id,
            provider: agreement.provider,
            claimant: agreement.otherParty,
          },
          "user",
        );
        if (run !== casePreparationRun.current) return;
        if (check.status === "EXISTS_MISMATCH") {
          throw new Error(
            "The deterministic confirmed-loss record exists, but its stored agreement or parties do not match this agreement. No transaction was submitted.",
          );
        }
        setLiabilityReceiptId(receiptId);
        setReceiptCheck(check.status);
        setVerifiedLiabilityRecord(check.status === "EXISTS_VALID" ? check.record : undefined);
        setShowCaseForm(true);
        setDemoStep(check.status === "EXISTS_VALID" ? "case" : "liability");
        setDemoTransactionRequested(false);
        setCaseStartState(
          check.status === "EXISTS_VALID" ? "resume_open_claim" : "new_record_required",
        );
      } catch (reason) {
        if (run !== casePreparationRun.current) return;
        setCaseStartState("error");
        const message = reason instanceof Error ? reason.message : String(reason);
        setError(
          message.includes("No transaction was submitted.")
            ? message
            : `TEMPER could not read the liability record right now. ${rpcErrorMessage(reason)}`,
        );
      } finally {
        if (run === casePreparationRun.current) setCheckingReceipt(false);
      }
    })();
  };
  const createCaseWrites = useMemo(() => {
    if (!agreement || !canStartCase || !wallet.address) return [];
    if (!liabilityReceiptId || !receiptCheck || receiptCheck === "EXISTS_MISMATCH") return [];
    if (
      caseStartState === "resume_open_claim" &&
      receiptCheck === "EXISTS_VALID" &&
      verifiedLiabilityRecord &&
      demoTransactionRequested
    ) {
      return [buildOpenClaim(agreement.id, liabilityReceiptId)];
    }
    if (caseStartState !== "new_record_required" || !demoTransactionRequested) return [];
    try {
      const totalLoss = parseGenOrZero(loss);
      const breachTimestamp = parseDatetimeLocal(breachAt, "Established breach time");
      const recordedAt = parseDatetimeLocal(lossRecordedAt, "Confirmed-loss measurement time");
      const now = unixNow();
      if (totalLoss === 0n) throw new Error("Enter a positive whole GEN loss.");
      if (breachTimestamp >= recordedAt) {
        throw new Error("The breach must be before the confirmed-loss measurement.");
      }
      if (breachTimestamp > now || recordedAt > now) {
        throw new Error("Demo timestamps cannot be in the future.");
      }
      if (receiptCheck !== "NOT_FOUND") return [];
      return [
        buildDemoLiability(
          agreement.trustedLiabilitySource,
          liabilityReceiptId,
          agreement.id,
          agreement.provider,
          agreement.otherParty,
          breachTimestamp,
          totalLoss,
          recordedAt,
        ),
      ];
    } catch {
      return [];
    }
  }, [
    agreement,
    breachAt,
    canStartCase,
    caseStartState,
    demoTransactionRequested,
    liabilityReceiptId,
    loss,
    lossRecordedAt,
    receiptCheck,
    verifiedLiabilityRecord,
    wallet.address,
  ]);

  const verifyOnchainLiability = async () => {
    if (!agreement || !liabilityReceiptId) return;
    setError(undefined);
    setVerificationIssue(undefined);
    setDemoTransactionRequested(false);
    setShowCaseForm(true);
    setCaseStartState("verifying");
    try {
      const verification = await verifyDemoLiabilityRecord(
        agreement.trustedLiabilitySource,
        liabilityReceiptId,
        {
          agreementId: agreement.id,
          provider: agreement.provider,
          claimant: agreement.otherParty,
          breachTimestamp: parseDatetimeLocal(breachAt, "Established breach time"),
          totalClaimedLoss: parseGenOrZero(loss),
          lossRecordedAt: parseDatetimeLocal(lossRecordedAt, "Confirmed-loss measurement time"),
        },
        "critical",
      );
      if (verification.status === "NOT_FOUND") {
        setVerificationIssue("not_found");
        setCaseStartState("error");
        setDemoTransactionRequested(false);
        setError(
          "The expected liability record could not be found in DemoLiabilitySource. Retry verification before opening the TEMPER case.",
        );
        return;
      }
      if (verification.status === "EXISTS_MISMATCH") {
        setVerificationIssue("mismatch");
        setVerifiedLiabilityRecord(undefined);
        setCaseStartState("error");
        setDemoTransactionRequested(false);
        setError(
          "The onchain liability record does not match this agreement or the submitted demo values. Opening the TEMPER case is blocked.",
        );
        return;
      }
      setVerifiedLiabilityRecord(verification.record);
      setReceiptCheck("EXISTS_VALID");
      setDemoStep("case");
      setCaseStartState("resume_open_claim");
      setDemoTransactionRequested(false);
      setError(undefined);
    } catch (reason) {
      setVerificationIssue("read_error");
      setCaseStartState("error");
      setDemoTransactionRequested(false);
      setError(`TEMPER could not read the liability record right now. ${rpcErrorMessage(reason)}`);
    }
  };

  if (isLoading) return <LoadingAgreement />;
  if (isError && !agreement)
    return (
      <AgreementError
        message={rpcErrorMessage(queryError)}
        onRefresh={() => {
          if (!allowTemperManualRefresh(`agreement:${id}`)) return;
          clearAgreementReadCache(id);
          void refetch();
        }}
      />
    );
  if (!agreement)
    return (
      <AgreementError
        message="Agreement not found on Studio Dev."
        onRefresh={() => {
          if (!allowTemperManualRefresh(`agreement:${id}`)) return;
          clearAgreementReadCache(id);
          void refetch();
        }}
      />
    );

  const hasCase = Boolean(agreement.caseId);
  const canAccept =
    agreement.status === "PROPOSED" && agreement.role === "Other party" && !agreementExpired;
  const canFund =
    agreement.status === "ACCEPTED" && agreement.role === "Provider" && !agreementExpired;
  const canTimeout =
    ["PROPOSED", "ACCEPTED", "ACTIVE"].includes(agreement.status) &&
    agreementExpired &&
    Boolean(wallet.kit && wallet.connectedClient);
  const invalidLoss = (() => {
    try {
      const total = parseGenOrZero(loss);
      const breachTimestamp = parseDatetimeLocal(breachAt, "Established breach time");
      const recordedAt = parseDatetimeLocal(lossRecordedAt, "Confirmed-loss measurement time");
      const now = unixNow();
      return (
        total === 0n ||
        breachTimestamp < 0n ||
        recordedAt < 0n ||
        breachTimestamp >= recordedAt ||
        breachTimestamp > now ||
        recordedAt > now
      );
    } catch {
      return true;
    }
  })();
  const setupTitle = agreementExpired
    ? "Agreement expired"
    : agreement.status === "PROPOSED"
      ? canAccept
        ? "Review this agreement"
        : "Waiting for the other party"
      : agreement.status === "ACCEPTED"
        ? "Agreement accepted"
        : "Agreement active";
  const setupCopy = agreementExpired
    ? "The agreement reached its expiry before the next setup action was completed. Trigger the permissionless timeout to close it."
    : agreement.status === "PROPOSED"
      ? canAccept
        ? "You have been named as the other party. Review the covered service, agreed mitigation, availability standard, coverage limit, and agreement window before accepting."
        : "The agreement has been created. The other party must accept the terms before you can fund the bond."
      : agreement.status === "ACCEPTED"
        ? "The agreement has been accepted. The provider must now fund the bond before it becomes active."
        : agreement.status === "ACTIVE"
          ? agreement.role === "Other party"
            ? "A remedy case can begin after responsibility and a confirmed loss have been established upstream."
            : agreement.role === "Provider"
              ? `Your ${formatGen(agreement.remainingBond)} GEN bond is securing this agreement.`
              : "This active agreement is read-only for your wallet."
          : "The service, mitigation terms, bond, and duration are now in place.";
  const casePreview = (() => {
    try {
      const total = parseGenOrZero(loss);
      return {
        actual: formatGen(total),
        secured: formatGen(securedLoss(total, agreement.coverageLimitWei)),
        outside: formatGen(outsideTemperBond(total, agreement.coverageLimitWei)),
        breach: breachAt
          ? formatTimestamp(parseDatetimeLocal(breachAt, "Established breach time"))
          : "—",
        recorded: lossRecordedAt
          ? formatTimestamp(parseDatetimeLocal(lossRecordedAt, "Confirmed-loss measurement time"))
          : "—",
      };
    } catch {
      return { actual: "—", secured: "—", outside: "—", breach: "—", recorded: "—" };
    }
  })();

  return (
    <AppPage>
      <PageContainer>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap gap-2">
              <TestnetBadge label="STUDIO DEV" />
              <StatusBadge status={agreement.status} />
            </div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-violet">
              Bonded service agreement
            </p>
            <h1 className="mt-4 text-4xl font-extrabold sm:text-5xl">{agreement.title}</h1>
            <p className="mt-3 text-paper/50">Agreement {agreement.id} · Studio Dev</p>
          </div>
          {agreement.caseId && (
            <Button asChild variant="glass">
              <Link to="/cases/$id" params={{ id: agreement.caseId }}>
                View Case <ArrowRight />
              </Link>
            </Button>
          )}
          <Button
            variant="glass"
            size="icon"
            onClick={() => {
              if (!allowTemperManualRefresh(`agreement:${id}`)) return;
              clearAgreementReadCache(id);
              void refetch();
            }}
            aria-label="Refresh agreement"
            title="Refresh agreement"
          >
            <RefreshCw className={isFetching ? "animate-spin" : ""} />
          </Button>
        </div>
        {isError && (
          <p className="mt-4 text-sm text-coral" role="alert">
            {rpcErrorMessage(queryError, agreement !== undefined)}
          </p>
        )}
        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            <section className="rounded-lg border border-paper/12 bg-paper/[0.045] p-5 sm:p-6">
              <h2 className="text-xl font-bold">Bonded service agreement</h2>
              <dl className="mt-5 grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-6">
                <div className="lg:col-span-3">
                  <Term label="Service" value={agreement.serviceDescription} />
                </div>
                <div className="lg:col-span-3">
                  <Term label="Fallback obligation" value={agreement.mitigationCovenant} />
                </div>
                <div className="lg:col-span-4">
                  <Term label="Availability standard" value={agreement.allowedMitigationPolicy} />
                </div>
                <div className="lg:col-span-2">
                  <Term label="Coverage" value={`${formatGen(agreement.bond)} GEN`} />
                </div>
                <div className="lg:col-span-2">
                  <Term label="Status" value={agreement.status} />
                </div>
                <div className="lg:col-span-2">
                  <Term label="Expiry" value={formatTimestamp(agreement.agreementExpiry)} />
                </div>
                <div className="lg:col-span-2">
                  <div className="border-b border-paper/10 pb-3">
                    <dt className="text-xs text-paper/45">Other party</dt>
                    <dd className="mt-1">
                      <CopyAddress address={agreement.otherParty} inverse />
                    </dd>
                  </div>
                </div>
              </dl>
              <p className="mt-4 text-xs leading-5 text-paper/55">
                The bond is the maximum amount secured by TEMPER. A confirmed loss can be larger,
                but TEMPER can settle only the secured amount.
              </p>
              <div className="mt-4 rounded-md border border-mint/20 bg-mint/10 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 shrink-0 text-mint" />
                  <h3 className="text-xs font-bold uppercase tracking-[0.12em]">
                    {hasCase ? "A remedy case is open" : "No open remedy dispute"}
                  </h3>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-paper/55">
                  {hasCase
                    ? "The confirmed loss and mitigation question are now being reviewed."
                    : "No confirmed-loss case has been opened against this agreement."}
                </p>
              </div>
            </section>
            {agreement.status === "ACTIVE" && canStartCase && supportedDemoSource && (
              <StudioDevArchitectureModule />
            )}
          </div>
          <aside className="space-y-4">
            {!hasCase && (
              <div className="rounded-lg border border-violet/40 bg-violet/10 p-5">
                {agreement.status === "ACCEPTED" ? (
                  <CircleCheck className="h-6 w-6 text-violet" />
                ) : (
                  <Radio className="h-6 w-6 text-violet" />
                )}
                <h2 className="mt-5 text-xl font-bold">{setupTitle}</h2>
                <p className="mt-2 text-sm leading-6 text-paper/60">{setupCopy}</p>
                {agreement.status === "PROPOSED" && !canAccept && (
                  <Waiting label="Waiting on" value={shortAddress(agreement.otherParty)} />
                )}
                {agreement.status === "PROPOSED" && canAccept && (
                  <>
                    <Waiting
                      label="COVERAGE LIMIT"
                      value={`${formatGen(agreement.coverageLimitWei)} GEN`}
                    />
                    <p className="mt-4 text-sm leading-6 text-paper/60">
                      This agreement can secure up to {formatGen(agreement.coverageLimitWei)} GEN
                      once the provider funds the bond after acceptance.
                    </p>
                    <Button
                      variant="hero"
                      className="mt-5 w-full"
                      onClick={() => {
                        setActiveWrite("accept");
                        setError(undefined);
                      }}
                      disabled={Boolean(activeWrite)}
                    >
                      Accept Agreement
                    </Button>
                  </>
                )}
                {agreement.status === "ACCEPTED" && canFund && (
                  <>
                    <Waiting
                      label="Bond required"
                      value={`${formatGen(agreement.coverageLimitWei)} GEN`}
                    />
                    <Button
                      variant="hero"
                      className="mt-5 w-full"
                      onClick={() => {
                        setActiveWrite("fund");
                        setError(undefined);
                      }}
                      disabled={Boolean(activeWrite)}
                    >
                      Fund {formatGen(agreement.coverageLimitWei)} GEN
                    </Button>
                  </>
                )}
                {agreement.status === "ACCEPTED" && !canFund && (
                  <Waiting label="Next" value="Waiting for provider to fund bond" />
                )}
                {agreement.status === "ACTIVE" && canStartCase && supportedDemoSource && (
                  <>
                    <div className="mt-4 border-t border-violet/20 pt-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">
                        Simulate a service failure
                      </p>
                      <p className="mt-1.5 text-sm leading-5 text-paper/65">
                        Studio Dev uses an onchain demo liability record to simulate an upstream
                        finding that the service failed and caused confirmed loss.
                      </p>
                    </div>
                    <Button
                      variant="hero"
                      className="mt-4 w-full"
                      onClick={() => void beginCaseStart()}
                      disabled={checkingReceipt}
                    >
                      {checkingReceipt ? "Checking existing liability record…" : "Start Demo Case"}
                    </Button>
                  </>
                )}
                {agreement.status === "ACTIVE" && canStartCase && !supportedDemoSource && (
                  <Waiting
                    label="Legacy test agreement"
                    value="This agreement uses an unsupported liability source. Create a new agreement to test the current flow."
                  />
                )}
                {providerWaitingForCase && (
                  <div className="mt-5 border-t border-paper/10 pt-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">
                      What happens next
                    </p>
                    <p className="mt-2 text-sm leading-6 text-paper/60">
                      If the other party opens a valid remedy case, you’ll be asked to respond and
                      submit evidence about the agreed mitigation.
                    </p>
                    <Waiting label="CURRENT STATUS" value="Waiting for a case to be opened." />
                  </div>
                )}
                {agreement.status === "ACTIVE" &&
                  agreement.role === "Observer" &&
                  !agreementExpired && <Waiting label="READ-ONLY" value="Agreement active" />}
                {agreementExpired && (
                  <>
                    <Waiting label="Next" value="Trigger timeout to close this agreement" />
                    {canTimeout && (
                      <Button
                        variant="hero"
                        className="mt-5 w-full"
                        onClick={() => {
                          setActiveWrite("timeout");
                          setError(undefined);
                        }}
                        disabled={Boolean(activeWrite)}
                      >
                        Trigger Timeout
                      </Button>
                    )}
                  </>
                )}
                {agreement.status === "ACTIVE" && (
                  <div className="mt-4 border-t border-paper/10 pt-4 text-sm">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-paper/45">Bonded</p>
                        <p className="mt-1 font-bold">{formatGen(agreement.totalBondFunded)} GEN</p>
                      </div>
                      <div>
                        <p className="text-xs text-paper/45">Status</p>
                        <p className="mt-1 font-bold">Active</p>
                      </div>
                    </div>
                  </div>
                )}
                {activeWrite === "accept" && wallet.kit && wallet.connectedClient && (
                  <TransactionRunner
                    kit={wallet.kit}
                    client={wallet.connectedClient}
                    write={buildAcceptAgreement(agreement.id)}
                    onError={(reason) => setError(reason.message)}
                    onDismiss={() => {
                      setActiveWrite(undefined);
                    }}
                    onSuccess={async (txId) => {
                      await invalidate();
                      toast.success("Agreement accepted");
                      setActiveWrite(undefined);
                      void txId;
                    }}
                    label="Accept agreement"
                  />
                )}
                {activeWrite === "fund" && wallet.kit && wallet.connectedClient && (
                  <TransactionRunner
                    kit={wallet.kit}
                    client={wallet.connectedClient}
                    write={buildFundBond(agreement.id, agreement.coverageLimitWei)}
                    onError={(reason) => setError(reason.message)}
                    onDismiss={() => {
                      setActiveWrite(undefined);
                    }}
                    onSuccess={async (txId) => {
                      await invalidate();
                      toast.success("Bond funded");
                      setActiveWrite(undefined);
                      void txId;
                    }}
                    label="Fund bond"
                  />
                )}
                {activeWrite === "timeout" && wallet.kit && wallet.connectedClient && (
                  <TransactionRunner
                    kit={wallet.kit}
                    client={wallet.connectedClient}
                    write={buildTriggerTimeout(agreement.id)}
                    onError={(reason) => setError(reason.message)}
                    onDismiss={() => {
                      setActiveWrite(undefined);
                    }}
                    onSuccess={async (txId) => {
                      await invalidate();
                      toast.success("Agreement timeout finalized");
                      setActiveWrite(undefined);
                      void txId;
                    }}
                    label="Trigger timeout"
                  />
                )}
                {error && (
                  <p className="mt-4 text-sm text-coral" role="alert">
                    {error}
                  </p>
                )}
              </div>
            )}
            <TechnicalDetails caseId={agreement.caseId} />
          </aside>
        </div>
        <div className="mt-8 rounded-lg border border-paper/12 bg-paper/[0.045] p-6">
          <LifecycleStepper {...lifecycleState(agreement)} />
        </div>
        <Dialog
          open={showCaseForm && !demoTransactionRequested}
          onOpenChange={(open) => {
            if (!open) closeCaseForm();
          }}
        >
          <DialogContent className="flex max-h-[calc(100dvh-2rem)] min-h-0 max-w-[920px] flex-col gap-0 overflow-hidden border-paper/12 bg-[#17151f] p-4 text-paper sm:max-h-[calc(100dvh-3rem)] sm:p-6">
            <DialogHeader className="pr-8 text-left">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <TestnetBadge label="STUDIO DEV DEMO" />
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-paper/45">
                  Step {demoStep === "liability" ? "1" : "2"} of 2
                </span>
              </div>
              <div
                className="mt-4 flex flex-wrap items-center gap-1.5"
                aria-label="Demo case steps"
              >
                {[
                  {
                    step: "1",
                    label: "Simulate upstream liability",
                    current: demoStep === "liability",
                  },
                  { step: "2", label: "Open TEMPER case", current: demoStep === "case" },
                ].map(({ step, label, current }, index) => (
                  <Fragment key={step}>
                    {index > 0 && (
                      <span className="text-violet" aria-hidden="true">
                        →
                      </span>
                    )}
                    <div
                      className={`rounded border px-2.5 py-1.5 text-xs font-semibold ${
                        current
                          ? "border-violet/45 bg-violet/10 text-violet"
                          : "border-paper/10 bg-paper/[0.03] text-paper/45"
                      }`}
                    >
                      <span className="mr-2 font-mono">0{step}</span>
                      {label}
                    </div>
                  </Fragment>
                ))}
                <span className="rounded-full border border-paper/10 bg-paper/[0.03] px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-paper/45">
                  {receiptCheck === "EXISTS_VALID" ? "1 approval remaining" : "2 wallet approvals"}
                </span>
              </div>
              <DialogTitle className="mt-5 text-2xl font-bold text-paper">
                {demoStep === "liability"
                  ? "Simulate the upstream loss record"
                  : "Open the TEMPER remedy case"}
              </DialogTitle>
              <DialogDescription className="mt-1.5 max-w-2xl text-sm leading-5 text-paper/55">
                {demoStep === "liability"
                  ? "Create the simulated upstream liability result TEMPER will verify before opening the remedy case."
                  : "Use the verified onchain receipt to open the post-liability remedy case."}
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 pr-1 pt-4">
              {caseStartState === "verifying" ? (
                <div className="mt-4 rounded-md border border-violet/35 bg-violet/10 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">
                    Verifying onchain record
                  </p>
                  <p className="mt-2 text-lg font-bold">
                    Reading the liability record back from DemoLiabilitySource…
                  </p>
                  <p className="mt-2 text-sm leading-6 text-paper/60">
                    TEMPER will open the remedy-case step only after the stored receipt and loss
                    record have been verified.
                  </p>
                </div>
              ) : verificationIssue ? (
                <div
                  className="mt-4 rounded-md border border-coral/30 bg-coral/10 p-4"
                  role="alert"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-coral">
                    {verificationIssue === "not_found"
                      ? "Onchain record not found"
                      : verificationIssue === "mismatch"
                        ? "Liability record mismatch"
                        : "Unable to verify onchain record"}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-paper/70">{error}</p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button variant="hero" onClick={() => void verifyOnchainLiability()}>
                      Retry verification
                    </Button>
                    <Button
                      variant="glass"
                      onClick={() => {
                        setVerificationIssue(undefined);
                        setCaseStartState("new_record_required");
                        setDemoFormAttempted(false);
                      }}
                    >
                      Return to Step 1
                    </Button>
                  </div>
                </div>
              ) : demoStep === "liability" ? (
                <>
                  <div className="mt-4 rounded-md border border-paper/10 bg-paper/[0.03] p-3 text-sm leading-5 text-paper/65">
                    <p className="font-bold text-paper">
                      TEMPER does not decide the original breach.
                    </p>
                    <p className="mt-1.5 text-xs leading-5">
                      In production, an external trusted liability source — for example an
                      adjudication system such as Internet Court — could establish responsibility
                      and confirmed loss. For this demo, DemoLiabilitySource simulates that upstream
                      step onchain.
                    </p>
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(240px,0.8fr)]">
                    <div className="rounded-md border border-paper/10 bg-paper/[0.03] p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-paper/45">
                        Simulated loss inputs
                      </p>
                      <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        <DateTimeInput
                          label="When did the original service failure happen?"
                          helper="This is when the covered service first failed · Example: 2:00 PM"
                          value={breachAt}
                          onChange={setBreachAt}
                        />
                        <AmountInput
                          label="What was the final confirmed loss?"
                          helper="This is the total loss the upstream source has confirmed · Example: 10 GEN"
                          value={loss}
                          onChange={setLoss}
                        />
                        <div className="sm:col-span-2">
                          <DateTimeInput
                            label="When was that confirmed loss measured?"
                            helper="This is when the confirmed-loss amount above was recorded · Example: 3:00 PM"
                            value={lossRecordedAt}
                            onChange={setLossRecordedAt}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="rounded-md border border-paper/10 bg-paper/[0.02] p-3">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">
                          Example loss record
                        </p>
                        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-1.5">
                          <DemoTimelineEvent time="2:00 PM" event="Failure begins" amount="0 GEN" />
                          <span className="pt-5 text-sm text-paper/35" aria-hidden="true">
                            →
                          </span>
                          <DemoTimelineEvent time="2:30 PM" event="Loss grows" amount="5 GEN" />
                          <span className="pt-5 text-sm text-paper/35" aria-hidden="true">
                            →
                          </span>
                          <DemoTimelineEvent time="3:00 PM" event="Confirmed" amount="10 GEN" />
                        </div>
                        <p className="mt-2 text-[0.68rem] leading-4 text-paper/45">
                          For the demo source, loss between these timestamps is interpolated
                          linearly.
                        </p>
                      </div>
                      <div className="rounded-md border border-violet/25 bg-violet/[0.04] p-4">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet/85">
                          Simulated record preview
                        </p>
                        <div className="mt-3 grid grid-cols-3 gap-3">
                          <TimeMetric label="Service failure" value={casePreview.breach} />
                          <Metric label="Confirmed loss" value={casePreview.actual} />
                          <TimeMetric label="Measured at" value={casePreview.recorded} />
                        </div>
                        <div className="mt-3 border-t border-paper/10 pt-3">
                          <p className="text-xs text-paper/45">Onchain destination</p>
                          <p className="mt-1 font-semibold">DemoLiabilitySource</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  {demoFormAttempted && invalidLoss && (
                    <p className="mt-4 text-sm text-coral" role="alert">
                      Enter a positive whole GEN loss and choose valid times with the breach before
                      the confirmed-loss measurement.
                    </p>
                  )}
                  <p className="mt-4 text-xs leading-5 text-paper/55">
                    This approval writes the simulated upstream liability record to
                    DemoLiabilitySource.
                  </p>
                </>
              ) : (
                <>
                  <div className="mt-6 rounded-md border border-mint/30 bg-mint/10 p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-mint">
                      Liability record
                    </p>
                    <p className="mt-2 text-xl font-bold text-mint">Verified onchain</p>
                    <p className="mt-2 text-sm leading-6 text-paper/65">DemoLiabilitySource</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <DetailValue
                        label="Service failure"
                        value={
                          verifiedLiabilityRecord
                            ? formatTimestamp(verifiedLiabilityRecord.breachTimestamp)
                            : "Not available"
                        }
                      />
                      <Metric
                        label="Confirmed loss"
                        value={
                          verifiedLiabilityRecord
                            ? formatGen(verifiedLiabilityRecord.totalClaimedLoss)
                            : "—"
                        }
                      />
                      <DetailValue
                        label="Measured at"
                        value={
                          verifiedLiabilityRecord
                            ? formatTimestamp(verifiedLiabilityRecord.lossRecordedAt)
                            : "Not available"
                        }
                      />
                      <DetailValue
                        label="Receipt"
                        value={truncateReceipt(verifiedLiabilityRecord?.receiptId)}
                      />
                      <DetailValue
                        label="Agreement"
                        value={agreement.serviceDescription || agreement.title}
                      />
                      <DetailValue
                        label="Coverage"
                        value={`${formatGen(agreement.coverageLimitWei)} GEN maximum secured amount`}
                      />
                    </div>
                  </div>
                  <div className="mt-5 flex flex-col items-center gap-2 text-center text-xs font-bold uppercase tracking-[0.14em] text-paper/50 sm:flex-row sm:justify-center">
                    <span className="rounded border border-mint/25 bg-mint/10 px-3 py-2 text-mint">
                      Demo liability record · verified onchain
                    </span>
                    <span className="text-violet" aria-hidden="true">
                      ↓
                    </span>
                    <span className="rounded border border-violet/25 bg-violet/10 px-3 py-2 text-violet">
                      TEMPER case
                    </span>
                  </div>
                  <p className="mt-5 text-sm leading-6 text-paper/60">
                    The simulated upstream liability record is now stored onchain and has been read
                    back from DemoLiabilitySource. TEMPER can use its verified receipt to open the
                    post-liability remedy case.
                  </p>
                </>
              )}
            </div>
            {!verificationIssue && caseStartState !== "verifying" && (
              <DialogFooter className="sticky bottom-0 z-10 shrink-0 gap-3 border-t border-paper/10 bg-[#17151f] pb-1 pt-3 sm:space-x-0">
                <Button variant="glass" onClick={closeCaseForm}>
                  Cancel
                </Button>
                {demoStep === "liability" ? (
                  <Button
                    variant="hero"
                    disabled={checkingReceipt || !wallet.kit || !wallet.connectedClient}
                    onClick={() => {
                      setDemoFormAttempted(true);
                      if (!invalidLoss) setDemoTransactionRequested(true);
                    }}
                  >
                    Create Demo Liability Record
                  </Button>
                ) : (
                  <Button
                    variant="hero"
                    disabled={!wallet.kit || !wallet.connectedClient || !verifiedLiabilityRecord}
                    onClick={() => setDemoTransactionRequested(true)}
                  >
                    Open TEMPER Case
                  </Button>
                )}
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>
        {wallet.kit && wallet.connectedClient && showCaseForm && createCaseWrites.length > 0 && (
          <TransactionSequence
            kit={wallet.kit}
            client={wallet.connectedClient}
            writes={createCaseWrites}
            onError={(reason) => setError(reason.message)}
            onDismiss={closeCaseForm}
            {...(receiptCheck === "EXISTS_VALID"
              ? {
                  initialCompletedSteps: [
                    {
                      label: "Create confirmed-loss record",
                      description:
                        "The matching testnet liability record already exists and will be reused.",
                      status: "Already confirmed",
                    },
                  ],
                }
              : {})}
            onComplete={async (txId) => {
              const liabilityRecordCreated =
                caseStartState === "new_record_required" && receiptCheck === "NOT_FOUND";
              if (liabilityRecordCreated) {
                await verifyOnchainLiability();
                return;
              }
              await invalidate();
              closeCaseForm();
              toast.success("TEMPER case opened");
              void txId;
            }}
          />
        )}
        {error && (
          <p className="mt-4 text-sm text-coral" role="alert">
            {error}
          </p>
        )}
      </PageContainer>
    </AppPage>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-paper/10 pb-4">
      <dt className="text-xs text-paper/45">{label}</dt>
      <dd className="mt-1 break-words font-semibold">{value}</dd>
    </div>
  );
}

function StudioDevArchitectureModule() {
  return (
    <section className="rounded-lg border border-violet/30 bg-[#17151f]/90 p-4 sm:p-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet">Studio Dev demo</p>
      <h2 className="mt-1.5 text-xl font-bold">
        How the demo substitutes the upstream liability source.
      </h2>
      <div className="mt-4 space-y-3">
        <ArchitectureLane
          label="Production"
          nodes={[
            {
              label: "External liability source",
              detail: "responsibility + confirmed loss",
              example: "e.g. an adjudication system such as Internet Court",
            },
            { label: "Liability receipt" },
            { label: "TEMPER remedy case" },
          ]}
        />
        <ArchitectureLane
          label="Studio Dev"
          accent
          nodes={[
            { label: "DemoLiabilitySource", detail: "simulated upstream result" },
            { label: "Onchain liability record" },
            { label: "Verified receipt" },
            { label: "TEMPER remedy case" },
          ]}
        />
      </div>
      <p className="mt-4 text-sm leading-6 text-paper/60">
        TEMPER does not decide the original breach. On Studio Dev, DemoLiabilitySource simulates the
        upstream liability result, stores it onchain, and TEMPER verifies the receipt before opening
        the remedy case.
      </p>
    </section>
  );
}

function ArchitectureLane({
  label,
  nodes,
  accent = false,
}: {
  label: string;
  nodes: Array<{ label: string; detail?: string; example?: string }>;
  accent?: boolean;
}) {
  return (
    <div>
      <p
        className={
          accent
            ? "mb-1.5 text-xs font-bold uppercase tracking-[0.14em] text-violet"
            : "mb-1.5 text-xs font-bold uppercase tracking-[0.14em] text-paper/45"
        }
      >
        {label}
      </p>
      <div className="flex flex-col items-stretch gap-1.5 text-center md:flex-row md:items-stretch md:gap-1.5">
        {nodes.map((node, index) => (
          <div key={node.label} className="contents">
            {index > 0 && (
              <span
                className="flex items-center justify-center text-base leading-none text-violet md:px-0.5"
                aria-hidden="true"
              >
                <span className="md:hidden">↓</span>
                <span className="hidden md:inline">→</span>
              </span>
            )}
            <div
              className={
                accent
                  ? "flex min-w-0 flex-1 flex-col justify-center rounded-md border border-violet/25 bg-violet/10 px-2.5 py-2 text-xs font-bold uppercase tracking-[0.08em] text-violet"
                  : "flex min-w-0 flex-1 flex-col justify-center rounded-md border border-paper/10 bg-paper/5 px-2.5 py-2 text-xs font-bold uppercase tracking-[0.08em] text-paper/75"
              }
            >
              <span>{node.label}</span>
              {node.detail && (
                <span className="mt-0.5 text-[0.65rem] font-normal normal-case tracking-normal text-paper/50">
                  {node.detail}
                </span>
              )}
              {node.example && (
                <span className="mt-0.5 text-[0.62rem] font-normal normal-case tracking-normal text-paper/40">
                  {node.example}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Waiting({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-5 rounded-md border border-paper/10 bg-paper/5 p-4 text-sm">
      <p className="text-paper/45">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}
function AmountInput({
  label,
  helper,
  value,
  onChange,
}: {
  label: string;
  helper?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="relative mt-2">
        <Input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="border-paper/15 bg-paper/5 text-paper"
        />
        <span className="absolute right-3 top-2 text-sm">GEN</span>
      </div>
      {helper && <p className="mt-2 text-xs leading-5 text-paper/45">{helper}</p>}
    </div>
  );
}
function DateTimeInput({
  label,
  helper,
  value,
  onChange,
}: {
  label: string;
  helper: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 border-paper/15 bg-paper/5 text-paper"
      />
      <p className="mt-2 text-xs leading-5 text-paper/45">{helper}</p>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-paper/45">{label}</p>
      <b>{value} GEN</b>
    </div>
  );
}
function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-paper/45">{label}</p>
      <p className="mt-1 break-words font-semibold">{value}</p>
    </div>
  );
}
function TimeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-paper/45">{label}</p>
      <b>{value}</b>
    </div>
  );
}
function DemoTimelineEvent({
  time,
  event,
  amount,
}: {
  time: string;
  event: string;
  amount: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[0.68rem] font-bold text-paper/55">{time}</p>
      <p className="mt-1 break-words text-[0.68rem] leading-4 text-paper/70">{event}</p>
      <p className="mt-0.5 text-[0.68rem] font-bold text-violet/80">{amount}</p>
    </div>
  );
}
function truncateReceipt(value?: string) {
  if (!value) return "Not available";
  return value.length > 30 ? `${value.slice(0, 16)}…${value.slice(-10)}` : value;
}
function parseDatetimeLocal(value: string, label: string): bigint {
  if (!value) throw new Error(`Choose ${label.toLowerCase()}.`);
  const milliseconds = new Date(value).getTime();
  if (!Number.isFinite(milliseconds)) throw new Error(`Choose a valid ${label.toLowerCase()}.`);
  const timestamp = BigInt(Math.floor(milliseconds / 1000));
  if (timestamp < 0n) throw new Error(`${label} must be a valid Unix timestamp.`);
  return timestamp;
}
function formatTimestamp(value: bigint) {
  return value === 0n ? "Not set" : new Date(Number(value) * 1000).toLocaleString();
}
function lifecycleState(agreement: Agreement): {
  completedThrough: number;
  current?: number;
} {
  switch (agreement.status) {
    case "PROPOSED":
      return { completedThrough: 0, current: 1 };
    case "ACCEPTED":
      return { completedThrough: 1, current: 2 };
    case "ACTIVE":
      return { completedThrough: 2, current: 3 };
    case "CLAIM_OPEN":
    case "MITIGATION_CHALLENGED":
    case "MITIGATION_DISPUTED":
      return { completedThrough: 3, current: 4 };
    case "JUDGMENT_PENDING":
      return { completedThrough: 4, current: 5 };
    case "RESOLVED":
      return { completedThrough: 5, current: 6 };
    case "SETTLED":
    case "CLOSED":
      return { completedThrough: 6 };
  }
}
function LoadingAgreement() {
  return (
    <AppPage>
      <PageContainer>
        <p className="text-paper/60">Loading agreement from Studio Dev…</p>
      </PageContainer>
    </AppPage>
  );
}
function AgreementError({ message, onRefresh }: { message: string; onRefresh: () => void }) {
  return (
    <AppPage>
      <PageContainer>
        <section className="rounded-lg border border-coral/30 bg-coral/10 p-6">
          <h1 className="text-xl font-bold">Agreement unavailable</h1>
          <p className="mt-2 text-paper/70">{message}</p>
          <Button className="mt-5" variant="hero" onClick={onRefresh}>
            Refresh
          </Button>
        </section>
      </PageContainer>
    </AppPage>
  );
}
