"""Small compatibility helpers for the current GenLayer test fixtures."""


def address_as_hex(address) -> str:
    """Return the SDK's canonical checksummed address representation.

    Current ``genlayer-test`` creates address fixtures as raw bytes before the
    contract SDK is loaded.  Contract calldata and stored address assertions
    use the SDK ``Address`` representation, so normalize at the test boundary.
    """

    if hasattr(address, "as_hex"):
        return address.as_hex

    from gltest.direct.sdk_compat import import_address

    return import_address()(address).as_hex


def same_address(left, right) -> bool:
    """Compare raw fixture bytes and SDK Address values by canonical bytes."""

    if hasattr(left, "as_bytes"):
        left = left.as_bytes
    if hasattr(right, "as_bytes"):
        right = right.as_bytes
    return left == right


def fund_contract(vm, contract, amount: int) -> None:
    """Model a payable call's value in the in-memory test VM balance."""

    vm.deal(contract.address, contract.get_balance() + amount)
