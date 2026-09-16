export function TemperHeroDocket() {
  return (
    <div className="relative mx-auto w-full max-w-2xl px-2 py-4 sm:px-6 sm:py-7">
      <div
        className="absolute inset-x-8 bottom-3 top-8 rotate-2 rounded-[1.25rem] border border-ink/10 bg-violet/15 shadow-[var(--shadow-panel)]"
        aria-hidden="true"
      />
      <div
        className="absolute inset-x-4 bottom-5 top-4 -rotate-2 rounded-[1.25rem] border border-ink/10 bg-paper-deep shadow-[var(--shadow-panel)]"
        aria-hidden="true"
      />
      <article
        className="relative overflow-hidden rounded-[1.15rem] border-2 border-ink bg-paper shadow-[0_30px_80px_-38px_rgb(28_26_35_/_60%)]"
        role="img"
        aria-label="Illustrative TEMPER remedy docket showing established liability, a mitigation claim, a GenLayer finding, and a four GEN recoverable versus four GEN avoidable settlement split."
      >
        <div className="flex items-center justify-between gap-4 border-b-2 border-ink bg-ink px-4 py-3 text-paper sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-violet bg-violet text-[10px] font-black text-paper">
              T
            </span>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">
              TEMPER / remedy docket
            </p>
          </div>
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-paper/55">
            illustrative case
          </span>
        </div>

        <div className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Post-liability remedy record
              </p>
              <h2 className="mt-2 font-display text-3xl font-extrabold uppercase leading-none tracking-[-0.04em] text-ink sm:text-4xl">
                Settlement order
              </h2>
            </div>
            <span className="mt-1 shrink-0 -rotate-6 rounded-sm border-2 border-violet px-2 py-1 font-mono text-[9px] font-black uppercase tracking-[0.13em] text-violet">
              remedy / 01
            </span>
          </div>

          <div className="mt-5 grid gap-3 border-y border-ink/15 py-4 sm:grid-cols-[1.1fr_.9fr]">
            <div>
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Bonded service
              </p>
              <p className="mt-1 text-sm font-bold text-ink">BTC/USD price feed using Binance</p>
            </div>
            <div className="sm:border-l sm:border-ink/15 sm:pl-4">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Agreed fallback
              </p>
              <p className="mt-1 text-sm font-bold text-ink">Pyth BTC/USD</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-[.78fr_1.22fr]">
            <div className="rounded-md border border-coral/35 bg-coral/10 p-3">
              <p className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-coral">
                Upstream status
              </p>
              <p className="mt-2 text-sm font-extrabold uppercase text-ink">
                Liability established
              </p>
              <div className="mt-3 border-t border-coral/20 pt-2">
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  Confirmed loss
                </p>
                <p className="mt-0.5 text-2xl font-black tracking-tight text-ink">8 GEN</p>
              </div>
            </div>

            <div className="rounded-md border border-ink/15 bg-paper-deep/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-violet">
                  Mitigation claim
                </p>
                <span className="rounded-full bg-violet/10 px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-violet">
                  judged
                </span>
              </div>
              <p className="mt-2 text-sm font-bold leading-5 text-ink">
                Fallback claimed after 4 GEN lost
              </p>
              <div className="mt-3 flex items-center gap-1.5 font-mono text-[8px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
                <span>breach</span>
                <span className="h-px flex-1 bg-ink/20" />
                <span>claim</span>
                <span className="h-px flex-1 bg-ink/20" />
                <span>judgment</span>
                <span className="h-px flex-1 bg-ink/20" />
                <span>settlement</span>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-md border-2 border-violet/45 bg-violet/10 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div>
              <p className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-violet">
                GenLayer finding
              </p>
              <p className="mt-1 text-base font-extrabold uppercase leading-5 text-ink">
                Mitigation reasonably available
              </p>
            </div>
            <div className="self-start rounded-sm border border-violet/45 bg-paper px-2.5 py-2 text-right shadow-sm sm:self-auto">
              <p className="font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                remedy basis
              </p>
              <p className="mt-0.5 font-mono text-[10px] font-black uppercase text-violet">
                avoidable loss
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2.5" data-tour-target="remedy-example">
            <div className="border-t-4 border-coral bg-coral/10 px-3 py-3.5">
              <p className="font-mono text-[9px] font-black uppercase tracking-[0.12em] text-coral">
                Recoverable
              </p>
              <p className="mt-1 text-3xl font-black tracking-[-0.04em] text-coral sm:text-4xl">
                4 GEN
              </p>
              <p className="mt-1 text-[10px] font-semibold text-ink/60">from secured bond</p>
            </div>
            <div className="border-t-4 border-mint bg-mint/15 px-3 py-3.5">
              <p className="font-mono text-[9px] font-black uppercase tracking-[0.12em] text-mint">
                Avoidable
              </p>
              <p className="mt-1 text-3xl font-black tracking-[-0.04em] text-mint sm:text-4xl">
                4 GEN
              </p>
              <p className="mt-1 text-[10px] font-semibold text-ink/60">secured loss</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-ink/15 pt-3 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            <span>Post-liability remedy record</span>
            <span>Illustrative split · not live case data</span>
          </div>
        </div>
      </article>
    </div>
  );
}
