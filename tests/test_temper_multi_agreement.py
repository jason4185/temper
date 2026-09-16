import hashlib
import json
from pathlib import Path

import pytest

from test_helpers import address_as_hex, fund_contract


try:
    import gltest  # noqa: F401
except Exception:
    pytestmark = pytest.mark.skip(reason="GenLayer direct-test plugin is unavailable")


ROOT = Path(__file__).parents[1]
TEMPER = ROOT / "contracts" / "temper.py"
DEMO_SOURCE = ROOT / "contracts" / "temper_demo_liability_source.py"
WEI = 10**18


def _terms(
    source: str, agreement_id: str, claimant, duration_days: int = 3650, coverage_gen: int = 8
) -> list:
    return [
        address_as_hex(claimant),
        "Pricing data for autonomous trading",
        "The claimant must take commercially reasonable steps to contain continuing loss.",
        "Operational backup services permitted by the covenant.",
        agreement_id,
        source,
        coverage_gen,
        duration_days,
    ]


def _deploy_source(direct_deploy):
    return direct_deploy(str(DEMO_SOURCE))


def _create_demo_liability(
    source,
    receipt_id,
    agreement_id,
    provider,
    claimant,
    total_loss=8 * WEI,
    breach_timestamp=1000,
    loss_recorded_at=1008,
):
    source.create_demo_liability(
        receipt_id,
        agreement_id,
        address_as_hex(provider),
        address_as_hex(claimant),
        breach_timestamp,
        total_loss,
        loss_recorded_at,
    )


def test_multiple_agreements_are_isolated(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    provider_a, claimant_a = direct_alice, direct_bob
    provider_b, claimant_b = direct_charlie, direct_alice
    source = _deploy_source(direct_deploy)
    temper = direct_deploy(str(TEMPER))
    direct_vm.warp("2030-01-01T00:00:00Z")

    direct_vm.sender = provider_a
    _create_demo_liability(
        source, "LIABILITY-001", "TEMPER-A", provider_a, claimant_a
    )
    temper.create_agreement(*_terms(source.address.as_hex, "TEMPER-A", claimant_a))
    direct_vm.sender = provider_b
    _create_demo_liability(
        source,
        "LIABILITY-002",
        "TEMPER-B",
        provider_b,
        claimant_b,
        total_loss=5 * WEI,
    )
    temper.create_agreement(*_terms(source.address.as_hex, "TEMPER-B", claimant_b))
    assert temper.get_agreement_count() == 2
    assert temper.get_coverage_limit("TEMPER-A") == 8 * WEI
    assert temper.get_coverage_limit("TEMPER-B") == 8 * WEI
    assert temper.get_agreement_id_at(0) == "TEMPER-A"
    assert temper.get_agreement_id_at(1) == "TEMPER-B"
    with direct_vm.expect_revert("agreement id already exists"):
        temper.create_agreement(*_terms(source.address.as_hex, "TEMPER-A", claimant_a))

    direct_vm.sender = claimant_a
    temper.accept_agreement("TEMPER-A")
    assert temper.get_status("TEMPER-A") == "ACCEPTED"
    assert temper.get_status("TEMPER-B") == "PROPOSED"

    fund_contract(direct_vm, temper, 8 * WEI)
    direct_vm.sender = provider_a
    direct_vm.value = 8 * WEI
    temper.fund_bond("TEMPER-A")
    direct_vm.value = 0
    assert temper.get_total_bond_funded("TEMPER-A") == 8 * WEI
    assert temper.get_total_bond_funded("TEMPER-B") == 0
    assert temper.get_total_reserved_bond() == 8 * WEI

    direct_vm.sender = claimant_b
    with direct_vm.expect_revert("claimant only"):
        temper.accept_agreement("TEMPER-A")
    direct_vm.sender = claimant_a
    with direct_vm.expect_revert("claimant only"):
        temper.accept_agreement("TEMPER-B")
    direct_vm.sender = provider_a
    with direct_vm.expect_revert("provider only"):
        temper.fund_bond("TEMPER-B")
    direct_vm.sender = provider_b
    with direct_vm.expect_revert("provider only"):
        temper.fund_bond("TEMPER-A")

    direct_vm.sender = claimant_b
    temper.accept_agreement("TEMPER-B")
    fund_contract(direct_vm, temper, 8 * WEI)
    direct_vm.sender = provider_b
    direct_vm.value = 5 * WEI
    with direct_vm.expect_revert("bond must equal coverage limit"):
        temper.fund_bond("TEMPER-B")
    direct_vm.value = 8 * WEI
    temper.fund_bond("TEMPER-B")
    direct_vm.value = 0
    assert temper.get_status("TEMPER-B") == "ACTIVE"
    assert temper.get_total_reserved_bond() == 16 * WEI
    assert temper.get_balance() == 16 * WEI

    direct_vm.sender = claimant_b
    with direct_vm.expect_revert("liability agreement mismatch"):
        temper.open_claim("TEMPER-B", "LIABILITY-001")
    temper.open_claim("TEMPER-B", "LIABILITY-002")
    with direct_vm.expect_revert("demo receipt already exists"):
        _create_demo_liability(
            source, "LIABILITY-001", "TEMPER-B", provider_b, claimant_b
        )
    assert source.get_liability_agreement_id("LIABILITY-001") == "TEMPER-A"
    assert source.get_liability_agreement_id("LIABILITY-002") == "TEMPER-B"
    assert source.get_total_claimed_loss("LIABILITY-001") == 8 * WEI
    assert source.get_total_claimed_loss("LIABILITY-002") == 5 * WEI
    assert source.is_liability_finalized("LIABILITY-001") is True
    assert source.get_liability_outcome("LIABILITY-002") == "PROVIDER_LIABLE"
    assert source.get_loss_at_mitigation("LIABILITY-002", 1002) == (5 * WEI * 2) // 8
    assert temper.get_status("TEMPER-A") == "ACTIVE"
    assert temper.get_status("TEMPER-B") == "CLAIM_OPEN"


def test_single_agreement_full_lifecycle(direct_vm, direct_deploy, direct_alice, direct_bob):
    provider, claimant = direct_alice, direct_bob
    source = _deploy_source(direct_deploy)
    temper = direct_deploy(str(TEMPER))
    direct_vm.warp("2030-01-01T00:00:00Z")
    direct_vm.sender = provider
    _create_demo_liability(
        source, "LIABILITY-FLOW", "TEMPER-FLOW", provider, claimant
    )
    temper.create_agreement(*_terms(source.address.as_hex, "TEMPER-FLOW", claimant))
    direct_vm.sender = claimant
    temper.accept_agreement("TEMPER-FLOW")
    fund_contract(direct_vm, temper, 8 * WEI)
    direct_vm.sender = provider
    direct_vm.value = 8 * WEI
    temper.fund_bond("TEMPER-FLOW")
    direct_vm.value = 0

    direct_vm.sender = claimant
    temper.open_claim("TEMPER-FLOW", "LIABILITY-FLOW")
    assert json.loads(temper.get_summary("TEMPER-FLOW"))["total_claimed_loss"] == 8 * WEI

    primary = b'{"timestamp":1002,"operational":true}'
    corroborating = b'{"timestamp":1002,"reachable":true}'
    direct_vm.mock_web(
        r"example\.com/temper/primary",
        {"response": {"status": 200, "headers": {}, "body": primary}, "method": "GET"},
    )
    direct_vm.mock_web(
        r"example\.com/temper/corroborating",
        {"response": {"status": 200, "headers": {}, "body": corroborating}, "method": "GET"},
    )
    direct_vm.sender = provider
    temper.submit_mitigation(
        "TEMPER-FLOW",
        1002,
        "BackupFeed Y was available at timestamp 1002.",
        "https://example.com/temper/primary",
        hashlib.sha256(primary).hexdigest(),
        "https://example.com/temper/corroborating",
        hashlib.sha256(corroborating).hexdigest(),
    )
    direct_vm.sender = claimant
    temper.dispute_mitigation(
        "TEMPER-FLOW",
        "No technical blocker was recorded at timestamp 1002.",
        "",
        "",
    )
    direct_vm.mock_llm(r"(?s).*TEMPER TASK.*", json.dumps({"verdict": "VALID_MITIGATION"}))
    direct_vm.sender = claimant
    temper.request_judgment("TEMPER-FLOW")
    summary = json.loads(temper.get_summary("TEMPER-FLOW"))
    assert summary["status"] == "RESOLVED"
    assert summary["final_verdict"] == "VALID_MITIGATION"
    assert summary["recoverable_amount"] == 2 * WEI
    assert summary["avoidable_amount"] == 6 * WEI

    temper.request_payout("TEMPER-FLOW")
    assert json.loads(temper.get_summary("TEMPER-FLOW"))["status"] == "SETTLED"
    assert temper.get_total_reserved_bond() == 6 * WEI
    direct_vm.sender = provider
    temper.withdraw_remaining_bond("TEMPER-FLOW")
    summary = json.loads(temper.get_summary("TEMPER-FLOW"))
    assert summary["status"] == "CLOSED"
    assert summary["amount_already_paid"] == 2 * WEI
    assert summary["amount_withdrawn"] == 6 * WEI
    assert temper.get_total_reserved_bond() == 0


def test_closed_agreement_does_not_block_second(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    provider_a, claimant_a = direct_alice, direct_bob
    provider_b, claimant_b = direct_charlie, direct_alice
    source = _deploy_source(direct_deploy)
    temper = direct_deploy(str(TEMPER))

    direct_vm.warp("2030-01-01T00:00:00Z")
    direct_vm.sender = provider_a
    _create_demo_liability(
        source, "LIABILITY-CLOSED", "TEMPER-CLOSED", provider_a, claimant_a
    )
    _create_demo_liability(
        source, "LIABILITY-ACTIVE", "TEMPER-ACTIVE", provider_b, claimant_b
    )
    temper.create_agreement(
        *_terms(source.address.as_hex, "TEMPER-CLOSED", claimant_a, duration_days=1)
    )
    direct_vm.sender = provider_b
    temper.create_agreement(
        *_terms(source.address.as_hex, "TEMPER-ACTIVE", claimant_b)
    )

    direct_vm.sender = claimant_a
    temper.accept_agreement("TEMPER-CLOSED")
    direct_vm.sender = provider_a
    fund_contract(direct_vm, temper, 8 * WEI)
    direct_vm.value = 8 * WEI
    temper.fund_bond("TEMPER-CLOSED")
    direct_vm.value = 0

    direct_vm.sender = claimant_b
    temper.accept_agreement("TEMPER-ACTIVE")
    direct_vm.sender = provider_b
    fund_contract(direct_vm, temper, 8 * WEI)
    direct_vm.value = 8 * WEI
    temper.fund_bond("TEMPER-ACTIVE")
    direct_vm.value = 0
    assert temper.get_total_reserved_bond() == 16 * WEI

    direct_vm.warp("2034-01-01T00:00:00Z")
    direct_vm.sender = provider_a
    temper.trigger_timeout("TEMPER-CLOSED")
    assert temper.get_status("TEMPER-CLOSED") == "CLOSED"
    assert temper.get_total_reserved_bond() == 8 * WEI

    direct_vm.sender = claimant_b
    temper.open_claim("TEMPER-ACTIVE", "LIABILITY-ACTIVE")
    assert temper.get_status("TEMPER-ACTIVE") == "CLAIM_OPEN"


def test_zero_and_overflow_gen_coverage_are_rejected(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    source = _deploy_source(direct_deploy)
    temper = direct_deploy(str(TEMPER))
    direct_vm.warp("2030-01-01T00:00:00Z")
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("coverage limit must be nonzero"):
        temper.create_agreement(
            *_terms(
                source.address.as_hex,
                "TEMPER-ZERO",
                direct_bob,
                duration_days=3650,
                coverage_gen=0,
            )
        )

    with direct_vm.expect_revert("coverage limit is too large"):
        temper.create_agreement(
            *_terms(
                source.address.as_hex,
                "TEMPER-OVERFLOW",
                direct_bob,
                duration_days=3650,
                coverage_gen=2**256 - 1,
            )
        )


def _prepare_funded_claim(
    direct_vm,
    direct_deploy,
    provider,
    claimant,
    agreement_id,
    receipt_id,
    total_loss,
    loss_at_mitigation,
    duration_days=3650,
):
    source = _deploy_source(direct_deploy)
    temper = direct_deploy(str(TEMPER))
    direct_vm.warp("2030-01-01T00:00:00Z")
    direct_vm.sender = provider
    if loss_at_mitigation == 0:
        breach_timestamp = 1002
        loss_recorded_at = 1003
    else:
        breach_timestamp = 1000
        loss_recorded_at = 1000 + max((total_loss * 2) // loss_at_mitigation, 3)
    _create_demo_liability(
        source,
        receipt_id,
        agreement_id,
        provider,
        claimant,
        total_loss=total_loss,
        breach_timestamp=breach_timestamp,
        loss_recorded_at=loss_recorded_at,
    )
    temper.create_agreement(
        *_terms(source.address.as_hex, agreement_id, claimant, duration_days=duration_days)
    )
    direct_vm.sender = claimant
    temper.accept_agreement(agreement_id)
    fund_contract(direct_vm, temper, 8 * WEI)
    direct_vm.sender = provider
    direct_vm.value = 8 * WEI
    temper.fund_bond(agreement_id)
    direct_vm.value = 0
    direct_vm.sender = claimant
    temper.open_claim(agreement_id, receipt_id)
    return source, temper


def _resolve_judgment(direct_vm, temper, agreement_id, provider, claimant, verdict):
    primary = b'{"timestamp":1002,"operational":true}'
    corroborating = b'{"timestamp":1002,"reachable":true}'
    direct_vm.mock_web(
        r"example\.com/temper/primary",
        {"response": {"status": 200, "headers": {}, "body": primary}, "method": "GET"},
    )
    direct_vm.mock_web(
        r"example\.com/temper/corroborating",
        {
            "response": {"status": 200, "headers": {}, "body": corroborating},
            "method": "GET",
        },
    )
    direct_vm.sender = provider
    temper.submit_mitigation(
        agreement_id,
        1002,
        "The agreed backup was available.",
        "https://example.com/temper/primary",
        hashlib.sha256(primary).hexdigest(),
        "https://example.com/temper/corroborating",
        hashlib.sha256(corroborating).hexdigest(),
    )
    direct_vm.sender = claimant
    temper.dispute_mitigation(agreement_id, "I dispute practical availability.", "", "")
    direct_vm.mock_llm(r"(?s).*TEMPER TASK.*", json.dumps({"verdict": verdict}))
    direct_vm.sender = claimant
    temper.request_judgment(agreement_id)


@pytest.mark.parametrize(
    "total_loss,loss_at_mitigation,verdict,expected_recoverable,expected_avoidable,expected_remainder",
    [
        (8 * WEI, 2 * WEI, "VALID_MITIGATION", 2 * WEI, 6 * WEI, 6 * WEI),
        (20 * WEI, 2 * WEI, "VALID_MITIGATION", 2 * WEI, 6 * WEI, 6 * WEI),
        (20 * WEI, 10 * WEI, "VALID_MITIGATION", 8 * WEI, 0, 0),
        (20 * WEI, 2 * WEI, "INVALID_MITIGATION", 8 * WEI, 0, 0),
        (20 * WEI, 2 * WEI, "UNDETERMINED", 8 * WEI, 0, 0),
        (5 * WEI, 2 * WEI, "VALID_MITIGATION", 2 * WEI, 3 * WEI, 6 * WEI),
        (5 * WEI, 2 * WEI, "INVALID_MITIGATION", 5 * WEI, 0, 3 * WEI),
    ],
)
def test_secured_loss_judgment_economics(
    direct_vm,
    direct_deploy,
    direct_alice,
    direct_bob,
    direct_charlie,
    total_loss,
    loss_at_mitigation,
    verdict,
    expected_recoverable,
    expected_avoidable,
    expected_remainder,
):
    source, temper = _prepare_funded_claim(
        direct_vm,
        direct_deploy,
        direct_alice,
        direct_bob,
        "TEMPER-SECURED",
        "LIABILITY-SECURED",
        total_loss,
        loss_at_mitigation,
    )
    _resolve_judgment(
        direct_vm,
        temper,
        "TEMPER-SECURED",
        direct_alice,
        direct_bob,
        verdict,
    )
    summary = json.loads(temper.get_summary("TEMPER-SECURED"))
    assert summary["total_claimed_loss"] == total_loss
    assert summary["recoverable_amount"] == expected_recoverable
    assert summary["avoidable_amount"] == expected_avoidable
    assert expected_recoverable + expected_avoidable == min(total_loss, 8 * WEI)
    assert summary["remaining_bond"] == 8 * WEI
    assert source.get_total_claimed_loss("LIABILITY-SECURED") == total_loss

    direct_vm.sender = direct_charlie
    temper.request_payout("TEMPER-SECURED")
    summary = json.loads(temper.get_summary("TEMPER-SECURED"))
    assert summary["status"] == "SETTLED"
    assert summary["amount_already_paid"] == expected_recoverable
    assert summary["remaining_bond"] == expected_remainder
    assert temper.get_total_reserved_bond() == expected_remainder

    direct_vm.sender = direct_alice
    temper.withdraw_remaining_bond("TEMPER-SECURED")
    assert json.loads(temper.get_summary("TEMPER-SECURED"))["status"] == "CLOSED"
    assert temper.get_total_reserved_bond() == 0


def test_loss_at_mitigation_above_bond_is_allowed(direct_vm, direct_deploy, direct_alice, direct_bob):
    _source, temper = _prepare_funded_claim(
        direct_vm,
        direct_deploy,
        direct_alice,
        direct_bob,
        "TEMPER-ABOVE-BOND",
        "LIABILITY-ABOVE-BOND",
        20 * WEI,
        10 * WEI,
    )
    assert json.loads(temper.get_summary("TEMPER-ABOVE-BOND"))["total_claimed_loss"] == 20 * WEI


def test_loss_recorded_at_before_breach_is_rejected(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    source = _deploy_source(direct_deploy)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("loss record must follow breach"):
        _create_demo_liability(
            source,
            "LIABILITY-INVALID-ORDER",
            "TEMPER-INVALID-ORDER",
            direct_alice,
            direct_bob,
            total_loss=5 * WEI,
            breach_timestamp=1000,
            loss_recorded_at=999,
        )


def test_claim_timeout_caps_recoverable_loss(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    _source, temper = _prepare_funded_claim(
        direct_vm,
        direct_deploy,
        direct_alice,
        direct_bob,
        "TEMPER-CLAIM-TIMEOUT",
        "LIABILITY-CLAIM-TIMEOUT",
        20 * WEI,
        2 * WEI,
    )
    direct_vm.warp("2030-01-08T00:00:01Z")
    direct_vm.sender = direct_alice
    temper.trigger_timeout("TEMPER-CLAIM-TIMEOUT")
    summary = json.loads(temper.get_summary("TEMPER-CLAIM-TIMEOUT"))
    assert summary["recoverable_amount"] == 8 * WEI
    assert summary["avoidable_amount"] == 0


def test_judgment_timeout_caps_recoverable_loss(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    _source, temper = _prepare_funded_claim(
        direct_vm,
        direct_deploy,
        direct_alice,
        direct_bob,
        "TEMPER-JUDGMENT-TIMEOUT",
        "LIABILITY-JUDGMENT-TIMEOUT",
        20 * WEI,
        2 * WEI,
    )
    primary = b'{"timestamp":1002,"operational":true}'
    corroborating = b'{"timestamp":1002,"reachable":true}'
    direct_vm.mock_web(
        r"example\.com/temper/primary",
        {"response": {"status": 200, "headers": {}, "body": primary}, "method": "GET"},
    )
    direct_vm.mock_web(
        r"example\.com/temper/corroborating",
        {"response": {"status": 200, "headers": {}, "body": corroborating}, "method": "GET"},
    )
    direct_vm.sender = direct_alice
    temper.submit_mitigation(
        "TEMPER-JUDGMENT-TIMEOUT",
        1002,
        "The agreed backup was available.",
        "https://example.com/temper/primary",
        hashlib.sha256(primary).hexdigest(),
        "https://example.com/temper/corroborating",
        hashlib.sha256(corroborating).hexdigest(),
    )
    direct_vm.sender = direct_bob
    temper.dispute_mitigation("TEMPER-JUDGMENT-TIMEOUT", "I dispute availability.", "", "")
    direct_vm.warp("2030-01-08T00:00:01Z")
    temper.trigger_timeout("TEMPER-JUDGMENT-TIMEOUT")
    summary = json.loads(temper.get_summary("TEMPER-JUDGMENT-TIMEOUT"))
    assert summary["resolution_basis"] == "MITIGATION_JUDGMENT_TIMEOUT"
    assert summary["recoverable_amount"] == 8 * WEI
    assert summary["avoidable_amount"] == 0


def test_unchallenged_mitigation_caps_recoverable_loss(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    _source, temper = _prepare_funded_claim(
        direct_vm,
        direct_deploy,
        direct_alice,
        direct_bob,
        "TEMPER-UNCHALLENGED",
        "LIABILITY-UNCHALLENGED",
        20 * WEI,
        10 * WEI,
    )
    primary = b'{"timestamp":1002,"operational":true}'
    corroborating = b'{"timestamp":1002,"reachable":true}'
    direct_vm.mock_web(
        r"example\.com/temper/primary",
        {"response": {"status": 200, "headers": {}, "body": primary}, "method": "GET"},
    )
    direct_vm.mock_web(
        r"example\.com/temper/corroborating",
        {"response": {"status": 200, "headers": {}, "body": corroborating}, "method": "GET"},
    )
    direct_vm.sender = direct_alice
    temper.submit_mitigation(
        "TEMPER-UNCHALLENGED",
        1002,
        "The agreed backup was available.",
        "https://example.com/temper/primary",
        hashlib.sha256(primary).hexdigest(),
        "https://example.com/temper/corroborating",
        hashlib.sha256(corroborating).hexdigest(),
    )
    direct_vm.warp("2030-01-01T00:10:01Z")
    temper.trigger_timeout("TEMPER-UNCHALLENGED")
    summary = json.loads(temper.get_summary("TEMPER-UNCHALLENGED"))
    assert summary["resolution_basis"] == "UNCHALLENGED_MITIGATION"
    assert summary["recoverable_amount"] == 8 * WEI
    assert summary["avoidable_amount"] == 0
