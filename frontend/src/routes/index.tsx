import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/temper/shell";
import { TemperHeroDocket } from "@/components/temper-hero-docket";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TEMPER · The breach is settled. The bill isn't." },
      {
        name: "description",
        content:
          "TEMPER turns disputed mitigation into enforceable remedies after responsibility is established.",
      },
      { property: "og:title", content: "TEMPER · The breach is settled. The bill isn't." },
      {
        property: "og:description",
        content:
          "TEMPER turns disputed mitigation into enforceable remedies after liability is established.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <main className="overflow-hidden bg-paper text-ink">
      <section className="paper-grid noise-mask relative px-5 pb-12 pt-12 md:pb-16 lg:px-10 lg:pb-[4.75rem] lg:pt-14">
        <div className="relative mx-auto grid max-w-[1440px] items-center gap-12 lg:grid-cols-[1.1fr_.9fr]">
          <div className="relative z-10 max-w-4xl">
            <p className="text-xs font-extrabold uppercase text-violet">
              GenLayer · Onchain Justice
            </p>
            <h1 className="mt-4 max-w-4xl font-display text-5xl font-extrabold leading-[1.02] sm:text-7xl lg:text-[4.8rem]">
              The breach is settled.
              <br />
              The bill isn't.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              TEMPER is a post-liability remedy protocol for bonded onchain service agreements.
              After a service failure, the provider claims when the agreed fallback became usable,
              the claimant responds, GenLayer adjudicates the mitigation dispute, and TEMPER settles
              what remains recoverable.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild variant="hero" size="lg">
                <Link to="/agreements/new" data-tour-target="create-agreement-hero">
                  Create Agreement <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/cases">Explore Cases</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs font-semibold text-muted-foreground">
              Powered by GenLayer · Post-liability remedy adjudication
            </p>
          </div>
          <TemperHeroDocket />
        </div>
      </section>

      <section className="border-y border-border bg-paper-deep px-5 py-10 lg:px-10">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet">
              Three moves after liability
            </p>
            <h2 className="mt-2 text-2xl font-extrabold sm:text-3xl">
              Three moves after liability.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 lg:min-w-[48rem]">
            {[
              ["01", "READ", "Read the agreement + liability record"],
              ["02", "PROVE", "Prove when the fallback became usable"],
              ["03", "SETTLE", "GenLayer judgment → TEMPER remedy"],
            ].map(([number, label, copy]) => (
              <div key={number} className="border-l-2 border-violet/35 pl-3">
                <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-violet">
                  {number} · {label}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy}</p>
              </div>
            ))}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/cases">Explore a live case</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="bg-ink px-5 py-20 text-paper lg:px-10 lg:py-28">
        <div className="mx-auto max-w-[1440px]">
          <div data-tour-target="clear-question" className="max-w-3xl">
            <p className="text-xs font-bold uppercase text-violet">Core idea</p>
            <h2 className="mt-4 text-4xl font-extrabold sm:text-5xl">
              A remedy after responsibility.
            </h2>
            <p className="mt-5 max-w-[680px] text-sm leading-6 text-paper/65">
              The original breach can be settled while the remedy is still disputed. A provider may
              be responsible for the original failure without being responsible for every loss that
              follows.
            </p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-12">
            <article className="rounded-xl border border-paper/10 bg-paper/[0.035] p-6 lg:col-span-5 lg:p-7">
              <div className="flex min-h-44 items-center justify-center rounded-lg border border-paper/10 bg-ink/45 p-5">
                <div className="w-full max-w-xs rounded-md border border-paper/15 bg-paper/[0.04] p-4 shadow-[var(--shadow-panel)]">
                  <div className="flex items-center justify-between border-b border-paper/10 pb-3">
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-paper/45">
                      Upstream record
                    </span>
                    <span className="h-2 w-2 rounded-full bg-coral" />
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-2 py-4 text-xs">
                    <span className="text-paper/45">Liability status</span>
                    <span className="font-semibold text-coral">Established</span>
                    <span className="text-paper/45">Confirmed loss</span>
                    <span className="font-semibold text-paper">8 GEN</span>
                  </div>
                  <div className="flex items-center gap-2 border-t border-paper/10 pt-3">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-coral/20 text-[10px] font-bold text-coral">
                      ✓
                    </span>
                    <span className="text-xs font-semibold text-paper/65">
                      Responsibility bound
                    </span>
                  </div>
                </div>
              </div>
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-coral">
                01 · The record
              </p>
              <h3 className="mt-2 text-xl font-bold">Responsibility already established</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-paper/60">
                Upstream liability and confirmed loss enter TEMPER.
              </p>
            </article>

            <article className="rounded-xl border border-paper/10 bg-paper/[0.035] p-6 lg:col-span-7 lg:p-7">
              <div className="relative min-h-44 overflow-hidden rounded-lg border border-paper/10 bg-ink/45 px-6 py-5">
                <div className="absolute left-10 top-7 h-[calc(100%-3.5rem)] border-l border-violet/50" />
                <div className="relative flex h-8 items-start gap-5">
                  <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full border-2 border-violet bg-ink" />
                  <span className="text-xs font-semibold text-paper/75">Breach</span>
                </div>
                <div className="relative flex h-8 items-start gap-5">
                  <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full border-2 border-violet bg-ink" />
                  <span className="text-xs font-semibold text-paper/75">4 GEN lost</span>
                </div>
                <div className="relative flex h-8 items-start gap-5">
                  <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full border-2 border-violet bg-violet" />
                  <span className="text-xs font-semibold text-violet">
                    Backup claimed available
                  </span>
                </div>
                <div className="relative flex items-start gap-5">
                  <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full border-2 border-coral bg-coral" />
                  <span className="text-xs font-semibold text-paper/75">8 GEN final loss</span>
                </div>
              </div>
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-violet">
                02 · The claim
              </p>
              <h3 className="mt-2 text-xl font-bold">The intervention point</h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-paper/60">
                The provider claims the agreed fallback became reasonably available after 4 GEN had
                already been lost. TEMPER asks whether the remaining loss could have been avoided.
              </p>
            </article>

            <article className="rounded-xl border border-violet/45 bg-violet/[0.09] p-6 shadow-[0_24px_80px_-42px_color-mix(in_oklab,var(--violet)_45%,transparent)] lg:col-span-6 lg:p-7">
              <div className="relative min-h-48 overflow-hidden rounded-lg border border-violet/20 bg-ink/40 p-5">
                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox="0 0 520 190"
                  fill="none"
                  aria-hidden="true"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M95 58 L205 93 M95 142 L205 98 M315 95 L430 95"
                    stroke="rgb(255 255 255 / 18%)"
                    strokeWidth="1.5"
                  />
                  <circle cx="95" cy="58" r="4" fill="rgb(255 255 255 / 55%)" />
                  <circle cx="95" cy="142" r="4" fill="rgb(255 255 255 / 55%)" />
                  <circle cx="430" cy="95" r="4" fill="rgb(255 255 255 / 55%)" />
                </svg>
                <div className="absolute left-4 top-7 rounded border border-paper/15 bg-paper/[0.05] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-paper/60">
                  Provider evidence
                </div>
                <div className="absolute bottom-7 left-4 rounded border border-paper/15 bg-paper/[0.05] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-paper/60">
                  Claimant evidence
                </div>
                <div className="absolute left-1/2 top-1/2 flex h-16 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border border-violet/70 bg-violet/20 text-center text-xs font-bold uppercase tracking-[0.12em] text-violet shadow-[0_0_32px_color-mix(in_oklab,var(--violet)_25%,transparent)]">
                  GenLayer
                </div>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 rounded border border-paper/15 bg-paper/[0.05] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-paper/60">
                  Verdict
                </div>
              </div>
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-violet">
                03 · The evidence
              </p>
              <h3 className="mt-2 text-2xl font-bold">What was actually possible?</h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-paper/60">
                Provider and claimant submit public evidence about whether the fallback could
                practically be used.
              </p>
            </article>

            <article className="rounded-xl border border-paper/10 bg-paper/[0.035] p-6 lg:col-span-6 lg:p-6">
              <div className="flex min-h-48 flex-col justify-center rounded-lg border border-paper/10 bg-ink/45 p-5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-paper/65">8 GEN confirmed loss</span>
                  <span className="font-mono text-paper/40">BOND</span>
                </div>
                <div className="mt-5 flex h-5 overflow-hidden rounded-sm border border-paper/15">
                  <div className="flex w-1/2 items-center justify-center bg-coral/75 text-[9px] font-bold text-ink">
                    4
                  </div>
                  <div className="flex w-1/2 items-center justify-center bg-mint/70 text-[9px] font-bold text-ink">
                    4
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-paper/50">
                  <span>Recoverable</span>
                  <span className="text-right">Avoidable</span>
                </div>
                <div className="mt-6 flex justify-between border-t border-paper/10 pt-3 font-mono text-[10px] text-paper/45">
                  <span>4 GEN</span>
                  <span>4 GEN</span>
                </div>
              </div>
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-mint">
                04 · The remedy
              </p>
              <h3 className="mt-2 text-xl font-bold">What should still be paid?</h3>
              <p className="mt-2 text-sm leading-6 text-paper/60">
                GenLayer adjudicates the mitigation question; TEMPER converts the judgment into
                recoverable loss.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="px-5 py-20 lg:px-10 lg:py-28">
        <div className="mx-auto max-w-[1440px]">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase text-violet">Mechanism · Onchain Justice</p>
            <h2 className="mt-4 text-4xl font-extrabold sm:text-5xl">
              Onchain Justice should not stop at breach.
            </h2>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground">
              <span className="font-semibold text-ink">The remedy moves one state at a time.</span>{" "}
              Smart contracts enforce objective rules, GenLayer adjudicates disputed facts from
              evidence, and TEMPER carries that process into the remedy.
            </p>
          </div>
          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["01", "LIABILITY", "Responsibility + confirmed loss arrive upstream."],
              ["02", "CLAIM", "The provider identifies the intervention point."],
              ["03", "EVIDENCE", "Both sides show what was practically possible."],
              ["04", "JUDGMENT", "GenLayer adjudicates the mitigation dispute."],
              ["05", "SETTLEMENT", "TEMPER applies the judgment to secured loss."],
            ].map(([number, label, copy]) => (
              <div
                key={number}
                data-tour-target={number === "04" ? "genlayer-adjudication" : undefined}
                className="bg-paper-deep p-5"
              >
                <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-violet">
                  {number} · {label}
                </p>
                <p className="mt-3 text-sm font-semibold leading-6 text-ink">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-paper-deep px-5 py-20 lg:px-10">
        <div className="mx-auto grid max-w-[1440px] gap-12 lg:grid-cols-[.78fr_1.22fr] lg:items-center lg:gap-20">
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase text-violet">Technical positioning</p>
            <h2 className="mt-4 text-4xl font-extrabold leading-[1.05] sm:text-5xl">
              <span className="block">Post-liability</span>
              <span className="block">avoidable-loss</span>
              <span className="block text-violet">adjudication</span>
            </h2>
            <div className="mt-6 space-y-4 text-sm leading-6 text-muted-foreground">
              <p>
                Responsibility is already established upstream.{" "}
                <span className="font-semibold text-ink">“Who is responsible?”</span>
              </p>
              <p>
                TEMPER handles the next question:{" "}
                <span className="font-semibold text-ink">
                  “How much of the continuing loss should still remain recoverable?”
                </span>
              </p>
            </div>
          </div>
          <div
            className="scroll-mt-24 relative overflow-hidden rounded-xl border border-border bg-paper p-6 sm:p-8"
            data-tour-target="post-liability"
          >
            <div className="pointer-events-none absolute left-8 right-8 top-1/2 hidden h-px bg-border md:block" />
            <div className="relative grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1.35fr] md:items-center md:gap-3">
              <div className="rounded-lg border border-border bg-paper-deep p-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Upstream liability
                </p>
                <p className="mt-4 text-lg font-bold leading-snug">Who is responsible?</p>
              </div>
              <span className="text-center text-xl text-muted-foreground md:block">→</span>
              <div className="rounded-lg border border-ink/20 bg-ink p-5 text-paper">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/45">
                  Contract fact
                </p>
                <p className="mt-4 text-lg font-bold leading-snug">Liability established</p>
              </div>
              <span className="text-center text-xl text-violet md:block">→</span>
              <div className="rounded-lg border border-violet/45 bg-violet-soft/45 p-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-violet">
                  TEMPER
                </p>
                <p className="mt-4 text-xl font-extrabold leading-snug text-ink">
                  How much loss should remain recoverable?
                </p>
              </div>
            </div>
            <div className="mt-7 flex items-center gap-3 border-t border-border pt-5">
              <span className="h-2 w-2 rounded-full bg-violet" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Machine-native duty to mitigate
              </span>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-8 grid max-w-[1440px] gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
          {[
            ["Smart contracts", "Objective execution"],
            ["GenLayer", "Contextual adjudication"],
            ["TEMPER", "Remedy application"],
          ].map(([label, copy]) => (
            <div key={label} className="bg-paper p-5">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-violet">
                {label}
              </p>
              <p className="mt-2 text-sm font-bold">{copy}</p>
            </div>
          ))}
        </div>
        <div className="mx-auto mt-8 max-w-[1440px] rounded-xl border border-border bg-paper p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet">
              Current application
            </p>
          </div>
          <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Primary service
              </p>
              <p className="mt-1.5 font-bold">Binance BTC/USD</p>
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Agreed fallback
              </p>
              <p className="mt-1.5 font-bold">Pyth BTC/USD</p>
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Coverage
              </p>
              <p className="mt-1.5 font-bold">10 GEN</p>
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Rule
              </p>
              <p className="mt-1.5 font-bold leading-5">
                Switch to Pyth if it is working and accessible to the other party.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-20 lg:px-10 lg:py-24">
        <div className="mx-auto max-w-[1440px]">
          <div className="rounded-2xl border border-paper/10 bg-ink px-6 py-12 text-paper shadow-[var(--shadow-panel)] sm:px-10 lg:px-16 lg:py-14">
            <div className="grid gap-12 lg:grid-cols-[1.4fr_.85fr] lg:items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet">
                  Remedy, not just liability
                </p>
                <h2 className="mt-4 max-w-3xl text-4xl font-extrabold leading-tight sm:text-6xl">
                  Turn disputed mitigation into an enforceable remedy.
                </h2>
                <p className="mt-5 max-w-2xl text-base leading-7 text-paper/65">
                  Create a bonded agreement, define the fallback obligation, and let GenLayer
                  adjudicate the mitigation dispute when a failure occurs. TEMPER turns that
                  judgment into an enforceable remedy.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button asChild variant="hero" size="lg">
                    <Link to="/agreements/new">
                      Create Agreement <ArrowRight />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <Link to="/cases">Explore Cases</Link>
                  </Button>
                </div>
                <p className="mt-6 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-paper/40">
                  Evidence in · GenLayer verdict · Onchain settlement
                </p>
              </div>
              <div className="rounded-xl border border-paper/10 bg-paper/[0.05] p-5 sm:p-6">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-paper/45">
                  Remedy path
                </p>
                <div className="mt-6 grid gap-2 sm:grid-cols-3 sm:items-center">
                  <div className="rounded-lg border border-paper/15 bg-paper/[0.04] p-4">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-paper/55">
                      Evidence
                    </p>
                    <p className="mt-2 text-sm font-bold">Two-sided inputs</p>
                  </div>
                  <div className="hidden text-center text-xl text-violet sm:block">→</div>
                  <div className="rounded-lg border border-violet/45 bg-violet/10 p-4 sm:col-start-3">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-violet">
                      GenLayer judgment
                    </p>
                    <p className="mt-2 text-sm font-bold">Mitigation question</p>
                  </div>
                  <div className="text-center text-violet sm:hidden">↓</div>
                  <div className="rounded-lg border border-violet/45 bg-violet/10 p-4 sm:col-span-3">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-violet">
                      TEMPER remedy
                    </p>
                    <p className="mt-2 text-sm font-bold">Secured loss applied onchain</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
