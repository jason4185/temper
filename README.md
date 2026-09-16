# TEMPER

TEMPER settles what remains payable after liability is established, using GenLayer to adjudicate mitigation and enforce the remedy.

## What is TEMPER?

TEMPER is a post-liability remedy protocol for bonded onchain service agreements. The original breach and liability question is resolved upstream. TEMPER answers the next question: how much of the continuing loss should still remain recoverable?

## Why GenLayer?

The key question is contextual:

> Was the agreed fallback reasonably available at the provider's claimed mitigation point?

That cannot be answered reliably by deterministic contract rules alone. It depends on the agreement terms, timing, operational evidence, accessibility, claimant response, and external evidence. GenLayer adjudicates that contextual question; TEMPER applies the result to the secured remedy.

## How it works

1. A provider creates a bonded service agreement.
2. The claimant accepts it.
3. The provider funds the bond.
4. An upstream liability source confirms provider responsibility and loss.
5. The claimant opens a TEMPER case.
6. The provider identifies when the agreed fallback became reasonably available.
7. The claimant responds with relevant evidence.
8. GenLayer judges mitigation availability.
9. TEMPER calculates recoverable versus avoidable secured loss.
10. The remedy is settled.
11. The provider withdraws the remaining bond.
12. The case closes.

## Settlement logic

Let `S = min(confirmed loss, bond)`.

For `VALID_MITIGATION`:

```text
recoverable = min(loss at mitigation, S)
avoidable = S - recoverable
```

For `INVALID_MITIGATION` or `UNDETERMINED`:

```text
recoverable = S
avoidable = 0
```

## Live proof

The repository is connected to an existing deployed proof case:

`TEMPER-1789515104833-5b8c92a0-16d8-4107-93fc-02e7dd625f28`

Its read-only verified result is:

- Status: `CLOSED`
- Judgment: `VALID_MITIGATION`
- Bond: `10 GEN`
- Confirmed loss: `8 GEN`
- Loss at mitigation: `4 GEN`
- Recoverable: `4 GEN`
- Avoidable secured loss: `4 GEN`
- Returned to provider: `6 GEN`
- Remaining bond: `0 GEN`

This is an existing deployed proof case. `DemoLiabilitySource` is a Studio demonstration source, not a claim that the upstream liability system is production infrastructure.

## Real vs demo

`DemoLiabilitySource` simulates an upstream liability system for the Studio demonstration.

TEMPER itself provides the actual protocol flow for bonded state, receipt verification, evidence URL/hash recording, GenLayer adjudication, remedy calculation, settlement, provider withdrawal, and the `CLOSED` state.

## Deployment

- Environment: GenLayer Studio preview / Studio Next environment
- Chain ID: `61997`
- Canonical RPC: `https://studio-dev.genlayer.com/api`
- Explorer: `https://explorer-studio-dev.genlayer.com`
- TEMPER: `0x1f156EB776698C283774Bfb7d2B9608257d6c47d`
- DemoLiabilitySource: `0x357c1a93EaEA2B4FcC1Bc706EF478A0Bb9A794a9`

The canonical programmatic RPC uses the `studio-dev` hostname for the shared Studio preview environment.

## How to try

Fastest reviewer path:

1. Open TEMPER.
2. Select **Explore Cases**.
3. Open the existing `CLOSED` case.
4. Inspect the GenLayer judgment.
5. Inspect provider and claimant evidence.
6. Inspect remedy economics.
7. Inspect **Final Settlement**.
8. Open Technical details or the explorer for verification.

Live app: **TO BE ADDED AFTER DEPLOYMENT**

## Development

The frontend is in `frontend/` and uses the committed `bun.lock` file.

```bash
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

The backend tests require the current GenLayer Direct Mode tooling and Python 3.12+ environment:

```bash
cd backend
python -m pytest -q -p no:cacheprovider
```

Contract validation commands:

```bash
genvm-lint validate backend/contracts/temper.py
genvm-lint schema backend/contracts/temper.py
genvm-lint typecheck backend/contracts/temper.py
genvm-lint validate backend/mocks/demo_liability_source.py
genvm-lint schema backend/mocks/demo_liability_source.py
genvm-lint typecheck backend/mocks/demo_liability_source.py
```

These commands assume the official GenLayer tooling is installed separately; this repository does not replace that toolchain's environment management.

## Evidence security

Evidence follows this path:

```text
HTTPS evidence → server preparation → URL validation / SSRF defenses
→ bounded fetch → SHA-256 → URL + hash recorded onchain
```

The complete evidence body is not stored onchain. The source reference and hash are recorded for the adjudication flow.

## Repository structure

```text
frontend/                 TanStack/Vite application and read/write adapter
backend/contracts/        TEMPER Intelligent Contract
backend/mocks/             Studio demonstration liability source
backend/tests/             Direct Mode and simulator tests
```

## Known tooling notes

- The current GenVM linter reports an `E014` compatibility diagnostic for TEMPER's current `@allow` storage API; current semantic validation, schema extraction, and typechecking pass.
- DemoLiabilitySource has known Pyright/u256 `Annotated` diagnostics from SDK typing stubs; runtime/schema validation passes.
- The current frontend validation has zero lint errors; ordinary dependency/tooling warnings are not protocol failures.

## Status

- Frontend lint: PASS
- Frontend typecheck: PASS
- Frontend build: PASS
- Backend tests: 20/20 PASS
- TEMPER validate/schema/typecheck: PASS
- DemoLiabilitySource validate/schema: PASS
- Existing deployed `CLOSED` proof case: verified through read-only live reads
