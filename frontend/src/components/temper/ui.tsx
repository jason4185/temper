import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, Copy, ExternalLink, FileText, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { LOSS_RECORD_SOURCE, TEMPER_CONTRACT } from "@/lib/temper/contracts";
import { formatGen, securedLoss } from "@/lib/temper/format";
import type {
  Agreement,
  AgreementStatus,
  CaseStatus,
  Evidence,
  TemperCase,
} from "@/lib/temper/types";

const statusLabels: Record<AgreementStatus | CaseStatus, string> = {
  PROPOSED: "Waiting for acceptance",
  ACCEPTED: "Waiting for bond",
  ACTIVE: "Active",
  CLAIM_OPEN: "Case opened",
  MITIGATION_CHALLENGED: "Provider evidence submitted",
  MITIGATION_DISPUTED: "Mitigation disputed",
  JUDGMENT_PENDING: "Remedy judgment in progress",
  RESOLVED: "Remedy ready",
  SETTLED: "Settlement executed",
  CLOSED: "Case closed",
};
export const statusLabel = (status: AgreementStatus | CaseStatus) => statusLabels[status];

export function StatusBadge({ status }: { status: AgreementStatus | CaseStatus }) {
  const positive = status === "ACTIVE" || status === "SETTLED" || status === "CLOSED";
  const disputed =
    status === "MITIGATION_DISPUTED" || status === "CLAIM_OPEN" || status === "RESOLVED";
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-bold",
        positive
          ? "border-mint/30 bg-mint-soft text-ink"
          : disputed
            ? "border-coral/30 bg-coral-soft text-ink"
            : "border-violet/30 bg-violet-soft text-ink",
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

export function TestnetBadge({ label = "STUDIO DEV" }: { label?: string }) {
  return (
    <span className="inline-flex rounded-full border border-violet/30 bg-violet/10 px-2.5 py-1 text-[0.68rem] font-bold uppercase text-violet">
      {label}
    </span>
  );
}

export function CopyAddress({ address, inverse = false }: { address: string; inverse?: boolean }) {
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-xs transition-colors",
        inverse ? "text-paper/65 hover:text-paper" : "text-muted-foreground hover:text-foreground",
      )}
      onClick={() => {
        navigator.clipboard?.writeText(address);
        toast.success("Address copied");
      }}
      aria-label={`Copy address ${address}`}
    >
      {short}
      <Copy className="h-3.5 w-3.5" />
    </button>
  );
}

export function AmountSplit({
  loss,
  backup,
  dark = false,
}: {
  loss: bigint;
  backup: bigint;
  dark?: boolean;
}) {
  const avoided = loss - backup;
  const paidWidth =
    loss > 0n ? Math.min(100, Math.max(0, (Number(backup) / Number(loss)) * 100)) : 0;
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border",
        dark ? "border-paper/15" : "border-border",
      )}
    >
      <div className="flex h-3">
        <span className="bg-coral" style={{ width: `${paidWidth}%` }} />
        <span className="flex-1 bg-mint" />
      </div>
      <div className="grid grid-cols-2 gap-4 p-4">
        <div>
          <p className="text-xs text-muted-foreground">Recoverable from bond</p>
          <p className="mt-1 text-xl font-bold">{formatGen(backup)} GEN</p>
        </div>
        <div className="border-l border-border pl-4">
          <p className="text-xs text-muted-foreground">Avoidable secured loss</p>
          <p className="mt-1 text-xl font-bold">{formatGen(avoided)} GEN</p>
        </div>
      </div>
      <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
        Secured-loss split from the verdict
      </p>
    </div>
  );
}

export function AgreementCard({ agreement }: { agreement: Agreement }) {
  const role = agreement.role;
  const nextAction = agreement.nextAction;
  const preFunding = agreement.status === "PROPOSED" || agreement.status === "ACCEPTED";
  const securedLabel = preFunding ? "Coverage limit" : "Secured";
  const securedAmount = preFunding ? agreement.coverageLimitWei : agreement.remainingBond;
  const optionalDemoInitiation =
    agreement.status === "ACTIVE" && agreement.role === "Other party" && !agreement.caseId;
  const activeAndIdle =
    agreement.status === "ACTIVE" &&
    !agreement.caseId &&
    (!nextAction || nextAction.label.startsWith("Waiting"));
  return (
    <article className="group rounded-lg border border-paper/12 bg-paper/[0.045] p-5 transition hover:-translate-y-0.5 hover:border-violet/50 hover:bg-paper/[0.07]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-paper/45">
            {role} · {agreement.id}
          </p>
          <h3 className="mt-2 text-lg font-bold">{agreement.title}</h3>
        </div>
        <StatusBadge status={agreement.status} />
      </div>
      <div className="mt-5 grid gap-3 border-y border-paper/10 py-4 text-sm sm:grid-cols-[1.15fr_1fr_auto_1.2fr]">
        <div>
          <p className="text-paper/45">Service</p>
          <p className="mt-1 break-words font-medium">
            {agreement.serviceDescription || agreement.title}
          </p>
        </div>
        <div>
          <p className="text-paper/45">Mitigation</p>
          <p className="mt-1 break-words font-medium">
            {agreement.mitigationCovenant || agreement.backupSource}
          </p>
        </div>
        <div>
          <p className="text-paper/45">{securedLabel}</p>
          <p className="mt-1 whitespace-nowrap font-bold">{formatGen(securedAmount)} GEN</p>
        </div>
        <div>
          <p className="text-paper/45">Agreement window</p>
          <p className="mt-1 break-words font-medium">
            {formatAgreementExpiry(agreement.agreementExpiry)}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-paper/55">
          {optionalDemoInitiation ? (
            <>
              <span className="font-bold text-violet">Studio Dev demo</span>
              <br />
              No remedy case exists. Start a demo case after upstream responsibility and confirmed
              loss are established.
            </>
          ) : activeAndIdle ? (
            <>
              <span className="font-bold text-mint">Agreement active</span>
              <br />
              No action is required right now.
            </>
          ) : nextAction ? (
            <>
              <span className="font-bold text-violet">{nextAction.label}</span>
              <br />
              {nextAction.description}
            </>
          ) : (
            "No open remedy dispute"
          )}
        </p>
        <Button asChild size="sm" variant="glass">
          <Link to="/agreements/$id" params={{ id: agreement.id }}>
            {optionalDemoInitiation ? "Start Demo Case" : "View Agreement"}
            {optionalDemoInitiation && <span aria-hidden="true"> →</span>}
          </Link>
        </Button>
      </div>
    </article>
  );
}

function formatAgreementExpiry(expiry: bigint) {
  return expiry === 0n ? "Not set" : new Date(Number(expiry) * 1000).toLocaleDateString();
}

export function CaseCard({ item }: { item: TemperCase }) {
  const roleTag = item.role === "Other party" ? "CLAIMANT" : item.role.toUpperCase();
  const hasFinalOutcome = ["RESOLVED", "SETTLED", "CLOSED"].includes(item.status);

  return (
    <article className="group rounded-lg border border-paper/12 bg-paper/[0.045] p-5 transition hover:border-violet/50 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div>
            <span className="rounded-full border border-violet/25 bg-violet/10 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-violet">
              {roleTag}
            </span>
            <p
              className="mt-2 max-w-full truncate whitespace-nowrap font-mono text-[0.68rem] tracking-[0.06em] text-paper/30"
              title={item.id}
            >
              {item.id}
            </p>
          </div>
          <h3 className="mt-3 text-xl font-bold tracking-tight">{item.title}</h3>
        </div>
        <StatusBadge status={item.status} />
      </div>
      <div className="mt-5 grid gap-4 border-y border-paper/10 py-4 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-paper/40">
            Actual loss
          </p>
          <b className="mt-1 block text-base">{formatGen(item.confirmedLoss)} GEN</b>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-paper/40">Secured</p>
          <b className="mt-1 block text-base">
            {formatGen(securedLoss(item.confirmedLoss, item.bond))} GEN
          </b>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-paper/40">
            Final outcome / status
          </p>
          {hasFinalOutcome ? (
            <>
              <b className="mt-1 block text-base">
                {formatGen(item.recoverableAmount)} GEN recoverable
              </b>
              <span className="mt-1 block text-xs text-paper/45">
                {formatGen(item.avoidableAmount)} GEN avoidable
              </span>
            </>
          ) : (
            <b className="mt-1 block text-base">{statusLabel(item.status)}</b>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-paper/55">
          {item.nextAction ? (
            <>
              <span className="font-bold text-violet">{item.nextAction.label}</span>
              <br />
              {item.nextAction.description}
            </>
          ) : (
            "Opened onchain"
          )}
        </p>
        <Link
          className={buttonVariants({ size: "sm", variant: "glass" })}
          to="/cases/$id"
          params={{ id: item.id }}
        >
          View Case <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

export function EvidenceCard({ evidence }: { evidence: Evidence }) {
  const sourceDetails = evidenceSourceDetails(evidence.source);
  const evidenceLabel =
    evidence.side === "provider"
      ? `Provider evidence ${evidence.id.endsWith("-2") ? "2" : "1"}`
      : "Response evidence";

  return (
    <article className="rounded-lg border border-paper/12 bg-paper/[0.04] p-4 sm:p-5">
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="shrink-0 rounded-md bg-violet/15 p-2 text-violet">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet">
                {evidenceLabel}
              </p>
              <h3 className="mt-1 truncate text-base font-bold" title={sourceDetails.filename}>
                {sourceDetails.filename}
              </h3>
              <p
                className="mt-1 truncate font-mono text-xs text-paper/45"
                title={sourceDetails.host}
              >
                {sourceDetails.host}
              </p>
            </div>
          </div>
          <div className="mt-3">
            <span className="inline-flex rounded-full border border-mint/25 bg-mint/10 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-mint">
              Recorded onchain
            </span>
            <p className="mt-1.5 text-xs text-paper/50">
              Source URL + SHA-256 hash recorded onchain
            </p>
          </div>
          <details className="mt-3 text-xs text-paper/45">
            <summary className="cursor-pointer">Evidence details</summary>
            <p className="mt-2 break-all font-mono">Source URL {evidence.source}</p>
            <p className="mt-2 break-all font-mono">Content hash {evidence.hash}</p>
          </details>
        </div>
      </div>
    </article>
  );
}

function evidenceSourceDetails(source: string) {
  try {
    const url = new URL(source);
    const pathPart = url.pathname.split("/").filter(Boolean).at(-1);
    return {
      filename: pathPart ? decodeURIComponent(pathPart) : url.hostname,
      host: url.hostname,
    };
  } catch {
    return { filename: "Evidence source", host: source };
  }
}

export function LifecycleStepper({
  completedThrough,
  current,
}: {
  completedThrough: number;
  current?: number;
}) {
  const steps = ["Created", "Accepted", "Bonded", "Active", "Case", "Verdict", "Settled"];
  return (
    <ol className="grid grid-cols-7 gap-1" aria-label="Agreement lifecycle">
      {steps.map((step, index) => (
        <li key={step} className="min-w-0">
          <div
            className={cn(
              "mb-2 h-1 rounded-full",
              index <= completedThrough
                ? "bg-violet"
                : index === current
                  ? "border border-violet bg-violet/25"
                  : "bg-paper/15",
            )}
          />
          <p
            className={cn(
              "text-center text-[0.65rem] sm:text-xs",
              index <= completedThrough
                ? "text-paper"
                : index === current
                  ? "font-semibold text-violet"
                  : "text-paper/35",
            )}
          >
            {step}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function NextActionPanel({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action: string;
  onAction?: () => void;
}) {
  return (
    <section className="rounded-lg border border-violet/40 bg-violet/10 p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-violet">Next action</p>
          <h2 className="mt-2 text-xl font-bold">{title}</h2>
          <p className="mt-1 text-sm text-paper/60">{description}</p>
        </div>
        <Button variant="hero" size="lg" onClick={onAction}>
          {action}
        </Button>
      </div>
    </section>
  );
}

export function TechnicalDetails({ caseId }: { caseId?: string | undefined }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-paper/12 px-4 py-3 text-left text-sm font-semibold text-paper/65 hover:bg-paper/5">
        Technical details <ChevronDown className="h-4 w-4" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-3 rounded-md border border-paper/10 bg-paper/[0.03] p-4 text-xs text-paper/55">
        <p>TEMPER Intelligent Contract</p>
        <CopyAddress address={TEMPER_CONTRACT} inverse />
        <p>DemoLiabilitySource · controlled demo upstream liability record</p>
        <CopyAddress address={LOSS_RECORD_SOURCE} inverse />
        {caseId && (
          <p>
            Case reference · <span className="font-mono">{caseId}</span>
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-lg border border-dashed border-paper/20 px-6 py-14 text-center">
      <ShieldCheck className="mx-auto h-8 w-8 text-paper/30" />
      <h3 className="mt-4 font-bold">{title}</h3>
      <p className="mt-2 text-sm text-paper/50">{copy}</p>
    </div>
  );
}

export function CheckRule({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-mint-soft text-ink">
        <Check className="h-3 w-3" />
      </span>
      {children}
    </li>
  );
}

export function ExternalTextLink({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <ExternalLink className="h-3 w-3" />
    </span>
  );
}
