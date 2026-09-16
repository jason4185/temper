import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/temper/shell";
import { useProductTour } from "@/components/temper/product-tour-context";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How TEMPER Works · GenLayer Settlement" },
      {
        name: "description",
        content:
          "See how TEMPER moves from a bonded agreement through evidence and a GenLayer verdict to settlement.",
      },
      { property: "og:title", content: "How TEMPER Works" },
      {
        property: "og:description",
        content: "Five clear steps from agreement to onchain settlement.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HowItWorks,
});

function HowItWorks() {
  const { openTour } = useProductTour();

  return (
    <main className="bg-paper text-ink">
      <section className="paper-grid px-5 pb-20 pt-16 lg:px-10 lg:pb-16 lg:pt-20">
        <div className="mx-auto grid max-w-[1440px] items-center gap-12 lg:grid-cols-[.9fr_1.1fr] lg:gap-20">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet">
              Onchain Justice · TEMPER
            </p>
            <h1 className="mt-5 max-w-3xl text-5xl font-extrabold leading-[1.02] sm:text-7xl">
              From service promise to enforceable remedy.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              TEMPER starts after responsibility for the original failure and the covered loss have
              been established, then turns the mitigation question into a settled remedy.
            </p>
            <p className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink/50">
              Bonded service agreements · GenLayer adjudication · Onchain remedy
            </p>
            <div className="mt-9 max-w-2xl rounded-xl border border-border bg-background/80 p-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">
                  New to TEMPER?
                </p>
                <h2 className="mt-2 text-xl font-bold">Take the 60-second product tour.</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                  See how agreements, established liability, mitigation evidence, GenLayer
                  adjudication, and remedy settlement fit together.
                </p>
              </div>
              <Button variant="hero" onClick={openTour} className="mt-5 shrink-0 sm:mt-0">
                Start Tour <ArrowRight />
              </Button>
            </div>
          </div>
          <SystemOverview />
        </div>
      </section>

      <ProtocolFlow />
      <AdjudicationSystem />
      <ClosingAction />
      <SiteFooter />
    </main>
  );
}

function SystemOverview() {
  return (
    <div className="rounded-2xl border border-ink/10 bg-ink p-5 text-paper shadow-[var(--shadow-panel)] sm:p-7">
      <div className="flex items-center justify-between gap-4">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-violet">
          System overview
        </p>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/40">
          TEMPER / 01
        </span>
      </div>
      <div className="mt-7 divide-y divide-paper/10 border-y border-paper/10">
        <OverviewRow
          label="Input"
          value="Established liability + confirmed loss record"
          marker="01"
        />
        <OverviewRow
          label="Question"
          value="Was the agreed mitigation reasonably available?"
          marker="02"
          accent
        />
        <OverviewRow label="Output" value="Enforceable secured remedy" marker="03" />
      </div>
    </div>
  );
}

function OverviewRow({
  label,
  value,
  marker,
  accent = false,
}: {
  label: string;
  value: string;
  marker: string;
  accent?: boolean;
}) {
  return (
    <div className="grid gap-3 py-5 sm:grid-cols-[5rem_1fr_auto] sm:items-center sm:gap-5">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-paper/45">
        {label}
      </p>
      <p className={accent ? "text-base font-bold text-paper" : "text-base text-paper/75"}>
        {value}
      </p>
      <span
        className={accent ? "font-mono text-xs text-violet" : "font-mono text-xs text-paper/30"}
      >
        {marker}
      </span>
    </div>
  );
}

function ProtocolFlow() {
  return (
    <section className="px-5 py-20 lg:px-10 lg:pb-28 lg:pt-16">
      <div className="mx-auto max-w-[1440px]">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet">
            One case · five states
          </p>
          <h2 className="mt-4 text-4xl font-extrabold sm:text-5xl">TEMPER protocol flow</h2>
          <p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground">
            A remedy case moves from terms agreed in advance to an evidence-based decision and a
            deterministic settlement.
          </p>
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-ink p-5 text-paper shadow-[var(--shadow-panel)] sm:p-8 lg:p-10">
          <div className="flex items-center justify-between gap-4 border-b border-paper/10 pb-5">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-violet">
              TEMPER protocol flow
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/40">
              01 → 05
            </p>
          </div>

          <div className="mt-7 grid gap-4 lg:grid-cols-12">
            <ProtocolStage
              number="01"
              label="Promise"
              title="Define the service and fallback"
              copy="The service promise, fallback obligation, availability rule, and coverage are agreed before a dispute exists."
              className="lg:col-span-5"
            >
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["SERVICE", "covered"],
                  ["MITIGATION", "agreed"],
                  ["AVAILABILITY", "usable"],
                  ["COVERAGE", "secured"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-paper/12 bg-paper/[0.045] p-3"
                  >
                    <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-violet">
                      {label}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-paper/75">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-3">
                <ArrowDown className="h-4 w-4 text-violet" />
                <div className="flex-1 rounded-lg border border-violet/35 bg-violet/10 px-4 py-3">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-violet">
                    TEMPER agreement
                  </p>
                </div>
              </div>
            </ProtocolStage>

            <ProtocolStage
              number="02"
              label="Failure"
              title="Responsibility is established upstream"
              copy="A trusted upstream process establishes responsibility and the confirmed loss record before TEMPER begins."
              tone="soft"
              className="lg:col-span-7"
            >
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center sm:gap-3">
                <ProtocolNode label="SERVICE FAILURE" />
                <ArrowRight className="hidden h-4 w-4 text-violet sm:block" />
                <ArrowDown className="mx-auto h-4 w-4 text-violet sm:hidden" />
                <ProtocolNode label="UPSTREAM LIABILITY SOURCE" accent />
                <ArrowRight className="hidden h-4 w-4 text-violet sm:block" />
                <ArrowDown className="mx-auto h-4 w-4 text-violet sm:hidden" />
                <ProtocolNode label="RESPONSIBILITY + CONFIRMED LOSS" />
              </div>
              <div className="mt-4 flex items-center gap-3 border-t border-paper/10 pt-4">
                <span className="h-2 w-2 rounded-full bg-violet" />
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-paper/45">
                  → TEMPER begins here
                </p>
              </div>
            </ProtocolStage>
          </div>

          <FlowConnector label="the secured remedy question enters the protocol" />

          <ProtocolStage
            number="03"
            label="Evidence"
            title="The mitigation question is disputed"
            copy="Both sides submit evidence about whether the agreed mitigation could have limited further loss."
            tone="accent"
          >
            <div className="grid gap-3 lg:grid-cols-[.8fr_1.35fr_.8fr] lg:items-center">
              <EvidenceNode label="PROVIDER EVIDENCE" />
              <div className="relative rounded-xl border border-violet/40 bg-violet/10 p-5 text-center">
                <div className="absolute -left-5 top-1/2 hidden w-5 border-t border-violet/50 lg:block" />
                <div className="absolute -right-5 top-1/2 hidden w-5 border-t border-violet/50 lg:block" />
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-violet">
                  Agreed mitigation question
                </p>
                <p className="mt-3 text-lg font-bold leading-snug text-paper">
                  Could the harmed party reasonably have used it before the loss became larger?
                </p>
              </div>
              <EvidenceNode label="CLAIMANT EVIDENCE" />
            </div>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-paper/10 pt-4">
              {["TIMING", "OPERATIONAL STATUS", "PRACTICAL ACCESS", "USABILITY"].map((item) => (
                <span
                  key={item}
                  className="rounded border border-paper/12 bg-paper/[0.04] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-paper/50"
                >
                  {item}
                </span>
              ))}
            </div>
            <p className="mt-5 border-t border-paper/10 pt-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-violet">
              Machine-native duty to mitigate
            </p>
          </ProtocolStage>

          <FlowConnector label="evidence moves to adjudication" />

          <div className="grid gap-4 lg:grid-cols-12">
            <ProtocolStage
              number="04"
              label="Adjudication"
              title="GenLayer adjudicates the evidence"
              copy="The evidence and agreement rule produce a bounded verdict."
              tone="purple"
              className="lg:col-span-7"
            >
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <div className="grid gap-2">
                  <EvidenceNode label="PROVIDER EVIDENCE" />
                  <EvidenceNode label="CLAIMANT EVIDENCE" />
                </div>
                <span className="hidden text-2xl text-violet sm:block">→</span>
                <div className="rounded-xl border border-violet/55 bg-violet/15 p-5 text-center shadow-[0_0_32px_rgba(139,92,246,0.14)]">
                  <p className="font-mono text-base font-extrabold uppercase tracking-[0.18em] text-violet">
                    GenLayer
                  </p>
                  <p className="mt-2 text-sm font-semibold text-paper/70">
                    Evidence-based adjudication
                  </p>
                  <div className="mx-auto mt-4 h-1.5 w-1.5 rounded-full bg-violet" />
                </div>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                <VerdictState label="VALID MITIGATION" copy="Reasonably available." tone="valid" />
                <VerdictState
                  label="INVALID MITIGATION"
                  copy="Not reasonably available."
                  tone="invalid"
                />
                <VerdictState
                  label="UNDETERMINED"
                  copy="Availability could not be determined reliably."
                  tone="neutral"
                />
              </div>
            </ProtocolStage>

            <ProtocolStage
              number="05"
              label="Remedy"
              title="TEMPER settles the remedy"
              copy="TEMPER applies the verdict to the agreed remedy rules and settles only the secured portion."
              tone="remedy"
              className="lg:col-span-5"
            >
              <div className="grid grid-cols-3 gap-2 border-b border-ink/10 pb-4">
                <MiniMetric label="Actual loss" value="10 GEN" />
                <MiniMetric label="Secured" value="8 GEN" />
                <MiniMetric label="Loss at mitigation" value="5 GEN" />
              </div>
              <div className="mt-5 rounded-xl border border-ink/10 bg-paper/70 p-4">
                <div className="flex items-end justify-between gap-3">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink/60">
                    Secured by TEMPER
                  </p>
                  <p className="text-xl font-extrabold text-ink">8 GEN</p>
                </div>
                <div className="mt-4 flex h-3 overflow-hidden rounded-sm border border-ink/10">
                  <span className="w-[62.5%] bg-coral/75" />
                  <span className="w-[37.5%] bg-mint/75" />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                  <span>5 GEN recoverable</span>
                  <span className="text-right">3 GEN avoidable</span>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-ink/10 pt-3 font-mono text-[9px] uppercase tracking-[0.1em] text-ink/55">
                <span>Outside TEMPER coverage</span>
                <span className="font-bold text-ink/75">2 GEN</span>
              </div>
            </ProtocolStage>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProtocolStage({
  number,
  label,
  title,
  copy,
  children,
  className = "",
  tone = "neutral",
}: {
  number: string;
  label: string;
  title: string;
  copy: string;
  children: React.ReactNode;
  className?: string;
  tone?: "neutral" | "soft" | "accent" | "purple" | "remedy";
}) {
  const toneClass =
    tone === "accent"
      ? "border-violet/40 bg-violet/[0.08]"
      : tone === "purple"
        ? "border-violet/45 bg-violet/[0.1]"
        : tone === "remedy"
          ? "border-violet/50 bg-paper text-ink"
          : tone === "soft"
            ? "border-paper/15 bg-paper/[0.055]"
            : "border-paper/12 bg-paper/[0.035]";
  const labelClass = "text-violet";
  const copyClass = tone === "remedy" ? "text-ink/60" : "text-paper/55";

  return (
    <article className={`rounded-xl border p-5 sm:p-6 ${toneClass} ${className}`}>
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className={`font-mono text-xs tracking-[0.18em] ${labelClass}`}>{number}</p>
          <p className={`mt-2 text-[10px] font-bold uppercase tracking-[0.16em] ${labelClass}`}>
            {label}
          </p>
          <h3 className="mt-3 max-w-2xl text-xl font-extrabold leading-tight sm:text-2xl">
            {title}
          </h3>
        </div>
        <span
          className={`hidden rounded border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] sm:block ${
            tone === "remedy" ? "border-violet/35 text-violet" : "border-paper/15 text-paper/40"
          }`}
        >
          {tone === "remedy" ? "TEMPER" : "PROTOCOL STATE"}
        </span>
      </div>
      <p className={`mt-3 max-w-2xl text-sm leading-6 ${copyClass}`}>{copy}</p>
      <div className={`mt-6 ${tone === "remedy" ? "text-ink" : "text-paper"}`}>{children}</div>
    </article>
  );
}

function ProtocolNode({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
    <div
      className={
        accent
          ? "rounded-lg border border-violet/45 bg-violet/15 px-3 py-3 text-center font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-violet"
          : "rounded-lg border border-paper/12 bg-paper/[0.04] px-3 py-3 text-center font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-paper/65"
      }
    >
      {label}
    </div>
  );
}

function EvidenceNode({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-paper/12 bg-paper/[0.04] px-4 py-3 text-center font-mono text-[10px] font-bold uppercase tracking-[0.11em] text-paper/65">
      {label}
    </div>
  );
}

function FlowConnector({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-3 text-paper/35" aria-hidden="true">
      <div className="hidden h-px w-16 bg-paper/15 sm:block" />
      <ArrowDown className="h-4 w-4 text-violet" />
      <span className="font-mono text-[9px] uppercase tracking-[0.14em]">{label}</span>
      <div className="hidden h-px w-16 bg-paper/15 sm:block" />
    </div>
  );
}

function VerdictState({
  label,
  copy,
  tone,
}: {
  label: string;
  copy: string;
  tone: "valid" | "invalid" | "neutral";
}) {
  const toneClass =
    tone === "valid" ? "text-mint" : tone === "invalid" ? "text-coral" : "text-paper/60";
  return (
    <div className="rounded-lg border border-paper/10 bg-paper/[0.035] p-3">
      <p className={`font-mono text-[9px] font-bold tracking-[0.08em] ${toneClass}`}>{label}</p>
      <p className="mt-1 text-xs leading-5 text-paper/55">{copy}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[8px] uppercase tracking-[0.08em] text-ink/50">{label}</p>
      <p className="mt-1 text-sm font-extrabold text-ink">{value}</p>
    </div>
  );
}

function AdjudicationSystem() {
  return (
    <section className="px-5 pb-20 lg:px-10 lg:pb-28">
      <div className="mx-auto max-w-[1440px] rounded-2xl bg-ink p-5 text-paper shadow-[var(--shadow-panel)] sm:p-8 lg:p-10">
        <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-center lg:gap-16">
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet">
              Evidence-based adjudication
            </p>
            <h2 className="mt-5 text-4xl font-extrabold sm:text-5xl">Why GenLayer?</h2>
            <p className="mt-5 leading-7 text-paper/65">
              Questions like “Was this mitigation actually available?” cannot always be answered by
              deterministic smart-contract logic alone.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-[1.1fr_auto_.9fr] md:items-center">
            <div className="grid grid-cols-2 gap-2">
              {[
                "WAS IT OPERATIONAL?",
                "WAS IT ACCESSIBLE?",
                "WAS THERE AN INTEGRATION BARRIER?",
                "WAS IT USABLE AT THE CLAIMED TIME?",
              ].map((question) => (
                <div
                  key={question}
                  className="flex min-h-20 items-center rounded-lg border border-paper/12 bg-paper/[0.04] p-3 font-mono text-[9px] font-bold uppercase leading-4 tracking-[0.08em] text-paper/60"
                >
                  {question}
                </div>
              ))}
            </div>

            <div className="hidden text-2xl text-violet md:block">→</div>

            <div>
              <div className="rounded-xl border border-violet/50 bg-violet/15 p-5 text-center">
                <p className="font-mono text-base font-extrabold uppercase tracking-[0.18em] text-violet">
                  GenLayer
                </p>
                <p className="mt-2 text-sm font-semibold text-paper/70">
                  Evidence-based adjudication
                </p>
                <div className="mx-auto mt-5 h-1.5 w-1.5 rounded-full bg-violet" />
              </div>
              <div
                className="flex items-center justify-center gap-2 pt-4 text-violet"
                aria-hidden="true"
              >
                <div className="h-4 border-l border-violet/45" />
                <ArrowDown className="h-4 w-4" />
                <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em]">
                  Verdict
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-8 border-t border-paper/10 pt-8 lg:grid-cols-[1fr_auto_1.15fr] lg:items-center">
          <div className="min-w-0">
            <p className="mb-3 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-paper/45">
              Verdict states
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <VerdictState label="VALID" copy="Reasonably available." tone="valid" />
              <VerdictState label="INVALID" copy="Not reasonably available." tone="invalid" />
              <VerdictState
                label="UNDETERMINED"
                copy="Availability could not be determined reliably."
                tone="neutral"
              />
            </div>
          </div>
          <div className="flex items-center justify-center text-violet" aria-hidden="true">
            <ArrowDown className="h-4 w-4 lg:hidden" />
            <ArrowRight className="hidden h-4 w-4 lg:block" />
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end">
            <div className="rounded-lg border border-violet/35 bg-violet/10 px-4 py-3">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-violet">
                TEMPER
              </p>
              <p className="mt-1 text-sm font-semibold text-paper/75">Deterministic settlement</p>
            </div>
            <p className="max-w-sm text-sm leading-6 text-paper/65">
              The disputed fact is adjudicated by GenLayer. The remedy is enforced by TEMPER.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ClosingAction() {
  return (
    <section className="px-5 pb-20 lg:px-10 lg:pb-24">
      <div className="mx-auto grid max-w-[1440px] gap-10 rounded-2xl border border-paper/10 bg-ink p-6 text-paper shadow-[var(--shadow-panel)] sm:p-10 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:gap-16 lg:p-14">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet">
            Remedy before dispute
          </p>
          <h2 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
            Set the terms before the dispute exists.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-paper/65">
            Define the covered service, agreed mitigation, secured amount, and agreement window
            before a loss occurs.
          </p>
          <Button asChild variant="hero" size="lg" className="mt-7">
            <Link to="/agreements/new">
              Create Agreement <ArrowRight />
            </Link>
          </Button>
        </div>

        <div className="rounded-xl border border-paper/12 bg-paper/[0.045] p-5 sm:p-7">
          <div className="grid grid-cols-2 gap-2">
            {["SERVICE", "MITIGATION", "COVERAGE", "WINDOW"].map((label) => (
              <div key={label} className="rounded-lg border border-paper/12 bg-paper/[0.035] p-4">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-paper/50">
                  {label}
                </p>
                <div className="mt-4 h-1.5 w-2/3 rounded-full bg-paper/15" />
              </div>
            ))}
          </div>
          <div className="flex justify-center py-4 text-violet">
            <ArrowDown className="h-5 w-5" />
          </div>
          <div className="rounded-lg border border-violet/45 bg-violet/15 px-4 py-4 text-center">
            <p className="font-mono text-xs font-extrabold uppercase tracking-[0.16em] text-violet">
              TEMPER agreement
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
