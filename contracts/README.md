# TEMPER contracts

This directory contains the production TEMPER Intelligent Contract, the Studio demonstration liability source, and the contract validation suite.

## Components

- `temper.py` — the production protocol: bonded service agreements, upstream liability receipt verification, mitigation evidence, GenLayer judgment, remedy accounting, settlement, provider withdrawal, and case closure.
- `demo_liability_source.py` — a demo-only upstream liability source used to create deterministic Studio demonstration receipts. It is not production liability infrastructure.
- `../tests/` — Direct Mode and simulator coverage for receipt binding, agreement isolation, roles, evidence, judgment branches, remedy economics, settlement, withdrawals, and timeouts.

## Lifecycle

The public flow is:

`PROPOSED → ACCEPTED → ACTIVE → CLAIM_OPEN → mitigation claim → claimant response → judgment → RESOLVED → SETTLED → CLOSED`

GenLayer evaluates whether the agreed fallback was reasonably available at the claimed mitigation point. The contract then applies the verdict to the secured loss; validators do not directly choose an arbitrary payout amount.

## Tests

Use Python 3.12+ with the current official GenLayer Direct Mode tooling from the repository root:

```bash
python -m pytest -q tests -p no:cacheprovider
```

The current suite contains 20 tests and passes in the validated GenLayer test environment.

## Contract validation

From the repository root:

```bash
genvm-lint validate contracts/temper.py
genvm-lint schema contracts/temper.py
genvm-lint typecheck contracts/temper.py

genvm-lint validate contracts/demo_liability_source.py
genvm-lint schema contracts/demo_liability_source.py
genvm-lint typecheck contracts/demo_liability_source.py
```

## Known tooling warnings

The source is unchanged to avoid masking upstream tooling issues:

- The current linter reports an `E014` diagnostic for TEMPER's current `@allow` storage API even though semantic validation, schema extraction, and typechecking pass.
- DemoLiabilitySource has five known Pyright/u256 `Annotated` diagnostics from SDK typing stubs; runtime/schema validation passes.
