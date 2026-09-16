# v0.3.0
# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }

"""TEST/DEMO ONLY: immutable multi-receipt liability source for TEMPER."""

from datetime import datetime, timezone
import json

import genlayer as gl
from genlayer import Address, u256
from genlayer.storage import TreeMap


DEMO_OUTCOME = "PROVIDER_LIABLE"
ZERO_ADDRESS = Address(b"\x00" * 20)


def _require_text(value: str, field: str) -> None:
    if not isinstance(value, str) or not value or len(value) > 256:
        raise gl.vm.UserError(f"[EXPECTED] invalid {field}")


def _current_timestamp() -> int:
    return int(datetime.now(timezone.utc).timestamp())


class DemoLiabilitySource(gl.contract.Contract):
    """Hackathon/testing source for established liability and loss facts only.

    This is not a court, production oracle, or mitigation judge.
    """

    liability_records: TreeMap[str, str]

    def __init__(self) -> None:
        pass

    def _record(self, receipt_id: str) -> dict:
        _require_text(receipt_id, "receipt_id")
        if receipt_id not in self.liability_records:
            raise gl.vm.UserError("[EXPECTED] liability receipt does not exist")
        return json.loads(self.liability_records[receipt_id])

    @gl.public.write
    def create_demo_liability(
        self,
        receipt_id: str,
        agreement_id: str,
        provider_address: str,
        claimant_address: str,
        breach_timestamp: u256,
        total_claimed_loss: u256,
        loss_recorded_at: u256,
    ) -> None:
        _require_text(receipt_id, "receipt_id")
        _require_text(agreement_id, "agreement_id")
        if receipt_id in self.liability_records:
            raise gl.vm.UserError("[EXPECTED] demo receipt already exists")
        try:
            provider = Address(provider_address)
            claimant = Address(claimant_address)
        except (TypeError, ValueError):
            raise gl.vm.UserError("[EXPECTED] invalid party address")
        if provider == ZERO_ADDRESS or claimant == ZERO_ADDRESS:
            raise gl.vm.UserError("[EXPECTED] party address cannot be zero")
        if provider == claimant:
            raise gl.vm.UserError("[EXPECTED] parties must differ")
        if total_claimed_loss == 0:
            raise gl.vm.UserError("[EXPECTED] source claim must be nonzero")
        if breach_timestamp >= loss_recorded_at:
            raise gl.vm.UserError("[EXPECTED] loss record must follow breach")
        now = _current_timestamp()
        if breach_timestamp > now:
            raise gl.vm.UserError("[EXPECTED] breach timestamp is in the future")
        if loss_recorded_at > now:
            raise gl.vm.UserError("[EXPECTED] loss record timestamp is in the future")
        self.liability_records[receipt_id] = json.dumps(
            {
                "receipt_id": receipt_id,
                "receipt_hash": "demo-receipt:" + receipt_id,
                "agreement_id": agreement_id,
                "provider": provider.as_hex,
                "claimant": claimant.as_hex,
                "finalized": True,
                "outcome": DEMO_OUTCOME,
                "breach_timestamp": breach_timestamp,
                "total_claimed_loss": total_claimed_loss,
                "loss_reference": "demo-loss-record:" + receipt_id,
                "loss_hash": "demo-loss:" + receipt_id,
                "loss_recorded_at": loss_recorded_at,
            },
            sort_keys=True,
            separators=(",", ":"),
        )

    @gl.public.view
    def get_liability_receipt_id(self, receipt_id: str) -> str:
        return self._record(receipt_id)["receipt_id"]

    @gl.public.view
    def get_liability_receipt_hash(self, receipt_id: str) -> str:
        return self._record(receipt_id)["receipt_hash"]

    @gl.public.view
    def get_liability_agreement_id(self, receipt_id: str) -> str:
        return self._record(receipt_id)["agreement_id"]

    @gl.public.view
    def get_liability_provider_address(self, receipt_id: str) -> Address:
        return Address(self._record(receipt_id)["provider"])

    @gl.public.view
    def get_liability_claimant_address(self, receipt_id: str) -> Address:
        return Address(self._record(receipt_id)["claimant"])

    @gl.public.view
    def is_liability_finalized(self, receipt_id: str) -> bool:
        return self._record(receipt_id)["finalized"]

    @gl.public.view
    def get_liability_outcome(self, receipt_id: str) -> str:
        return self._record(receipt_id)["outcome"]

    @gl.public.view
    def get_established_breach_timestamp(self, receipt_id: str) -> u256:
        return u256(self._record(receipt_id)["breach_timestamp"])

    @gl.public.view
    def get_total_claimed_loss(self, receipt_id: str) -> u256:
        return u256(self._record(receipt_id)["total_claimed_loss"])

    @gl.public.view
    def get_loss_recorded_at(self, receipt_id: str) -> u256:
        return u256(self._record(receipt_id)["loss_recorded_at"])

    @gl.public.view
    def get_loss_record_reference(self, receipt_id: str) -> str:
        return self._record(receipt_id)["loss_reference"]

    @gl.public.view
    def get_loss_record_hash(self, receipt_id: str) -> str:
        return self._record(receipt_id)["loss_hash"]

    @gl.public.view
    def get_loss_at_mitigation(
        self, receipt_id: str, mitigation_timestamp: u256
    ) -> u256:
        record = self._record(receipt_id)
        if mitigation_timestamp < record["breach_timestamp"]:
            raise gl.vm.UserError("[EXPECTED] mitigation precedes breach")
        if mitigation_timestamp >= record["loss_recorded_at"]:
            return u256(record["total_claimed_loss"])
        elapsed = int(mitigation_timestamp) - int(record["breach_timestamp"])
        duration = int(record["loss_recorded_at"]) - int(record["breach_timestamp"])
        return u256((int(record["total_claimed_loss"]) * elapsed) // duration)
