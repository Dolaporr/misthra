// SPDX-License-Identifier: Apache-2.0
// Misthra, 2026-11-10.
pragma solidity 0.8.28;

import { Clones } from "../libraries/Clones.sol";
import { MisthraMontraAdapter, IMontraLaunchToken, IMisthraRouterBind } from "./MisthraMontraAdapter.sol";

/// @notice Puts a `MisthraMontraAdapter` at an address known before anything is
/// deployed: the router's address decides it. A creator names that address
/// twice, as the router's launchpad adapter and as the Montra pool's fee
/// recipient, then anyone may activate it once the token exists.
///
/// Activation is permissionless because every input is checked against things
/// only the creator could have made:
///  - the token is a genuine Montra launch: its code is exactly a clone of
///    Montra's token master, which only Montra's factory can initialize, and its
///    hook is Montra's hook;
///  - the token's creator (who signed the Montra launch) is the router's
///    creator (who alone can deploy their launchpad router);
///  - the router names this adapter as its launchpad adapter.
contract MisthraMontraAdapterFactory {
    address public immutable implementation;
    address public immutable hook;
    address public immutable tokenMaster;
    bytes32 public immutable tokenCodeHash;

    event Activated(address indexed router, address indexed token, address adapter, address quote);

    error NotMontraToken();
    error WrongHook();
    error CreatorMismatch();
    error AdapterNotNamed();

    constructor(address hook_, address tokenMaster_) {
        hook = hook_;
        tokenMaster = tokenMaster_;
        implementation = address(new MisthraMontraAdapter());
        // EIP-1167 runtime code of a clone of the token master.
        tokenCodeHash = keccak256(abi.encodePacked(
            hex"363d3d373d3d3d363d73", tokenMaster_, hex"5af43d82803e903d91602b57fd5bf3"
        ));
    }

    function saltFor(address router) public pure returns (bytes32) {
        return bytes32(uint256(uint160(router)));
    }

    /// @notice The adapter address for a router, before or after activation.
    function predict(address router) public view returns (address) {
        return Clones.predictDeterministicAddress(implementation, saltFor(router), address(this));
    }

    /// @notice Deploys and initializes the adapter for `router`, binding the
    /// router to `token`. `quote` is the pool's quote asset (zero = native HYPE).
    function activate(address router, address token, address quote) external returns (address adapter) {
        if (token.codehash != tokenCodeHash) revert NotMontraToken();
        if (IMontraLaunchToken(token).hook() != hook) revert WrongHook();
        address creator = IMontraLaunchToken(token).creator();
        if (creator == address(0) || creator != IMisthraRouterBind(router).creator()) revert CreatorMismatch();
        address predicted = predict(router);
        if (IMisthraRouterBind(router).launchpadAdapter() != predicted) revert AdapterNotNamed();
        adapter = Clones.cloneDeterministic(implementation, saltFor(router));
        MisthraMontraAdapter(payable(adapter)).initialize(hook, router, token, quote);
        emit Activated(router, token, adapter, quote);
    }
}
