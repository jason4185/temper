# TEMPER

**The breach is settled. The bill isn’t.**

TEMPER is a post-liability remedy protocol for bonded onchain service agreements. Once liability has already been established, TEMPER determines how much of the continuing loss should still remain recoverable.

| | |
| --- | --- |
| Live app | [temper-teal.vercel.app](https://temper-teal.vercel.app/) |
| Built on | GenLayer |
| Track | Onchain Justice |

## The problem

A service provider fails. The failure creates a loss. Liability is established. But the loss keeps growing.

At some point, an agreed fallback or alternative may become available. If the harmed party could reasonably have switched but did not, should the liable provider continue paying for every loss that happens afterward?

That is the problem TEMPER solves.

## Where the idea came from

TEMPER is inspired by a principle used in traditional legal systems: the duty to mitigate damages, also called the avoidable consequences principle.

Establishing liability is only one part of resolving a loss. Traditional courts can also consider whether the harmed party reasonably acted to prevent the loss from continuing to grow. This inspired a practical question:

> What would that remedy layer look like as an onchain primitive?

Onchain services and agents can operate—and accumulate losses—at machine speed. TEMPER brings this post-liability remedy question into an autonomous settlement system. In conceptual terms, it is a machine-native duty to mitigate: post-liability avoidable-loss adjudication tied to a bonded remedy.

## What TEMPER actually decides

TEMPER does **not** retry the original breach or liability question.

It does not decide:

- Who breached?
- Who is liable?

Those facts have already been established upstream.

TEMPER does decide:

- Was the agreed fallback reasonably available at the provider’s claimed mitigation point?
- How much of the continuing secured loss should still remain recoverable?

If mitigation was reasonably available, losses after that point may become avoidable. If it was not reasonably available, the secured loss remains recoverable.

## How the product works

```
Bonded Agreement
        →
Service Failure
        →
Liability Established
        →
TEMPER Case
        →
Provider Mitigation Claim
        →
Claimant Response
        →
GenLayer Judgment
        →
Remedy
        →
Settlement
```

The product flow is:

1. A provider creates a bonded service agreement.
2. The claimant accepts the agreement.
3. The provider funds the bond.
4. An upstream system establishes provider responsibility and the loss.
5. The claimant opens a TEMPER case.
6. The provider identifies when the agreed fallback became reasonably available and submits evidence.
7. The claimant responds with counter-evidence.
8. GenLayer evaluates the contextual mitigation question.
9. TEMPER applies the judgment to the secured loss.
10. The claimant receives the recoverable remedy, the provider can withdraw the remainder, and the agreement closes.

## Live proof: a completed TEMPER case

The fastest way to understand TEMPER is to inspect this completed case in the live application:

`TEMPER-1789515104833-5b8c92a0-16d8-4107-93fc-02e7dd625f28`

| Field | Verified state |
| --- | --- |
| Status | `CLOSED` |
| GenLayer verdict | `VALID_MITIGATION` |
| Bond | `10 GEN` |
| Confirmed loss | `8 GEN` |
| Secured loss | `8 GEN` |
| Loss at mitigation | `4 GEN` |
| Recoverable | `4 GEN` |
| Avoidable secured loss | `4 GEN` |
| Provider remainder | `6 GEN` |
| Remaining bond | `0 GEN` |
| Settled | `true` |
| Judgment finalized | `true` |

In plain English:

- The agreement secured `10 GEN`.
- The confirmed loss was `8 GEN`, so the secured loss was `8 GEN`.
- GenLayer determined that the agreed fallback was reasonably available once the loss had reached `4 GEN`.
- `4 GEN` remained recoverable.
- `4 GEN` of the secured loss became avoidable.
- The claimant received the recoverable remedy.
- The provider recovered the remaining `6 GEN`.
- The agreement reached `CLOSED` with `0 GEN` remaining.

## How to try TEMPER

### Fast reviewer path

1. Open the [live TEMPER application](https://temper-teal.vercel.app/).
2. Choose **Explore Cases**.
3. Open the completed `CLOSED` case listed above.
4. Inspect the GenLayer verdict.
5. Inspect the provider evidence and claimant response.
6. Inspect recoverable versus avoidable loss.
7. Inspect **Final Settlement**.
8. Open **Technical details** or the explorer verification view.

The existing `CLOSED` case is the fastest proof path. Reviewers do not need to create a new agreement to understand the product.

### Full product flow

```
Create Agreement
        →
Claimant Accepts
        →
Provider Funds Bond
        →
Upstream Liability
        →
Open TEMPER Case
        →
Provider Mitigation Claim
        →
Claimant Response
        →
GenLayer Judgment
        →
Remedy Settlement
        →
Provider Withdrawal
        →
CLOSED
```

## What is real and what is simulated?

### Simulated for the Studio demonstration

`DemoLiabilitySource` simulates the upstream liability system. It supplies demonstration facts such as:

- provider responsibility
- confirmed loss
- loss history

This is necessary because TEMPER starts **after** liability has already been established. `DemoLiabilitySource` is not production liability infrastructure and does not perform the GenLayer judgment.

### Real TEMPER protocol flow

The following are the actual TEMPER and GenLayer flow:

- bonded agreement state
- liability receipt verification
- TEMPER case lifecycle
- evidence URL and hash recording
- GenLayer judgment
- remedy calculation
- claimant settlement
- provider remainder withdrawal
- `CLOSED` terminal state

TEMPER’s settlement is not mocked: the judgment changes the recoverable amount, the remainder, and the terminal settlement state.

# How TEMPER is built

## Why GenLayer?

A deterministic contract can calculate the remedy once it has the right inputs:

```
S = min(confirmed loss, bond)
recoverable = min(loss at mitigation, S)
```

But that calculation only works after the system knows whether the claimed mitigation point is valid.

The difficult question is contextual:

> Was the agreed fallback genuinely reasonably available at that point?

The answer can depend on the agreement terms, timing, whether the fallback was operational, accessibility, practical integration barriers, provider evidence, claimant response, and external evidence.

**GenLayer handles the contextual judgment. TEMPER turns that judgment into deterministic settlement.**

That is why GenLayer matters here. It is not a decorative oracle call; its judgment directly changes the remedy that the contract settles.

## Judgment → economic consequence

First, TEMPER caps the loss by the bond:

```
S = min(confirmed loss, bond)
```

For `VALID_MITIGATION`, the recoverable amount is limited to the loss at the valid mitigation point:

```
recoverable = min(loss at mitigation, S)
avoidable = S - recoverable
```

For `INVALID_MITIGATION`:

```
recoverable = S
avoidable = 0
```

For `UNDETERMINED`:

```
recoverable = S
avoidable = 0
```

In plain English, a valid GenLayer judgment can reduce the claimant’s recoverable share of the secured loss. An invalid or undetermined judgment leaves the secured loss recoverable. The verdict therefore has a direct economic consequence.

## Evidence model

Evidence follows a bounded, verifiable pipeline:

```
HTTPS Evidence Source
        →
Validation
        →
DNS/IP Safety Checks
        →
Bounded Fetch
        →
SHA-256
        →
URL + Hash Recorded Onchain
        →
GenLayer Evaluation
```

TEMPER records the source URL and its SHA-256 hash onchain. The evidence body remains at the HTTPS source; the onchain record provides the reference and integrity check used by the adjudication flow.

The evidence preparation layer includes protections against unsafe, private, and local destinations, along with bounded fetch behavior.

## Architecture

```
Frontend
   |
   | Transaction Kit
   v
TEMPER Intelligent Contract
   |
   | verifies upstream liability
   | records evidence references and hashes
   v
GenLayer Validators
   |
   | contextual mitigation judgment
   v
VALID / INVALID / UNDETERMINED
   |
   v
Deterministic Remedy + Settlement

DemoLiabilitySource
   |
   | simulated upstream liability input
   v
TEMPER liability receipt verification
```

`DemoLiabilitySource` supplies the demonstration input before the TEMPER case. It is separate from the GenLayer judgment itself.

## Contracts and deployment

Current verified Studio values:

| Item | Value |
| --- | --- |
| Network | GenLayer Studio preview / Studio Next environment |
| Chain ID | `61997` |
| Canonical RPC | `https://studio-dev.genlayer.com/api` |
| Explorer | [explorer-studio-dev.genlayer.com](https://explorer-studio-dev.genlayer.com/) |
| TEMPER | `0x1f156EB776698C283774Bfb7d2B9608257d6c47d` |
| DemoLiabilitySource | `0x357c1a93EaEA2B4FcC1Bc706EF478A0Bb9A794a9` |
| Live application | [temper-teal.vercel.app](https://temper-teal.vercel.app/) |

## Repository structure

```
temper/
├── contracts/
│   ├── temper.py    Production TEMPER Intelligent Contract
│   ├── temper_demo_liability_source.py  Studio demonstration liability source
│   └── README.md    Contract-specific notes
├── tests/           Direct Mode and simulator coverage
├── frontend/       TanStack/Vite application and transaction adapter
└── README.md        Product and developer overview
```

## Development

The frontend uses the committed `frontend/bun.lock` file. From the repository root:

```
cd frontend
bun install
npm run dev
npm run lint
npx tsc --noEmit
npm run build
bun scripts/test-dashboard-accounting.ts
bun scripts/test-evidence-preparation.ts
bun scripts/test-payout-fees.ts
```

The contract tests require Python 3.12+ and the current official GenLayer Direct Mode tooling:

```
python -m pytest -q tests -p no:cacheprovider
```

From the repository root, semantic validation, schema extraction, and typechecking use the GenLayer CLI:

```
genvm-lint validate contracts/temper.py
genvm-lint schema contracts/temper.py
genvm-lint typecheck contracts/temper.py

genvm-lint validate contracts/temper_demo_liability_source.py
genvm-lint schema contracts/temper_demo_liability_source.py
genvm-lint typecheck contracts/temper_demo_liability_source.py
```

These commands assume the official GenLayer tooling is installed separately; the repository does not replace that toolchain’s environment management.

## Validation status

### Frontend

- Lint: PASS — 0 errors
- TypeScript: PASS
- Production build: PASS
- Dashboard accounting test: PASS
- Evidence preparation test: PASS
- Payout fee test: PASS

### Contracts

- Test suite: 20/20 PASS
- TEMPER validate: PASS
- TEMPER schema: PASS
- TEMPER typecheck: PASS
- DemoLiabilitySource validate: PASS
- DemoLiabilitySource schema: PASS

## Known tooling notes

- The current GenVM linter reports an `E014` mismatch with TEMPER’s current `@allow` storage decorator.
- DemoLiabilitySource has Pyright diagnostics around the current SDK `u256` `Annotated` typing.
- Frontend lint has existing warnings but 0 errors.

Runtime tests, schema extraction, semantic validation, and the relevant production checks pass. These upstream/tooling diagnostics are not being changed in this README task.

## Demo

Demo video: Coming soon
