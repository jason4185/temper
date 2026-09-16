import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { isAddress } from "viem";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Database } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CheckRule, TestnetBadge } from "@/components/temper/ui";
import { TransactionRunner } from "@/components/temper/transaction";
import {
  agreementExists,
  buildCreateAgreement,
  clearAgreementReadCache,
  temperQueryKey,
} from "@/lib/temper/adapter";
import { shortAddress } from "@/lib/temper/format";
import { useWallet } from "@/lib/genlayer/wallet";
import type { ContractWrite } from "@/lib/temper/types";

export const Route = createFileRoute("/agreements/new")({
  head: () => ({
    meta: [
      { title: "Create Agreement · TEMPER" },
      {
        name: "description",
        content:
          "Create a bonded service agreement with a defined fallback obligation and secured coverage.",
      },
      { property: "og:title", content: "Create a TEMPER Agreement" },
      {
        property: "og:description",
        content: "Define the service promise and fallback obligation before something goes wrong.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CreateAgreement,
});

type Kind = "price" | "custom";

function CustomReview({
  address,
  other,
  service,
  mitigation,
  availability,
  bond,
  days,
  complete,
}: {
  address: string | undefined;
  other: string;
  service: string;
  mitigation: string;
  availability: string;
  bond: string;
  days: string;
  complete: boolean;
}) {
  return (
    <div className="space-y-7">
      {!complete && (
        <div className="rounded-md border border-violet/25 bg-violet-soft/50 p-4 text-sm leading-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">Incomplete</p>
          <p className="mt-1">
            Complete the missing agreement terms before creating this agreement.
          </p>
        </div>
      )}
      <section>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">Parties</p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Provider</p>
            <p className="mt-1 font-semibold">You</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {address ? shortAddress(address) : "Connect wallet"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Other party</p>
            <p className="mt-1 break-all font-mono text-sm font-semibold">{other || "Not set"}</p>
          </div>
        </div>
      </section>
      <section className="border-t border-border pt-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">Service</p>
        <p className="mt-3 text-lg font-bold">{service || "Not set"}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The covered service or obligation whose failure could create a covered loss.
        </p>
      </section>
      <section className="border-t border-border pt-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">
          Agreed mitigation
        </p>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Action if the service fails
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6">
          {mitigation || "Not set"}
        </p>
      </section>
      <section className="border-t border-border pt-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">
          Availability standard
        </p>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{availability || "Not set"}</p>
      </section>
      <div className="grid gap-7 border-t border-border pt-6 sm:grid-cols-2 sm:gap-5">
        <section>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">Coverage</p>
          <p className="mt-3 text-lg font-bold">{bond} GEN maximum secured amount</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Maximum amount TEMPER can settle under this agreement.
          </p>
        </section>
        <section>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">
            Agreement window
          </p>
          <p className="mt-3 text-lg font-bold">{days} days</p>
          <p className="mt-1 text-sm text-muted-foreground">
            New claims may be opened during this period.
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            A claim opened before expiry can continue afterward.
          </p>
        </section>
      </div>
      <div className="rounded-md border border-violet/30 bg-violet-soft p-4 text-sm leading-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">
          What TEMPER may later adjudicate
        </p>
        <p className="mt-2">
          If responsibility for a loss is established, GenLayer can determine whether the agreed
          mitigation was reasonably available. TEMPER uses that verdict to determine the secured
          recoverable amount.
        </p>
      </div>
    </div>
  );
}

function CustomAgreementDraft({
  other,
  service,
  mitigation,
  availability,
  bond,
  days,
}: {
  other: string;
  service: string;
  mitigation: string;
  availability: string;
  bond: string;
  days: string;
}) {
  const rows = [
    { label: "Other party", value: other, mono: true },
    { label: "Service", value: service },
    { label: "Mitigation", value: mitigation },
    { label: "Availability", value: availability },
    { label: "Coverage", value: bond ? `${bond} GEN` : "" },
    { label: "Window", value: days ? `${days} days` : "" },
  ];

  return (
    <aside className="h-fit rounded-lg bg-ink p-6 text-paper lg:sticky lg:top-28">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet">
        Custom agreement draft
      </p>
      <div className="mt-5 divide-y divide-paper/10">
        {rows.map(({ label, value, mono }) => (
          <div key={label} className="py-3 first:pt-0 last:pb-0">
            <p className="text-xs text-paper/45">{label}</p>
            <p
              className={`mt-1 text-sm font-semibold ${mono ? "truncate font-mono" : "line-clamp-2 break-words"} ${value ? "text-paper" : "text-paper/40"}`}
              title={value || "Not set"}
            >
              {value || "Not set"}
            </p>
          </div>
        ))}
      </div>
    </aside>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {help && <p className="text-xs leading-5 text-muted-foreground">{help}</p>}
    </div>
  );
}
const sources = ["Binance", "Chainlink", "Pyth"];

function isPositiveWholeNumber(value: string) {
  const normalized = value.trim();
  return /^\d+$/.test(normalized) && normalized !== "0";
}

function CreateAgreement() {
  const [kind, setKind] = useState<Kind>();
  const [step, setStep] = useState(1);
  const [other, setOther] = useState("");
  const [main, setMain] = useState("Binance");
  const [backup, setBackup] = useState("Pyth");
  const [asset, setAsset] = useState("BTC/USD");
  const [bond, setBond] = useState("8");
  const [days, setDays] = useState("30");
  const [customService, setCustomService] = useState("");
  const [customMitigation, setCustomMitigation] = useState("");
  const [customAvailability, setCustomAvailability] = useState("");
  const [write, setWrite] = useState<ContractWrite>();
  const [preparingAgreement, setPreparingAgreement] = useState(false);
  const [error, setError] = useState<string>();
  const preparingAgreementRef = useRef(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const wallet = useWallet();
  const isCustom = kind === "custom";
  const createReal = async (input: {
    title: string;
    mainSource: string;
    backupSource: string;
    asset: string;
  }) => {
    if (preparingAgreementRef.current) return;
    preparingAgreementRef.current = true;
    setPreparingAgreement(true);
    setError(undefined);
    try {
      if (wallet.status === "wrong-network") return void wallet.switchToStudioNext();
      if (
        wallet.status !== "connected" ||
        !wallet.address ||
        !wallet.kit ||
        !wallet.connectedClient
      ) {
        setError("Connect a wallet on Studio Dev before creating an agreement.");
        return;
      }
      if (!isAddress(other)) {
        setError("Enter a valid other-party wallet address.");
        return;
      }
      let agreementId = "";
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const candidate = `TEMPER-${Date.now()}-${crypto.randomUUID()}`;
        if (!(await agreementExists(candidate))) {
          agreementId = candidate;
          break;
        }
      }
      if (!agreementId) throw new Error("Could not generate a unique agreement ID.");
      setWrite(
        buildCreateAgreement(
          {
            kind: kind === "price" ? "price-feed" : "custom",
            otherParty: other,
            service:
              kind === "custom"
                ? customService
                : `${input.asset} price feed using ${input.mainSource}`,
            fallback: kind === "custom" ? customMitigation : input.backupSource,
            availabilityRule:
              kind === "custom"
                ? customAvailability
                : `Switch to ${input.backupSource} if it is working and accessible to the other party.`,
            bond,
            lengthDays: days,
            mainSource: input.mainSource,
            backupSource: input.backupSource,
            asset: input.asset,
          },
          agreementId,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      preparingAgreementRef.current = false;
      setPreparingAgreement(false);
    }
  };
  if (!kind)
    return (
      <main className="bg-paper px-5 pb-12 pt-16 text-ink lg:px-10 lg:pb-14 lg:pt-20">
        <div className="mx-auto max-w-6xl">
          <TestnetBadge label="STUDIO DEV" />
          <h1 className="mt-4 max-w-4xl text-4xl font-extrabold sm:text-6xl">
            Create a bonded service agreement
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Define the service, the agreed fallback obligation, and the coverage available if the
            service fails.
          </p>
          <div className="mt-9 grid gap-5 lg:grid-cols-2">
            <button
              className="group flex min-h-[31rem] flex-col rounded-2xl border border-violet/35 bg-background p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-violet hover:shadow-[var(--shadow-panel)] sm:p-6"
              onClick={() => setKind("price")}
            >
              <div
                className="relative min-h-64 overflow-hidden rounded-xl border border-violet/15 bg-paper-deep p-4 sm:p-5"
                role="img"
                aria-label="Binance primary price feed moves to Pyth backup and a secured TEMPER bond."
              >
                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox="0 0 520 260"
                  fill="none"
                  aria-hidden="true"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <marker
                      id="price-agreement-arrow"
                      viewBox="0 0 8 8"
                      refX="7"
                      refY="4"
                      markerWidth="5"
                      markerHeight="5"
                      orient="auto"
                    >
                      <path d="M0 0L8 4L0 8" stroke="rgb(28 26 35 / 42%)" strokeWidth="1.2" />
                    </marker>
                  </defs>
                  <path
                    d="M150 66H265V137 M150 164H265V137 M350 137H420V195"
                    stroke="rgb(28 26 35 / 38%)"
                    strokeWidth="1.5"
                    markerEnd="url(#price-agreement-arrow)"
                  />
                  <circle cx="150" cy="66" r="4" fill="rgb(28 26 35 / 55%)" />
                  <circle cx="150" cy="164" r="4" fill="rgb(139 92 246 / 80%)" />
                  <circle cx="350" cy="137" r="4" fill="rgb(139 92 246 / 80%)" />
                </svg>
                <div className="absolute left-[5%] top-[12%] w-[28%] rounded-lg border border-ink/15 bg-paper/80 p-3">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Primary feed
                  </p>
                  <p className="mt-1 text-lg font-extrabold">Binance</p>
                </div>
                <div className="absolute left-[5%] top-[50%] w-[28%] rounded-lg border border-violet/30 bg-paper/80 p-3">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-violet">
                    Backup
                  </p>
                  <p className="mt-1 text-lg font-extrabold">Pyth</p>
                </div>
                <span className="absolute left-[43%] top-[43%] font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  Feed failure
                </span>
                <div className="absolute bottom-[9%] right-[5%] w-[34%] rounded-xl border border-violet/45 bg-violet-soft p-3 text-center">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-violet">
                    TEMPER bond
                  </p>
                  <p className="mt-1 text-2xl font-extrabold">8 GEN</p>
                </div>
              </div>
              <div className="mt-6 flex flex-1 flex-col">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet">
                  Guided setup
                </p>
                <h2 className="mt-2 text-2xl font-bold">Price Feed Agreement</h2>
                <p className="mt-3 max-w-md leading-7 text-muted-foreground">
                  Define a primary service, an agreed fallback obligation, and secured coverage.
                </p>
              </div>
              <span className="mt-7 flex items-center gap-2 text-sm font-bold text-violet">
                Start guided setup <ArrowRight className="h-4 w-4" />
              </span>
            </button>
            <button
              className="group flex min-h-[31rem] flex-col rounded-2xl border border-border bg-background p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-violet hover:shadow-[var(--shadow-panel)] sm:p-6"
              onClick={() => setKind("custom")}
            >
              <div
                className="relative min-h-64 overflow-hidden rounded-xl border border-border bg-paper-deep p-4 sm:p-5"
                role="img"
                aria-label="Service, mitigation, bond, and duration terms combine into a TEMPER agreement."
              >
                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox="0 0 520 260"
                  fill="none"
                  aria-hidden="true"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <marker
                      id="custom-agreement-arrow"
                      viewBox="0 0 8 8"
                      refX="7"
                      refY="4"
                      markerWidth="5"
                      markerHeight="5"
                      orient="auto"
                    >
                      <path d="M0 0L8 4L0 8" stroke="rgb(28 26 35 / 42%)" strokeWidth="1.2" />
                    </marker>
                  </defs>
                  <path
                    d="M150 66H185V130 M150 164H185V130 M370 66H335V130 M370 164H335V130"
                    stroke="rgb(28 26 35 / 38%)"
                    strokeWidth="1.5"
                    markerEnd="url(#custom-agreement-arrow)"
                  />
                  <circle cx="150" cy="66" r="4" fill="rgb(28 26 35 / 55%)" />
                  <circle cx="150" cy="164" r="4" fill="rgb(28 26 35 / 55%)" />
                  <circle cx="370" cy="66" r="4" fill="rgb(28 26 35 / 55%)" />
                  <circle cx="370" cy="164" r="4" fill="rgb(28 26 35 / 55%)" />
                </svg>
                <div className="absolute left-[5%] top-[12%] w-[28%] rounded-lg border border-ink/15 bg-paper/80 p-3">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Service
                  </p>
                  <p className="mt-1 text-sm font-extrabold">Your terms</p>
                </div>
                <div className="absolute left-[5%] top-[50%] w-[28%] rounded-lg border border-ink/15 bg-paper/80 p-3">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Mitigation
                  </p>
                  <p className="mt-1 text-sm font-extrabold">Your rule</p>
                </div>
                <div className="absolute right-[5%] top-[12%] w-[28%] rounded-lg border border-ink/15 bg-paper/80 p-3 text-right">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Bond
                  </p>
                  <p className="mt-1 text-sm font-extrabold">Secured amount</p>
                </div>
                <div className="absolute right-[5%] top-[50%] w-[28%] rounded-lg border border-ink/15 bg-paper/80 p-3 text-right">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Duration
                  </p>
                  <p className="mt-1 text-sm font-extrabold">Your window</p>
                </div>
                <div className="absolute left-[36%] top-[37%] w-[28%] rounded-xl border border-violet/45 bg-violet-soft p-4 text-center">
                  <p className="font-mono text-[10px] font-extrabold uppercase tracking-[0.14em] text-violet">
                    TEMPER
                  </p>
                  <p className="mt-1 text-xs font-semibold text-violet">Agreement</p>
                </div>
              </div>
              <div className="mt-6 flex flex-1 flex-col">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  Flexible
                </p>
                <h2 className="mt-2 text-2xl font-bold">Custom Service Agreement</h2>
                <p className="mt-3 max-w-md leading-7 text-muted-foreground">
                  Define the service, fallback obligation, secured coverage, and agreement duration
                  yourself.
                </p>
              </div>
              <span className="mt-7 flex items-center gap-2 text-sm font-bold text-violet">
                Define custom terms <ArrowRight className="h-4 w-4" />
              </span>
            </button>
          </div>
        </div>
      </main>
    );
  const customReviewReady =
    isAddress(other) &&
    Boolean(customService.trim()) &&
    Boolean(customMitigation.trim()) &&
    Boolean(customAvailability.trim()) &&
    isPositiveWholeNumber(bond) &&
    isPositiveWholeNumber(days);
  const advanceStep = () => {
    setError(undefined);
    if (isCustom) {
      if (step === 1 && !isAddress(other)) {
        setError("Enter a valid other-party wallet address.");
        return;
      }
      if (step === 2 && !customService.trim()) {
        setError("Describe the covered service before continuing.");
        return;
      }
      if (step === 3 && !customMitigation.trim()) {
        setError("Describe the agreed mitigation action before continuing.");
        return;
      }
      if (step === 3 && !customAvailability.trim()) {
        setError("Describe the availability standard before continuing.");
        return;
      }
      if (step === 4 && (!isPositiveWholeNumber(bond) || !isPositiveWholeNumber(days))) {
        setError("Enter a positive whole GEN amount for the bond and duration.");
        return;
      }
    }
    setStep(step + 1);
  };
  const stepTitles = isCustom
    ? [
        "Who provides the service and who receives it?",
        "What is being promised?",
        "What fallback must be used if the service fails?",
        "How much secured exposure backs the agreement?",
        "Review the service promise before creating it.",
      ]
    : [
        "Who provides the service and who receives it?",
        "What is being promised?",
        "What fallback must be used if the service fails?",
        "How much secured exposure backs the agreement?",
        "Review the service promise before creating it.",
      ];
  const stepLabels = ["Parties", "Service", "Mitigation", "Coverage", "Review"];
  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-paper px-5 py-10 text-ink lg:px-10">
      <div className="mx-auto max-w-[1200px]">
        <div className="flex items-center justify-between">
          <button
            className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"
            onClick={() => {
              setError(undefined);
              if (step === 1) setKind(undefined);
              else setStep(step - 1);
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            {step === 1 && isCustom ? "Change agreement type" : "Back"}
          </button>
          <TestnetBadge label="STUDIO DEV" />
        </div>
        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
          <section>
            <div className="grid grid-cols-5 gap-1.5">
              {stepLabels.map((label, i) => (
                <div key={label} className="min-w-0">
                  <span
                    className={`block h-1.5 rounded-full ${i + 1 <= step ? "bg-violet" : "bg-border"}`}
                  />
                  <span
                    className={`mt-2 block truncate text-[9px] font-semibold uppercase tracking-[0.04em] ${i + 1 === step ? "text-violet" : "text-muted-foreground"}`}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-8 text-xs font-bold uppercase text-violet">Step {step} of 5</p>
            <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">{stepTitles[step - 1]}</h1>
            <div className="mt-8 rounded-lg border border-border bg-background p-6 shadow-sm sm:p-8">
              {step === 1 && (
                <div className="space-y-5">
                  <div className="rounded-lg border border-violet/25 bg-violet-soft/50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">
                        Provider
                      </p>
                      <span className="rounded-full bg-paper/70 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                        Connected
                      </span>
                    </div>
                    <p className="mt-3 text-lg font-bold">You</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {wallet.address ? shortAddress(wallet.address) : "Connect wallet"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 px-2 text-xs font-semibold text-muted-foreground">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-muted text-base text-violet">
                      ↓
                    </span>
                    <span>Provides the service to</span>
                  </div>
                  <div className="rounded-lg border border-border bg-paper p-4">
                    <Field
                      label="OTHER PARTY"
                      help={
                        isCustom
                          ? "The wallet or agent receiving the covered service."
                          : "The wallet or agent receiving the price-feed service."
                      }
                    >
                      <Input
                        value={other}
                        onChange={(e) => setOther(e.target.value)}
                        placeholder="Wallet or agent address"
                      />
                    </Field>
                  </div>
                </div>
              )}
              {step === 2 &&
                (isCustom ? (
                  <div className="grid gap-5">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">
                        Covered service
                      </p>
                      <Field
                        label="What service or obligation are you providing?"
                        help="Describe the service whose failure could create a covered loss."
                      >
                        <Input
                          value={customService}
                          onChange={(event) => setCustomService(event.target.value)}
                          placeholder="API service, data feed, marketplace service, or protocol operation"
                        />
                      </Field>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-6">
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end sm:gap-4">
                      <Field label="Main source">
                        <Select value={main} onValueChange={setMain}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {sources.map((s) => (
                              <SelectItem key={s} value={s} disabled={s === backup}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <span className="flex h-8 items-center justify-center text-sm font-semibold text-violet sm:hidden">
                        ↓
                      </span>
                      <span className="hidden h-10 items-center justify-center px-1 text-lg text-violet sm:flex">
                        →
                      </span>
                      <Field label="Backup source / mitigation">
                        <Select value={backup} onValueChange={setBackup}>
                          <SelectTrigger className={main === backup ? "border-destructive" : ""}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {sources.map((s) => (
                              <SelectItem key={s} value={s} disabled={s === main}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <div className="grid gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                        Applies to
                      </p>
                      <Field label="Asset">
                        <Select value={asset} onValueChange={setAsset}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["BTC/USD", "ETH/USD", "SOL/USD", "Custom asset"].map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <div className="rounded-md border border-violet/15 bg-violet-soft p-4 text-sm">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">
                        Agreed mitigation
                      </p>
                      <p className="mt-2 leading-6">
                        If the main source fails, the backup source is the mitigation both parties
                        agree may be used.
                      </p>
                    </div>
                  </div>
                ))}
              {step === 3 &&
                (isCustom ? (
                  <div className="space-y-6">
                    <section>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">
                        Agreed mitigation action
                      </p>
                      <Field
                        label="What should the harmed party do if the original service fails?"
                        help="Be specific about the action both parties agree may limit further loss."
                      >
                        <Textarea
                          className="min-h-28"
                          value={customMitigation}
                          onChange={(event) => setCustomMitigation(event.target.value)}
                          placeholder="Describe the agreed alternative action."
                        />
                      </Field>
                    </section>
                    <section className="border-t border-border pt-6">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">
                        Availability standard
                      </p>
                      <Field
                        label="When should that mitigation count as reasonably available?"
                        help="A mitigation should be practically usable, not merely theoretically available."
                      >
                        <Textarea
                          className="min-h-28"
                          value={customAvailability}
                          onChange={(event) => setCustomAvailability(event.target.value)}
                          placeholder="Describe the operational, access, and technical conditions for use."
                        />
                      </Field>
                      <p className="mt-3 text-xs leading-5 text-muted-foreground">
                        Consider whether it is operational, actually accessible, technically usable,
                        and free of permission or integration barriers.
                      </p>
                    </section>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">
                      Agreement mitigation rule
                    </p>
                    <Textarea
                      className="mt-3 min-h-28 text-base leading-7"
                      defaultValue={`Switch to ${backup} if it is working and actually accessible to the other party.`}
                    />
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      This is the rule GenLayer will later evaluate if mitigation is disputed.
                    </p>
                    <p className="mt-7 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      Availability means
                    </p>
                    <ul className="mt-4 space-y-3">
                      <CheckRule>Backup source is operational</CheckRule>
                      <CheckRule>The other party can actually access and use it</CheckRule>
                      <CheckRule>
                        No technical, permission, or integration barrier prevents use
                      </CheckRule>
                    </ul>
                    <p className="mt-6 text-sm leading-6 text-muted-foreground">
                      A backup being online does not automatically mean it was reasonably usable.
                    </p>
                  </div>
                ))}
              {step === 4 && (
                <div>
                  <div className="grid gap-7 sm:grid-cols-2 sm:gap-5">
                    <div className="space-y-3">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">
                        Coverage
                      </p>
                      <Field
                        label="Bond amount"
                        help="Maximum amount TEMPER can settle under this agreement."
                      >
                        <div className="relative">
                          <Input
                            type="number"
                            value={bond}
                            onChange={(e) => setBond(e.target.value)}
                            className="pr-14"
                          />
                          <span className="absolute right-3 top-2 text-sm font-bold">GEN</span>
                        </div>
                      </Field>
                    </div>
                    <div className="space-y-3">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">
                        Agreement window
                      </p>
                      <Field label="Length" help="New claims can be opened during this period.">
                        <div className="relative">
                          <Input
                            type="number"
                            value={days}
                            onChange={(e) => setDays(e.target.value)}
                            className="pr-14"
                          />
                          <span className="absolute right-3 top-2 text-sm font-bold">days</span>
                        </div>
                      </Field>
                      <p className="text-xs leading-5 text-muted-foreground">
                        A claim opened before expiry can continue afterward.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {step === 5 && isCustom && (
                <CustomReview
                  address={wallet.address}
                  other={other}
                  service={customService}
                  mitigation={customMitigation}
                  availability={customAvailability}
                  bond={bond}
                  days={days}
                  complete={customReviewReady}
                />
              )}
              {step === 5 && !isCustom && (
                <div className="space-y-7">
                  <section>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">
                      Parties
                    </p>
                    <div className="mt-4 grid gap-5 sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Provider</p>
                        <p className="mt-1 font-semibold">You</p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {wallet.address ? shortAddress(wallet.address) : "Connect wallet"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Other party</p>
                        <p className="mt-1 break-all font-mono text-sm font-semibold">
                          {other || "Not set"}
                        </p>
                      </div>
                    </div>
                  </section>
                  <section className="border-t border-border pt-6">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">
                      Service
                    </p>
                    <p className="mt-3 text-lg font-bold">{asset} price feed</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Main source</p>
                        <p className="mt-1 font-semibold">{main}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Asset</p>
                        <p className="mt-1 font-semibold">{asset}</p>
                      </div>
                    </div>
                  </section>
                  <section className="border-t border-border pt-6">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">
                      Agreed mitigation
                    </p>
                    <div className="mt-4 rounded-md border border-violet/25 bg-violet-soft p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet">
                        Backup · {backup}
                      </p>
                      <p className="mt-2 text-sm font-semibold leading-6">
                        Mitigation rule: Switch to {backup} if it is working and actually accessible
                        to the other party.
                      </p>
                    </div>
                  </section>
                  <div className="grid gap-7 border-t border-border pt-6 sm:grid-cols-2 sm:gap-5">
                    <section>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">
                        Coverage
                      </p>
                      <p className="mt-3 text-lg font-bold">{bond} GEN</p>
                      <p className="mt-1 text-sm text-muted-foreground">Maximum secured amount</p>
                    </section>
                    <section>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">
                        Agreement window
                      </p>
                      <p className="mt-3 text-lg font-bold">{days} days</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        New claims may be opened during this period.
                      </p>
                    </section>
                  </div>
                  <div className="rounded-md border border-violet/30 bg-violet-soft p-4 text-sm leading-6">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">
                      What TEMPER may later adjudicate
                    </p>
                    <p className="mt-2">
                      If responsibility for a loss is established, GenLayer can determine whether
                      the agreed mitigation was reasonably available. TEMPER uses that verdict to
                      determine the secured recoverable amount.
                    </p>
                  </div>
                  <Collapsible className="mt-5">
                    <CollapsibleTrigger className="flex w-full items-center justify-between border-b py-3 text-sm font-semibold">
                      Advanced · Agreement Terms <ChevronDown className="h-4 w-4" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="grid gap-4 pt-5">
                      <Field label="Service description">
                        <Textarea defaultValue={`${asset} price feed service using ${main}.`} />
                      </Field>
                      <Field label="Mitigation rule">
                        <Textarea
                          defaultValue={`Switch to ${backup} if it is working and accessible.`}
                        />
                      </Field>
                      <Field label="Allowed mitigation conditions">
                        <Input defaultValue="Working, accessible, credentials available" />
                      </Field>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}
              <div className="mt-8 flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-end sm:justify-between">
                {step === 5 && (
                  <p className="max-w-sm text-xs leading-5 text-muted-foreground">
                    No bond is transferred in this step. The bond is funded after the other party
                    accepts.
                  </p>
                )}
                <Button
                  variant="hero"
                  size="lg"
                  className="sm:ml-auto"
                  onClick={() =>
                    step < 5
                      ? advanceStep()
                      : createReal(
                          isCustom
                            ? {
                                title: customService || "Custom Agreement",
                                mainSource: customService || "Primary service",
                                backupSource: customMitigation || "Agreed mitigation",
                                asset: "Service",
                              }
                            : {
                                title: `${asset} Price Feed`,
                                mainSource: main,
                                backupSource: backup,
                                asset,
                              },
                        )
                  }
                  disabled={
                    Boolean(write) ||
                    preparingAgreement ||
                    (step === 5 && isCustom && !customReviewReady)
                  }
                >
                  {step < 5 ? (
                    <>
                      Continue <ArrowRight />
                    </>
                  ) : (
                    <>
                      Create Agreement <Database />
                    </>
                  )}
                </Button>
              </div>
              {write && wallet.kit && wallet.connectedClient && (
                <TransactionRunner
                  intro={
                    <p className="text-sm font-semibold text-paper">
                      Sign the agreement transaction
                    </p>
                  }
                  kit={wallet.kit}
                  client={wallet.connectedClient}
                  write={write}
                  onError={(reason) => setError(reason.message)}
                  onDismiss={() => {
                    setWrite(undefined);
                  }}
                  onSuccess={async (txId) => {
                    const agreementId = write.args[4] as string;
                    clearAgreementReadCache(agreementId);
                    await queryClient.invalidateQueries({
                      queryKey: temperQueryKey("agreement", agreementId),
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
                    await navigate({
                      to: "/agreements/$id",
                      params: { id: agreementId },
                    });
                    toast.success("Agreement created");
                    void txId;
                  }}
                  label="Create agreement"
                />
              )}
              {error && (
                <p className="mt-4 text-sm text-coral" role="alert">
                  {error}
                </p>
              )}
            </div>
          </section>
          {isCustom && step < 5 ? (
            <CustomAgreementDraft
              other={other}
              service={customService}
              mitigation={customMitigation}
              availability={customAvailability}
              bond={bond}
              days={days}
            />
          ) : (
            <aside className="h-fit rounded-lg bg-ink p-6 text-paper lg:sticky lg:top-28">
              <p className="text-xs font-bold uppercase text-violet">What happens next</p>
              <h2 className="mt-4 text-xl font-bold">Before this agreement is active</h2>
              <div className="mt-6 divide-y divide-paper/10">
                {[
                  ["01", "Create agreement", "You sign the agreement terms."],
                  [
                    "02",
                    "Other party accepts",
                    "The agreement is not active until the other party accepts.",
                  ],
                  [
                    "03",
                    "Fund the bond",
                    "After acceptance, the provider secures the agreed bond.",
                  ],
                  [
                    "04",
                    "Agreement becomes active",
                    "A valid upstream liability receipt can then open a TEMPER case.",
                  ],
                ].map(([number, title, copy]) => (
                  <div key={number} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                    <span className="font-mono text-xs font-bold text-violet">{number}</span>
                    <div>
                      <p className="text-sm font-bold">{title}</p>
                      <p className="mt-1 text-xs leading-5 text-paper/55">{copy}</p>
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          )}
        </div>
      </div>
    </main>
  );
}
