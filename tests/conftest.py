"""Test fixtures for current GenLayer Direct/Sim Mode compatibility.

The current Direct Mode loader intentionally permits one Intelligent Contract
class per VM.  TEMPER's integration tests exercise a real cross-contract call
between Temper and DemoLiabilitySource, so they use the bundled official
``glsim`` engine while retaining the Direct Mode VM cheatcodes and proxies.
"""

from pathlib import Path

import pytest


try:
    from glsim.engine import SimEngine
    from glsim.state import StateStore
except Exception:
    SimEngine = None
    StateStore = None


class SdkCompatibleSimEngine(SimEngine if SimEngine is not None else object):
    """Adapt the current SDK's unnamed calldata key for bundled glsim.

    genlayer-py 0.19 emits cross-contract method names under ``""`` while
    glsim 0.30.0rc2 still reads ``"method"``.  Keep this adapter local to the
    test harness; it does not alter the installed SDK or simulator globals.
    """

    def install_cross_contract_hook(self):
        engine = self

        def hook(vm, request):
            if "CallContract" in request:
                data = dict(request["CallContract"])
                calldata = dict(data.get("calldata", {}))
                if "method" not in calldata and "" in calldata:
                    calldata["method"] = calldata.pop("")
                data["calldata"] = calldata
                return engine._handle_call_in_contract(vm, data)
            if "EmitInternalDeployMessage" in request:
                return engine._handle_deploy_in_contract(
                    vm, request["EmitInternalDeployMessage"]
                )
            if "DeployContract" in request:
                return engine._handle_deploy_in_contract(vm, request["DeployContract"])
            if "EmitInternalMessage" in request:
                return engine._handle_post_in_contract(
                    vm, request["EmitInternalMessage"]
                )
            if "PostMessage" in request:
                return engine._handle_post_in_contract(vm, request["PostMessage"])
            return None

        self.vm._gl_call_hook = hook


class DeployedContract:
    """Keep the simulator's deployment address stable on a test proxy."""

    def __init__(self, instance, address):
        self._instance = instance
        self.address = address

    def __getattr__(self, name):
        return getattr(self._instance, name)


@pytest.fixture
def direct_vm():
    """Provide VM cheatcodes backed by the official local GenLayer simulator."""

    if SimEngine is None or StateStore is None:
        pytest.skip("genlayer-test simulator is unavailable")

    engine = SdkCompatibleSimEngine(StateStore())
    engine.activate()
    engine.vm._temper_sim_engine = engine
    original_mock_llm = engine.vm.mock_llm

    def mock_llm(prompt_pattern, response):
        # genlayer-py 0.19 decodes JSON from text/bytes itself.  The bundled
        # direct helper auto-parses JSON strings into dicts, which is the
        # previous SDK contract.  Bytes preserve the current API payload.
        if isinstance(response, str):
            response = response.encode("utf-8")
        original_mock_llm(prompt_pattern, response)

    engine.vm.mock_llm = mock_llm
    try:
        yield engine.vm
    finally:
        engine.deactivate()


@pytest.fixture
def direct_deploy(direct_vm):
    """Deploy test contracts into the simulator and return a call proxy."""

    engine = direct_vm._temper_sim_engine

    def deploy(contract_path, *args, **kwargs):
        kwargs.pop("sdk_version", None)
        path = Path(contract_path)
        address, instance = engine.deploy(str(path), list(args), kwargs)
        from gltest.direct.sdk_compat import import_address

        return DeployedContract(instance, import_address()(address))

    return deploy
