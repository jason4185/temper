from pathlib import Path

import pytest

from test_helpers import address_as_hex, same_address


try:
    import gltest  # noqa: F401
except Exception:
    pytestmark = pytest.mark.skip(reason="GenLayer direct-test plugin is unavailable")


SOURCE = Path(__file__).parents[1] / "contracts" / "temper_demo_liability_source.py"
MAX_U256 = 2**256 - 1


def _deploy(direct_deploy):
    return direct_deploy(str(SOURCE))


def _create(source, provider, claimant, receipt_id="LIABILITY-1", **overrides):
    values = {
        "receipt_id": receipt_id,
        "agreement_id": "TEMPER-1",
        "provider_address": address_as_hex(provider),
        "claimant_address": address_as_hex(claimant),
        "breach_timestamp": 1000,
        "total_claimed_loss": 20,
        "loss_recorded_at": 1100,
    }
    values.update(overrides)
    source.create_demo_liability(
        values["receipt_id"],
        values["agreement_id"],
        values["provider_address"],
        values["claimant_address"],
        values["breach_timestamp"],
        values["total_claimed_loss"],
        values["loss_recorded_at"],
    )


def test_interpolates_loss_and_preserves_receipt_binding(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    source = _deploy(direct_deploy)
    direct_vm.warp("2030-01-01T00:00:00Z")
    direct_vm.sender = direct_alice
    _create(source, direct_alice, direct_bob)

    assert source.get_liability_receipt_id("LIABILITY-1") == "LIABILITY-1"
    assert source.get_liability_agreement_id("LIABILITY-1") == "TEMPER-1"
    assert same_address(source.get_liability_provider_address("LIABILITY-1"), direct_alice)
    assert same_address(source.get_liability_claimant_address("LIABILITY-1"), direct_bob)
    assert source.is_liability_finalized("LIABILITY-1") is True
    assert source.get_established_breach_timestamp("LIABILITY-1") == 1000
    assert source.get_loss_recorded_at("LIABILITY-1") == 1100
    assert source.get_total_claimed_loss("LIABILITY-1") == 20

    with direct_vm.expect_revert("mitigation precedes breach"):
        source.get_loss_at_mitigation("LIABILITY-1", 999)
    assert source.get_loss_at_mitigation("LIABILITY-1", 1000) == 0
    assert source.get_loss_at_mitigation("LIABILITY-1", 1020) == 4
    assert source.get_loss_at_mitigation("LIABILITY-1", 1040) == 8
    assert source.get_loss_at_mitigation("LIABILITY-1", 1050) == 10
    assert source.get_loss_at_mitigation("LIABILITY-1", 1099) == 19
    assert source.get_loss_at_mitigation("LIABILITY-1", 1100) == 20
    assert source.get_loss_at_mitigation("LIABILITY-1", 1200) == 20


def test_timestamp_validation_duplicate_and_immutability(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    source = _deploy(direct_deploy)
    direct_vm.warp("2030-01-01T00:00:00Z")
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("breach timestamp is in the future"):
        _create(
            source,
            direct_alice,
            direct_bob,
            receipt_id="LIABILITY-FUTURE-BREACH",
            breach_timestamp=MAX_U256 - 1,
            loss_recorded_at=MAX_U256,
        )
    with direct_vm.expect_revert("loss record timestamp is in the future"):
        _create(
            source,
            direct_alice,
            direct_bob,
            receipt_id="LIABILITY-FUTURE-LOSS",
            loss_recorded_at=MAX_U256,
        )
    with direct_vm.expect_revert("loss record must follow breach"):
        _create(
            source,
            direct_alice,
            direct_bob,
            receipt_id="LIABILITY-BEFORE-BREACH",
            breach_timestamp=1100,
            loss_recorded_at=1000,
        )
    with direct_vm.expect_revert("loss record must follow breach"):
        _create(
            source,
            direct_alice,
            direct_bob,
            receipt_id="LIABILITY-EQUAL-TIMES",
            breach_timestamp=1000,
            loss_recorded_at=1000,
        )

    _create(source, direct_alice, direct_bob)
    with direct_vm.expect_revert("demo receipt already exists"):
        _create(source, direct_alice, direct_bob)
    with direct_vm.expect_revert("demo receipt already exists"):
        _create(source, direct_alice, direct_bob, total_claimed_loss=99)
    assert source.get_total_claimed_loss("LIABILITY-1") == 20


def test_max_u256_loss_interpolates_without_overflow(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    source = _deploy(direct_deploy)
    direct_vm.warp("2030-01-01T00:00:00Z")
    direct_vm.sender = direct_alice
    _create(
        source,
        direct_alice,
        direct_bob,
        receipt_id="LIABILITY-MAX",
        total_claimed_loss=MAX_U256,
    )

    expected = (MAX_U256 * 50) // 100
    assert source.get_loss_at_mitigation("LIABILITY-MAX", 1050) == expected


def test_recorded_loss_can_be_small_and_rounds_down(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    source = _deploy(direct_deploy)
    direct_vm.warp("2030-01-01T00:00:00Z")
    direct_vm.sender = direct_alice
    _create(
        source,
        direct_alice,
        direct_bob,
        receipt_id="LIABILITY-SMALL",
        total_claimed_loss=1,
        breach_timestamp=2000,
        loss_recorded_at=2003,
    )

    assert source.get_loss_at_mitigation("LIABILITY-SMALL", 2001) == 0
    assert source.get_loss_at_mitigation("LIABILITY-SMALL", 2002) == 0
    assert source.get_loss_at_mitigation("LIABILITY-SMALL", 2003) == 1
