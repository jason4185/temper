import {
  CapsShield,
  FeeReceipt,
  HoldToSign,
  PresetSelector,
  Timeline,
  VerifyBadge,
  useTransactionFlow,
} from "@genlayer/transaction-kit-react";
import type { TrackedStatus, TransactionKit } from "@genlayer/transaction-kit";
import { isSuccessful } from "genlayer-js";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ContractWrite } from "@/lib/temper/types";
import type { getConnectedClient } from "@/lib/genlayer/client";
import { withExternalMessageFees } from "@/lib/genlayer/external-message-fees";
import { explorerTransactionUrl } from "@/lib/genlayer/network";

type Client = ReturnType<typeof getConnectedClient>;

export async function verifySuccessfulTransaction(status: TrackedStatus, client: Client) {
  if (!status.genlayerTxId)
    throw new Error("The decided transaction did not return a GenLayer transaction ID.");
  if (status.successful === true) return status.genlayerTxId;
  if (status.successful === false) {
    const result = [status.statusName, status.executionResultName].filter(Boolean).join(" + ");
    throw new Error(`Transaction decision was not successful: ${result || "unknown outcome"}.`);
  }
  const transaction = await client.getTransaction({ hash: status.genlayerTxId as never });
  if (!isSuccessful(transaction)) {
    const result =
      transaction.txExecutionResultName || transaction.statusName || "execution failed";
    throw new Error(`Transaction decision was not successful: ${result}.`);
  }
  return status.genlayerTxId;
}

function trackFinalizationInBackground(
  kit: TransactionKit,
  txId: string,
  onFinalized?: (status: TrackedStatus) => void | Promise<void>,
) {
  void kit
    .track(
      txId as `0x${string}`,
      (status) => {
        if (status.phase !== "finalized") return;
        void Promise.resolve(onFinalized?.(status)).catch((reason: unknown) => {
          console.error("TEMPER finalization refresh failed", reason);
        });
      },
      { until: "finalized" },
    )
    .catch((reason: unknown) => {
      console.warn("TEMPER background finalization tracking ended", reason);
    });
}

function TransactionViewport({
  children,
  contentClassName = "max-w-[420px]",
}: {
  children: ReactNode;
  contentClassName?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="GenLayer transaction"
    >
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
      <div
        className={`relative z-10 max-h-[calc(100dvh-2rem)] w-full overflow-y-auto sm:max-h-[calc(100dvh-3rem)] ${contentClassName}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function TransactionRunner({
  kit,
  client,
  write,
  onSuccess,
  onError,
  onDismiss,
  label = "Continue",
  intro,
  renderInModal = true,
  onFinalized,
}: {
  kit: TransactionKit;
  client: Client;
  write: ContractWrite;
  onSuccess: (txId: string) => void | Promise<void>;
  onError: (error: Error) => void;
  onDismiss?: () => void;
  label?: string;
  intro?: ReactNode;
  renderInModal?: boolean;
  onFinalized?: (status: TrackedStatus) => void | Promise<void>;
}) {
  const argsKey = write.args.map(String).join("|");
  const argsRef = useRef({ key: argsKey, args: write.args });
  if (argsRef.current.key !== argsKey) {
    argsRef.current = { key: argsKey, args: write.args };
  }
  const stableArgs = argsRef.current.args;
  const tx = useMemo(
    () => ({
      kind: "write" as const,
      address: write.address,
      method: write.method,
      args: stableArgs,
    }),
    [stableArgs, write.address, write.method],
  );
  const transactionKit = useMemo(() => withExternalMessageFees(kit, client), [client, kit]);
  const flow = useTransactionFlow({
    kit: transactionKit,
    tx,
    trackUntil: "decided",
    ...(write.value === undefined ? {} : { userValue: write.value }),
  });
  const [txId, setTxId] = useState<string>();
  const [verificationError, setVerificationError] = useState<string>();
  const reportedError = useRef("");
  const handledTxId = useRef("");
  const finalizationTrackedTxId = useRef("");
  const state = flow.state;

  useEffect(() => {
    if (state.step === "error") {
      if (reportedError.current !== state.message) {
        reportedError.current = state.message;
        onError(new Error(state.message));
        onDismiss?.();
      }
      return;
    }
    reportedError.current = "";
    if (state.step !== "done") return;
    const decidedStatus = state.status;
    if (!decidedStatus.genlayerTxId || handledTxId.current === decidedStatus.genlayerTxId) return;
    handledTxId.current = decidedStatus.genlayerTxId;
    setTxId(decidedStatus.genlayerTxId);
    void verifySuccessfulTransaction(decidedStatus, client)
      .then(async (decidedTxId) => {
        if (finalizationTrackedTxId.current !== decidedTxId) {
          finalizationTrackedTxId.current = decidedTxId;
          trackFinalizationInBackground(transactionKit, decidedTxId, onFinalized);
        }
        await onSuccess(decidedTxId);
      })
      .catch((reason: unknown) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        setVerificationError(error.message);
        onError(error);
      });
  }, [client, onDismiss, onError, onFinalized, onSuccess, state, transactionKit]);

  const dismiss = () => onDismiss?.();
  const retry = () => {
    setVerificationError(undefined);
    handledTxId.current = "";
    flow.reset();
  };
  const showError = state.step === "error" || Boolean(verificationError);
  const errorMessage = verificationError || (state.step === "error" ? state.message : undefined);

  const content = (
    <div className="space-y-4">
      {intro}
      <div className="gltk-root" data-theme="dark">
        <div className="gltk-panel w-full">
          <div className="gltk-head">
            <span className="gltk-head-title">GenLayer transaction</span>
            <span className="gltk-head-network">studio-dev</span>
          </div>
          <div className="gltk-target">
            <span className="gltk-target-kind">Write</span>
            <span className="gltk-target-what">{write.method}()</span>
          </div>
          {state.step === "estimating" && (
            <div className="gltk-outcome" data-tone="warn">
              <p className="gltk-outcome-title">Preparing transaction</p>
              <p className="gltk-outcome-detail">Estimating the Studio Dev fee flow.</p>
            </div>
          )}
          {(state.step === "review" || state.step === "blocked") && (
            <>
              {!flow.quote?.gasless && (
                <PresetSelector value={flow.preset} onChange={flow.setPreset} />
              )}
              {flow.quote && <FeeReceipt quote={flow.quote} />}
              {flow.quote && !flow.quote.gasless && <CapsShield quote={flow.quote} />}
              {flow.quote && (
                <VerifyBadge
                  status={flow.quote.verification.status}
                  {...(flow.verification?.feeConfigHash
                    ? { feeConfigHash: flow.verification.feeConfigHash }
                    : {})}
                />
              )}
              {state.step === "blocked" && (
                <div className="gltk-outcome" data-tone="error">
                  <p className="gltk-outcome-title">Fee estimate needs review</p>
                  <p className="gltk-outcome-detail">{state.message}</p>
                </div>
              )}
              <div className="gltk-actions">
                {state.step === "blocked" ? (
                  <button type="button" onClick={retry}>
                    Re-estimate
                  </button>
                ) : (
                  <HoldToSign
                    onConfirm={() => void flow.approve()}
                    disabled={!flow.quote}
                    label="Approve & sign"
                  />
                )}
              </div>
            </>
          )}
          {state.step === "signing" && (
            <div className="gltk-outcome" data-tone="warn">
              <p className="gltk-outcome-title">Waiting for your wallet</p>
              <p className="gltk-outcome-detail">
                Confirm the transaction in your wallet to continue.
              </p>
            </div>
          )}
          {state.step === "tracking" && (
            <>
              <Timeline status={state.status} />
              <div className="gltk-actions">
                {flow.canTopUp && (
                  <button type="button" onClick={() => void flow.topUp()}>
                    Top up fees
                  </button>
                )}
                {flow.canCancel && (
                  <button type="button" onClick={() => void flow.cancel()}>
                    Cancel transaction
                  </button>
                )}
              </div>
            </>
          )}
          {state.step === "done" && !verificationError && (
            <>
              <Timeline status={state.status} />
              <div className="gltk-outcome" data-tone="success">
                <p className="gltk-outcome-title">
                  {state.status.phase === "finalized" ? "Finalized" : "Transaction accepted"}
                </p>
                <p className="gltk-outcome-detail">
                  {state.status.phase === "finalized"
                    ? "The transaction is final. Refreshing contract state…"
                    : "Consensus accepted the transaction. Refreshing contract state…"}
                </p>
              </div>
            </>
          )}
          {showError && errorMessage && (
            <>
              <div className="gltk-outcome" data-tone="error">
                <p className="gltk-outcome-title">Transaction not completed</p>
                <p className="gltk-outcome-detail">{errorMessage}</p>
              </div>
              <div className="gltk-actions">
                {state.step === "error" && (
                  <button type="button" onClick={retry}>
                    Re-estimate and retry
                  </button>
                )}
                <button type="button" onClick={dismiss}>
                  Dismiss
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <p className="text-xs text-paper/45">
        {label} uses the connected wallet and the Studio Dev fee flow.
      </p>
      {txId && <ExplorerLink txId={txId} />}
    </div>
  );

  return renderInModal ? <TransactionViewport>{content}</TransactionViewport> : content;
}

export function ExplorerLink({ txId }: { txId: string }) {
  return (
    <a
      className="text-sm font-semibold text-violet hover:underline"
      href={explorerTransactionUrl(txId)}
      target="_blank"
      rel="noreferrer"
    >
      View on Explorer
    </a>
  );
}

export function TransactionSequence({
  kit,
  client,
  writes,
  onComplete,
  onError,
  onDismiss,
  onFinalized,
  initialCompletedSteps = [],
}: {
  kit: TransactionKit;
  client: Client;
  writes: ContractWrite[];
  onComplete: (txId: string) => void | Promise<void>;
  onError: (error: Error) => void;
  onDismiss?: () => void;
  onFinalized?: (status: TrackedStatus) => void | Promise<void>;
  initialCompletedSteps?: Array<{
    label: string;
    description: string;
    status?: string;
  }>;
}) {
  const [index, setIndex] = useState(0);
  const [completedTxIds, setCompletedTxIds] = useState<string[]>([]);
  const [sequenceComplete, setSequenceComplete] = useState(false);
  const [finalTxId, setFinalTxId] = useState<string>();
  const [failure, setFailure] = useState<{ step: number; error: Error }>();
  const completionStarted = useRef(false);
  const write = writes[index];

  useEffect(() => {
    if (!sequenceComplete || !finalTxId || completionStarted.current) return;
    completionStarted.current = true;
    void onComplete(finalTxId);
  }, [finalTxId, onComplete, sequenceComplete]);

  if (!write) return null;

  const stepForWrite = (currentWrite: ContractWrite) => {
    if (currentWrite.method === "create_demo_liability") {
      return {
        label: "Create demo liability record",
        description: "Stores the controlled demo upstream liability record used by TEMPER.",
      };
    }
    if (currentWrite.method === "open_claim") {
      return {
        label: "Open TEMPER case",
        description:
          "Links that demo liability record to this agreement and opens the remedy dispute.",
      };
    }
    return {
      label: currentWrite.method.replaceAll("_", " "),
      description: "Submits the next required onchain action.",
    };
  };

  const steps = [...initialCompletedSteps, ...writes.map(stepForWrite)];
  const pendingApprovalCount = writes.length;
  const activeStepIndex = initialCompletedSteps.length + index;
  const activeStepNumber = activeStepIndex + 1;
  const activeStep = stepForWrite(write);
  const compactFinalApproval = initialCompletedSteps.length > 0 && write.method === "open_claim";

  const transactionRunner = (
    <TransactionRunner
      key={`${activeStepIndex}-${write.method}`}
      kit={kit}
      client={client}
      write={write}
      renderInModal={false}
      label={compactFinalApproval ? "Open TEMPER case" : `Approve Step ${activeStepNumber}`}
      onError={(reason) => {
        setFailure({ step: activeStepNumber, error: reason });
        onError(reason);
      }}
      {...(onFinalized ? { onFinalized } : {})}
      onSuccess={async (txId) => {
        setFailure(undefined);
        setCompletedTxIds((current) => [...current, txId]);
        if (index + 1 === writes.length) {
          setFinalTxId(txId);
          setSequenceComplete(true);
        } else {
          setIndex(index + 1);
        }
      }}
    />
  );

  return (
    <TransactionViewport contentClassName="max-w-[640px]">
      {compactFinalApproval ? (
        <div className="flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col overflow-hidden rounded-xl border border-paper/12 bg-[#17151f] p-4 text-paper shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:p-5">
          <div className="shrink-0 border-b border-paper/10 pb-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet">
                Open TEMPER case
              </p>
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-paper/45">
                Approval {activeStepNumber} of {steps.length}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded border border-mint/25 bg-mint/10 px-2.5 py-1.5 text-mint">
                ✓ Liability record verified
              </span>
              <span className="text-violet" aria-hidden="true">
                →
              </span>
              <span className="rounded border border-violet/40 bg-violet/10 px-2.5 py-1.5 text-violet">
                ● Open TEMPER case
              </span>
            </div>
            <p className="mt-3 text-sm leading-5 text-paper/60">
              Opening the remedy case using the verified DemoLiabilitySource receipt.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
            {sequenceComplete ? (
              <div className="mt-4 rounded-lg border border-mint/35 bg-mint/10 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-mint">
                  TEMPER case opened
                </p>
                <p className="mt-2 text-sm leading-6 text-paper/65">
                  The verified liability receipt has been linked to this agreement and the remedy
                  case is now active.
                </p>
                {finalTxId && (
                  <p className="mt-3 text-sm">
                    <ExplorerLink txId={finalTxId} />
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-4">{transactionRunner}</div>
            )}

            {failure && (
              <div className="mt-3 rounded-lg border border-coral/40 bg-coral/10 p-3" role="alert">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-coral">Open TEMPER case failed</p>
                  {onDismiss && (
                    <button
                      type="button"
                      className="rounded-md border border-paper/20 px-3 py-1.5 text-xs font-semibold text-paper hover:bg-paper/10"
                      onClick={onDismiss}
                    >
                      Dismiss
                    </button>
                  )}
                </div>
                <p className="mt-1.5 text-sm leading-5 text-paper/70">{failure.error.message}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-paper/12 bg-[#17151f] p-5 text-paper shadow-2xl sm:p-7">
          <div className="border-b border-paper/10 pb-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet">
              START DEMO CASE
            </p>
            <h2 className="mt-3 text-2xl font-bold">
              {initialCompletedSteps.length > 0
                ? `${pendingApprovalCount} wallet approval${pendingApprovalCount === 1 ? "" : "s"} ${pendingApprovalCount === 1 ? "remains" : "remain"}.`
                : `Approve ${pendingApprovalCount} wallet action${pendingApprovalCount === 1 ? "" : "s"} for this step.`}
            </h2>
            <p className="mt-3 text-sm leading-6 text-paper/60">
              Approve each wallet write separately. TEMPER first records the controlled demo
              upstream liability record, then opens the remedy case against the agreement.
            </p>
          </div>

          <div className="mt-5 space-y-3">
            {steps.map((step, stepIndex) => {
              const isComplete = sequenceComplete || stepIndex < activeStepIndex;
              const isCurrent = !sequenceComplete && stepIndex === activeStepIndex;
              const isLocked = !isComplete && !isCurrent;
              const dynamicStepIndex = stepIndex - initialCompletedSteps.length;
              const txId = dynamicStepIndex >= 0 ? completedTxIds[dynamicStepIndex] : undefined;
              const status = isComplete
                ? initialCompletedSteps[stepIndex]?.status || "Accepted"
                : isCurrent
                  ? stepIndex === 0
                    ? "Ready for approval"
                    : "Ready for final approval"
                  : "Waiting for Step 1";

              return (
                <div
                  key={`${stepIndex}-${step.label}`}
                  className={`rounded-lg border p-4 transition-colors ${
                    isComplete
                      ? "border-mint/35 bg-mint/10"
                      : isCurrent
                        ? "border-violet/50 bg-violet/10"
                        : "border-paper/10 bg-paper/[0.03] opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        isComplete
                          ? "bg-mint text-ink"
                          : isCurrent
                            ? "bg-violet text-paper"
                            : "border border-paper/25 text-paper/45"
                      }`}
                    >
                      {isComplete ? "✓" : stepIndex + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold uppercase tracking-wide text-paper/55">
                        Step {stepIndex + 1} of {steps.length}
                      </p>
                      <p className="mt-1 font-semibold">{step.label}</p>
                      <p className="mt-1 text-sm leading-5 text-paper/55">{step.description}</p>
                      <p
                        className={`mt-3 text-xs font-semibold ${
                          isComplete ? "text-mint" : isCurrent ? "text-violet" : "text-paper/45"
                        }`}
                      >
                        Status: {status}
                      </p>
                      {txId && (
                        <p className="mt-2 text-xs text-paper/50">
                          <ExplorerLink txId={txId} />
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {activeStepNumber === 2 && !sequenceComplete && (
            <p className="mt-5 rounded-lg border border-violet/25 bg-violet/10 p-4 text-sm leading-6 text-paper/70">
              Step 1 is complete. One final wallet approval is required to open the TEMPER case.
            </p>
          )}

          {sequenceComplete ? (
            <div className="mt-5 rounded-lg border border-mint/35 bg-mint/10 p-5">
              <p className="text-sm font-bold text-mint">✓ Step 1 complete</p>
              <p className="mt-2 text-sm font-bold text-mint">✓ Step 2 complete</p>
              <p className="mt-4 text-xl font-bold">TEMPER case opened</p>
              <p className="mt-2 text-sm leading-6 text-paper/60">
                The case is being refreshed from the agreement state now.
              </p>
              {finalTxId && (
                <p className="mt-3 text-sm">
                  <ExplorerLink txId={finalTxId} />
                </p>
              )}
            </div>
          ) : (
            <div className="mt-5 rounded-lg border border-violet/35 bg-paper/[0.03] p-4 sm:p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-violet">
                Approve Step {activeStepNumber}
              </p>
              <p className="mt-1 font-semibold">{activeStep.label}</p>
              {transactionRunner}
            </div>
          )}

          {failure && (
            <div className="mt-4 rounded-lg border border-coral/40 bg-coral/10 p-4" role="alert">
              <p className="text-sm font-bold text-coral">Step {failure.step} failed</p>
              <p className="mt-2 text-sm leading-6 text-paper/70">{failure.error.message}</p>
              {onDismiss && (
                <button
                  type="button"
                  className="mt-4 rounded-md border border-paper/20 px-3 py-2 text-sm font-semibold text-paper hover:bg-paper/10"
                  onClick={onDismiss}
                >
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </TransactionViewport>
  );
}
