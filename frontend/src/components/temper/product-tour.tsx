import { ArrowDown, ArrowRight, ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProductTourContext } from "./product-tour-context";

const PRODUCT_TOUR_STORAGE_KEY = "temper_product_tour_v1";
const TOUR_STEP_COUNT = 5;

type TourPhase = "nudge" | "tour" | null;

type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type PanelSize = {
  width: number;
  height: number;
};

type PanelPlacement = {
  left: number;
  top: number;
  height: number;
};

function hasSeenTour() {
  try {
    return window.localStorage.getItem(PRODUCT_TOUR_STORAGE_KEY) === "completed";
  } catch {
    return false;
  }
}

function rememberTour() {
  try {
    window.localStorage.setItem(PRODUCT_TOUR_STORAGE_KEY, "completed");
  } catch {
    // The tour remains usable when browser storage is unavailable.
  }
}

function visibleTarget(target: string): HTMLElement | undefined {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-tour-target="${target}"]`),
  );
  return elements.find((element) => {
    const rect = element.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      getComputedStyle(element).visibility !== "hidden" &&
      getComputedStyle(element).display !== "none"
    );
  });
}

function readTargetRect(target: string): TargetRect | null {
  const element = visibleTarget(target);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const padding = 8;
  return {
    top: Math.max(8, rect.top - padding),
    left: Math.max(8, rect.left - padding),
    width: Math.min(window.innerWidth - 16, rect.width + padding * 2),
    height: rect.height + padding * 2,
  };
}

function panelPosition(
  target: TargetRect | null,
  step: number,
  measuredSize: PanelSize | null,
  compact: boolean,
) {
  const horizontalMargin = compact ? 12 : 32;
  const margin = compact ? 24 : 32;
  const width = compact
    ? Math.max(0, window.innerWidth - horizontalMargin * 2)
    : Math.min(440, window.innerWidth - horizontalMargin * 2);
  const estimatedHeight = step === 4 ? 640 : 540;
  const maxHeight = Math.max(0, window.innerHeight - margin * 2);
  const height = Math.min(estimatedHeight, maxHeight);
  const panelHeight = Math.min(maxHeight, Math.max(height, measuredSize?.height ?? 0));
  const candidates: PanelPlacement[] = [
    {
      left: window.innerWidth - width - horizontalMargin,
      top: window.innerHeight - margin - panelHeight,
      height: panelHeight,
    },
    { left: horizontalMargin, top: window.innerHeight - margin - panelHeight, height: panelHeight },
    { left: window.innerWidth - width - horizontalMargin, top: margin, height: panelHeight },
    { left: horizontalMargin, top: margin, height: panelHeight },
  ];
  if (TOUR_STEPS[step]?.side === "left") candidates.unshift(candidates.splice(1, 1)[0]!);
  const targetBox = target
    ? {
        left: target.left - 12,
        top: target.top - 12,
        right: target.left + target.width + 12,
        bottom: target.top + target.height + 12,
      }
    : null;
  const overlapsTarget = (candidate: PanelPlacement) =>
    targetBox
      ? candidate.left < targetBox.right &&
        candidate.left + width > targetBox.left &&
        candidate.top < targetBox.bottom &&
        candidate.top + candidate.height > targetBox.top
      : false;
  const clampLeft = (left: number) =>
    Math.max(horizontalMargin, Math.min(left, window.innerWidth - width - horizontalMargin));
  const clampTop = (top: number) =>
    Math.max(margin, Math.min(top, window.innerHeight - panelHeight - margin));
  const anchoredCandidates: PanelPlacement[] = target
    ? [
        {
          left: clampLeft(target.left - width - 12),
          top: clampTop(target.top),
          height: panelHeight,
        },
        {
          left: clampLeft(target.left + target.width + 12),
          top: clampTop(target.top),
          height: panelHeight,
        },
        {
          left: clampLeft(target.left),
          top: clampTop(target.top - panelHeight - 12),
          height: panelHeight,
        },
        {
          left: clampLeft(target.left),
          top: clampTop(target.top + target.height + 12),
          height: panelHeight,
        },
      ]
    : [];
  const cornerCandidates: PanelPlacement[] = [
    { left: horizontalMargin, top: margin, height: panelHeight },
    {
      left: window.innerWidth - width - horizontalMargin,
      top: margin,
      height: panelHeight,
    },
    {
      left: horizontalMargin,
      top: window.innerHeight - panelHeight - margin,
      height: panelHeight,
    },
    {
      left: window.innerWidth - width - horizontalMargin,
      top: window.innerHeight - panelHeight - margin,
      height: panelHeight,
    },
  ];
  const separatedCandidates: PanelPlacement[] = targetBox
    ? [
        {
          left: clampLeft(targetBox.left),
          top: margin,
          height: Math.max(0, targetBox.top - margin - 12),
        },
        {
          left: clampLeft(targetBox.left),
          top: targetBox.bottom + 12,
          height: Math.max(0, window.innerHeight - margin - targetBox.bottom - 12),
        },
      ].filter((candidate) => candidate.height > 0)
    : [];
  const selected = [
    ...candidates,
    ...anchoredCandidates,
    ...cornerCandidates,
    ...separatedCandidates,
  ].find((candidate) => !overlapsTarget(candidate));
  if (!selected) return undefined;

  return {
    left: clampLeft(selected.left),
    top: selected.top,
    width,
    maxHeight: selected.height,
  };
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type TourScrollComposition = "hero" | "section" | "adjudication";

function scrollToTourComposition(target: HTMLElement, composition: TourScrollComposition) {
  const behavior = prefersReducedMotion() ? "auto" : "smooth";

  if (composition === "hero") {
    window.scrollTo({ top: 0, behavior });
    return;
  }

  const rect = target.getBoundingClientRect();
  const headerHeight = document.querySelector("header")?.getBoundingClientRect().height ?? 72;
  const desiredTop =
    composition === "adjudication"
      ? Math.max(headerHeight + 64, 128)
      : Math.max(headerHeight + 32, 104);
  const top = Math.max(0, window.scrollY + rect.top - desiredTop);
  window.scrollTo({ top, behavior });
}

export function ProductTourProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [phase, setPhase] = useState<TourPhase>(null);
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [panelSize, setPanelSize] = useState<PanelSize | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const transitionTimerRef = useRef<number | undefined>(undefined);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const closeTour = useCallback((remember = true) => {
    if (transitionTimerRef.current) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = undefined;
    }
    setIsTransitioning(false);
    if (remember) rememberTour();
    setPhase(null);
    setTargetRect(null);
    requestAnimationFrame(() => restoreFocusRef.current?.focus());
  }, []);

  const startTour = useCallback(() => {
    setStep(0);
    setPhase("tour");
    requestAnimationFrame(() => {
      const firstStep = TOUR_STEPS[0]!;
      const target = visibleTarget(firstStep.target);
      if (target) scrollToTourComposition(target, firstStep.composition);
    });
  }, []);

  const openTour = useCallback(() => {
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (pathname !== "/") {
      void navigate({ to: "/" }).then(() => startTour());
      return;
    }
    startTour();
  }, [navigate, pathname, startTour]);

  const beginTour = useCallback(() => {
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    startTour();
  }, [startTour]);

  const moveToStep = useCallback(
    (nextStep: number) => {
      if (nextStep === step || isTransitioning) return;
      if (transitionTimerRef.current) {
        window.clearTimeout(transitionTimerRef.current);
      }

      const nextTourStep = TOUR_STEPS[nextStep];
      if (!nextTourStep) {
        setStep(nextStep);
        setIsTransitioning(false);
        transitionTimerRef.current = undefined;
        return;
      }
      const target = visibleTarget(nextTourStep.target);
      setTargetRect(null);
      if (!target) {
        setStep(nextStep);
        setIsTransitioning(false);
        transitionTimerRef.current = undefined;
        return;
      }

      setIsTransitioning(true);
      scrollToTourComposition(target, nextTourStep.composition);
      transitionTimerRef.current = window.setTimeout(
        () => {
          setStep(nextStep);
          setIsTransitioning(false);
          transitionTimerRef.current = undefined;
        },
        prefersReducedMotion() ? 0 : nextTourStep.settleDelay,
      );
    },
    [isTransitioning, step],
  );

  const finishAndCreateAgreement = useCallback(() => {
    rememberTour();
    setPhase(null);
    setTargetRect(null);
    requestAnimationFrame(() => restoreFocusRef.current?.focus());
    void navigate({ to: "/agreements/new" });
  }, [navigate]);

  useEffect(() => {
    if (pathname !== "/" || hasSeenTour()) return;
    const timer = window.setTimeout(() => {
      if (window.location.pathname === "/" && !hasSeenTour()) {
        setPhase((current) => (current === null ? "nudge" : current));
      }
    }, 2_000);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (pathname === "/") return;
    setPhase((current) => (current === "nudge" || current === "tour" ? null : current));
    setTargetRect(null);
  }, [pathname]);

  useEffect(() => {
    const updateWidth = () => setViewportWidth(window.innerWidth);
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  useEffect(() => {
    if (phase !== "tour") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeTour();
      }
      if (event.key === "ArrowLeft" && step > 0) {
        event.preventDefault();
        moveToStep(step - 1);
      }
      if (event.key === "ArrowRight" && step < TOUR_STEP_COUNT - 1) {
        event.preventDefault();
        moveToStep(step + 1);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeTour, moveToStep, phase, step]);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    };
  }, []);

  const tourTarget = phase === "tour" ? TOUR_STEPS[step]?.target : undefined;

  useEffect(() => {
    if (phase !== "tour" || !tourTarget || isTransitioning) {
      setTargetRect(null);
      return;
    }
    let frame = 0;
    const updateTarget = () => {
      setTargetRect(readTargetRect(tourTarget));
      frame = 0;
    };
    frame = requestAnimationFrame(updateTarget);
    window.addEventListener("resize", updateTarget);
    window.addEventListener("scroll", updateTarget, true);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateTarget);
      window.removeEventListener("scroll", updateTarget, true);
    };
  }, [isTransitioning, phase, step, tourTarget]);

  useEffect(() => {
    if (phase !== "tour") {
      setPanelSize(null);
      return;
    }
    const frame = requestAnimationFrame(() => {
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPanelSize((current) =>
        current?.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height },
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [phase, step, isTransitioning]);

  const contextValue = useMemo(() => ({ openTour }), [openTour]);
  const compactViewport = viewportWidth === 0 || viewportWidth < 768;
  const position =
    phase === "tour" ? panelPosition(targetRect, step, panelSize, compactViewport) : undefined;

  return (
    <ProductTourContext.Provider value={contextValue}>
      {children}
      {phase === "nudge" && <TourNudge onStart={beginTour} onDismiss={() => closeTour()} />}
      {phase === "tour" && (
        <div className="fixed inset-0 z-[70]">
          {targetRect ? (
            <>
              <div
                className="absolute inset-x-0 top-0 bg-ink/50"
                style={{ height: targetRect.top }}
                aria-hidden="true"
              />
              <div
                className="absolute left-0 bg-ink/50"
                style={{ top: targetRect.top, width: targetRect.left, height: targetRect.height }}
                aria-hidden="true"
              />
              <div
                className="absolute right-0 bg-ink/50"
                style={{
                  top: targetRect.top,
                  left: targetRect.left + targetRect.width,
                  height: targetRect.height,
                }}
                aria-hidden="true"
              />
              <div
                className="absolute inset-x-0 bottom-0 bg-ink/50"
                style={{ top: targetRect.top + targetRect.height }}
                aria-hidden="true"
              />
            </>
          ) : (
            <div className="absolute inset-0 bg-ink/50" aria-hidden="true" />
          )}
          {targetRect && (
            <div
              className="pointer-events-none fixed z-[1] rounded-lg ring-2 ring-violet ring-offset-2 ring-offset-transparent shadow-[0_0_24px_rgba(139,92,246,0.22)]"
              style={targetRect}
              aria-hidden="true"
            />
          )}
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-tour-title"
            aria-describedby="product-tour-description"
            tabIndex={-1}
            className={cn(
              "fixed z-[2] flex max-h-[calc(100dvh-3rem)] min-h-0 flex-col overflow-hidden border border-violet/30 bg-[#17151f] p-5 text-paper shadow-2xl outline-none sm:rounded-xl sm:p-7",
              compactViewport ? "max-h-[calc(100dvh-3rem)]" : "rounded-xl",
            )}
            style={position ?? { visibility: "hidden" }}
          >
            <TourContent
              step={step}
              onBack={() => moveToStep(Math.max(0, step - 1))}
              onNext={() => moveToStep(Math.min(TOUR_STEP_COUNT - 1, step + 1))}
              onSkip={() => closeTour()}
              onCreateAgreement={finishAndCreateAgreement}
              onFinish={() => closeTour()}
            />
          </div>
        </div>
      )}
    </ProductTourContext.Provider>
  );
}

type TourStep = {
  target: string;
  composition: TourScrollComposition;
  settleDelay: number;
  side?: "left" | "right";
};

const TOUR_STEPS: readonly TourStep[] = [
  { target: "create-agreement-hero", composition: "hero", settleDelay: 450 },
  { target: "post-liability", composition: "section", settleDelay: 450 },
  { target: "clear-question", composition: "section", settleDelay: 450 },
  {
    target: "genlayer-adjudication",
    composition: "adjudication",
    settleDelay: 450,
    side: "left",
  },
  { target: "remedy-example", composition: "hero", settleDelay: 650 },
] as const;

function TourNudge({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  return (
    <aside
      aria-label="Product tour invitation"
      className="fixed inset-x-4 bottom-4 z-[60] w-auto max-w-[390px] overflow-hidden rounded-xl border border-violet/30 bg-[#17151f] p-5 text-paper shadow-2xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 sm:left-auto sm:right-5 sm:max-w-[390px] sm:p-6"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-violet" aria-hidden="true" />
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet">New to TEMPER?</p>
        <span className="font-mono text-xs text-paper/40">60 SEC</span>
      </div>
      <h2 className="mt-4 text-xl font-extrabold leading-tight">
        Take the 60-second product tour.
      </h2>
      <p className="mt-3 text-sm leading-6 text-paper/65">
        Follow the path from service promise to bond, failure, evidence, and enforceable remedy.
      </p>
      <div className="mt-5 flex items-center gap-3">
        <Button variant="hero" onClick={onStart}>
          Start Tour <ArrowRight />
        </Button>
        <Button
          variant="ghost"
          className="text-paper/65 hover:bg-paper/10 hover:text-paper"
          onClick={onDismiss}
        >
          Not now
        </Button>
      </div>
    </aside>
  );
}

function TourContent({
  step,
  onBack,
  onNext,
  onSkip,
  onCreateAgreement,
  onFinish,
}: {
  step: number;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  onCreateAgreement: () => void;
  onFinish: () => void;
}) {
  const isFinal = step === TOUR_STEP_COUNT - 1;
  const content = TOUR_CONTENT[step] ?? TOUR_CONTENT[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet">
            Step {step + 1} of {TOUR_STEP_COUNT}
          </p>
          <span className="font-mono text-xs text-paper/40">TEMPER / GUIDE</span>
        </div>
        <div className="mt-5 flex gap-1.5" aria-label={`Step ${step + 1} of ${TOUR_STEP_COUNT}`}>
          {Array.from({ length: TOUR_STEP_COUNT }, (_, index) => (
            <span
              key={index}
              className={cn("h-1 flex-1 rounded-full", index <= step ? "bg-violet" : "bg-paper/15")}
            />
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        <h2 id="product-tour-title" className="mt-7 max-w-xl text-3xl font-extrabold leading-tight">
          {content.title}
        </h2>
        <div id="product-tour-description" className="mt-5 text-sm leading-7 text-paper/65">
          {content.body}
        </div>
        {content.visual}
      </div>
      <div className="mt-7 shrink-0 border-t border-paper/10 pt-4 sm:flex sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={step === 0}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-2 text-sm font-semibold text-paper/55 transition hover:bg-paper/10 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet disabled:pointer-events-none disabled:opacity-35"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
          {!isFinal && (
            <button
              type="button"
              onClick={onSkip}
              className="rounded-md px-2 py-2 text-sm font-semibold text-paper/45 transition hover:bg-paper/10 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
            >
              Skip
            </button>
          )}
          {isFinal ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="ghost"
                onClick={onFinish}
                className="text-paper/65 hover:bg-paper/10 hover:text-paper"
              >
                Finish Tour
              </Button>
              <Button variant="hero" onClick={onCreateAgreement}>
                Create an Agreement <ArrowRight />
              </Button>
            </div>
          ) : (
            <Button variant="hero" onClick={onNext}>
              Next <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

const TOUR_CONTENT = [
  {
    title: "Define the service promise before a loss happens",
    body: (
      <>
        <p>
          The parties define the covered service, what mitigation should be taken if it fails, when
          that mitigation counts as reasonably available, and how much GEN the agreement can secure.
        </p>
        <p className="mt-4 text-paper/45">
          TEMPER does not invent these obligations after a dispute. The parties define them upfront.
        </p>
      </>
    ),
    visual: <TourAgreementDiagram />,
  },
  {
    title: "TEMPER starts after liability",
    body: (
      <>
        <p>TEMPER does not decide whether the original service failed or who caused the loss.</p>
        <p className="mt-4">
          A trusted upstream liability source first establishes responsibility and supplies the
          confirmed loss record. Only then can a TEMPER remedy case begin.
        </p>
      </>
    ),
    visual: <TourLiabilityDiagram />,
  },
  {
    title: "The question TEMPER actually adjudicates",
    body: (
      <>
        <p>After liability is established, the important question becomes:</p>
        <p className="mt-4 rounded-lg border border-violet/30 bg-violet/10 p-4 text-base font-bold leading-7 text-paper">
          Could the harmed party reasonably have used the mitigation the parties already agreed on
          before the loss became larger?
        </p>
        <p className="mt-4">
          Provider and claimant can submit evidence about what was operational, accessible, and
          practically usable at that time.
        </p>
      </>
    ),
    visual: <TourMitigationDiagram />,
  },
  {
    title: "GenLayer adjudicates the dispute",
    body: (
      <>
        <p>
          If the parties disagree about mitigation, GenLayer evaluates the agreement rule and the
          submitted evidence.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Outcome label="VALID MITIGATION" copy="Reasonably available." tone="mint" />
          <Outcome label="INVALID MITIGATION" copy="Not reasonably available." tone="coral" />
          <Outcome
            label="UNDETERMINED"
            copy="Availability could not be determined reliably."
            tone="neutral"
          />
        </div>
        <p className="mt-4 text-paper/45">
          TEMPER does not rely on one centralized operator to make this judgment.
        </p>
      </>
    ),
    visual: <TourEvidenceDiagram />,
  },
  {
    title: "From judgment to enforceable remedy",
    body: (
      <>
        <div className="grid gap-2 sm:grid-cols-3">
          <TourMetric label="Actual confirmed loss" value="10 GEN" />
          <TourMetric label="Agreement secures" value="8 GEN" />
          <TourMetric label="Loss when mitigation became available" value="5 GEN" />
        </div>
        <p className="mt-5">
          TEMPER applies the GenLayer verdict to the secured agreement and determines how much of
          the covered loss remains recoverable.
        </p>
      </>
    ),
    visual: <TourRemedyDiagram />,
  },
] as const;

function TourFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-lg border border-paper/12 bg-paper/[0.045] p-4">{children}</div>
  );
}

function TourAgreementDiagram() {
  return (
    <TourFrame>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-paper/45">Agreement terms</p>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-semibold">
        {[
          ["SERVICE", "covered"],
          ["MITIGATION", "agreed"],
          ["BOND", "secured"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-paper/12 bg-paper/[0.04] px-2 py-3">
            <p className="font-mono text-[10px] text-violet">{label}</p>
            <p className="mt-1 text-paper/70">{value}</p>
          </div>
        ))}
      </div>
    </TourFrame>
  );
}

function TourLiabilityDiagram() {
  return (
    <TourFrame>
      <div className="flex flex-col items-center gap-2 text-center text-xs font-semibold sm:flex-row sm:justify-between sm:gap-3">
        <DiagramNode label="SERVICE FAILURE" />
        <ArrowRight className="hidden h-4 w-4 text-violet sm:block" />
        <ArrowDown className="h-4 w-4 text-violet sm:hidden" />
        <DiagramNode label="LIABILITY ESTABLISHED UPSTREAM" accent />
        <ArrowRight className="hidden h-4 w-4 text-violet sm:block" />
        <ArrowDown className="h-4 w-4 text-violet sm:hidden" />
        <DiagramNode label="TEMPER CASE" />
      </div>
    </TourFrame>
  );
}

function TourMitigationDiagram() {
  return (
    <TourFrame>
      <div className="grid gap-2 text-center text-xs font-semibold">
        <DiagramNode label="ORIGINAL SERVICE FAILS" />
        <ArrowDown className="mx-auto h-4 w-4 text-violet" />
        <DiagramNode label="AGREED MITIGATION" accent />
        <ArrowDown className="mx-auto h-4 w-4 text-violet" />
        <DiagramNode label="WAS IT REASONABLY AVAILABLE?" />
        <ArrowDown className="mx-auto h-4 w-4 text-violet" />
        <DiagramNode label="LOSS CONTINUES" />
      </div>
    </TourFrame>
  );
}

function TourEvidenceDiagram() {
  return (
    <TourFrame>
      <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <div className="grid gap-2 text-xs font-semibold">
          <DiagramNode label="PROVIDER EVIDENCE" />
          <DiagramNode label="CLAIMANT EVIDENCE" />
        </div>
        <div className="hidden text-violet sm:block">→</div>
        <DiagramNode label="GENLAYER · VERDICT" accent />
      </div>
    </TourFrame>
  );
}

function TourRemedyDiagram() {
  return (
    <TourFrame>
      <div className="flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.1em]">
        <span className="text-paper/55">GenLayer verdict</span>
        <ArrowRight className="h-4 w-4 text-violet" />
        <span className="text-violet">TEMPER remedy</span>
      </div>
      <div className="mt-5 rounded-md border border-paper/15">
        <div className="flex items-end justify-between gap-3 px-3 pb-3 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-paper/55">
            Secured by TEMPER
          </p>
          <p className="text-lg font-extrabold text-paper">8 GEN</p>
        </div>
        <div className="flex h-3 overflow-hidden border-y border-paper/15">
          <span className="w-[62.5%] bg-coral" />
          <span className="flex-1 bg-mint" />
        </div>
        <div className="grid grid-cols-2 divide-x divide-paper/10 p-3 text-center">
          <TourMetric label="Recoverable" value="5 GEN" compact />
          <TourMetric label="Avoidable secured loss" value="3 GEN" compact />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-paper/10 bg-paper/[0.025] px-3 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-paper/45">
          Outside TEMPER coverage
        </p>
        <p className="font-bold text-paper/80">2 GEN</p>
      </div>
      <p className="mt-5 pb-3 text-lg font-extrabold text-paper">
        The breach is settled. The bill isn’t.
      </p>
    </TourFrame>
  );
}

function DiagramNode({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        accent
          ? "border-violet/45 bg-violet/15 text-paper"
          : "border-paper/12 bg-paper/[0.04] text-paper/65",
      )}
    >
      {label}
    </div>
  );
}

function Outcome({
  label,
  copy,
  tone,
}: {
  label: string;
  copy: string;
  tone: "mint" | "coral" | "neutral";
}) {
  return (
    <div className="rounded-md border border-paper/10 bg-paper/[0.04] p-3">
      <p
        className={cn(
          "text-[10px] font-bold tracking-[0.08em]",
          tone === "mint" ? "text-mint" : tone === "coral" ? "text-coral" : "text-paper/55",
        )}
      >
        {label}
      </p>
      <p className="mt-1 text-xs text-paper/60">{copy}</p>
    </div>
  );
}

function TourMetric({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className={cn(compact ? "px-2" : "rounded-md border border-paper/10 bg-paper/[0.04] p-3")}>
      <p className="text-[10px] uppercase tracking-[0.08em] text-paper/45">{label}</p>
      <p className={cn("mt-1 font-bold", compact ? "text-sm" : "text-lg")}>{value}</p>
    </div>
  );
}
