// SPDX-License-Identifier: Apache-2.0
// Misthra, 2026-11-10. Implements IMisthraLaunchpadAdapter (from Sinjoh-Finance/sinjoh-contracts,
// Apache-2.0, see NOTICE) for Montra on Elysium.
pragma solidity 0.8.28;

import { IMisthraLaunchpadAdapter } from "../interfaces/IMisthraLaunchpadAdapter.sol";
import { SafeTransferLib } from "../libraries/SafeTransferLib.sol";

/// @notice The parts of Montra's LaunchHook this adapter uses
/// (montramarkets.xyz/docs/reference, "Claims and collection").
interface IMontraLaunchHook {
    /// @dev The pool's recipient only. Sweeps, harvests and pays the whole tab to `to`.
    function claim(bytes32 poolId, address to) external returns (uint256 amount);
}

/// @notice The parts of a Montra LaunchToken this adapter reads.
interface IMontraLaunchToken {
    function creator() external view returns (address);
    function hook() external view returns (address);
    function poolId() external view returns (bytes32);
}

interface IMisthraRouterBind {
    function bind(address newSubject) external;
    function creator() external view returns (address);
    function launchpadAdapter() external view returns (address);
}

/// @notice Montra pays a pool's creator fees by claim: they wait in the hook
/// until the pool's recipient calls `claim`. A Misthra router cannot call
/// Montra, so this adapter is named as the pool's fee recipient instead: anyone
/// can make it claim, and everything it holds can only go to its one router.
///
/// It has no owner and nothing it does can be redirected. Everything is fixed
/// when the factory initializes it, after checking that the token's creator is
/// the router's creator and that the router names this adapter.
contract MisthraMontraAdapter is IMisthraLaunchpadAdapter {
    using SafeTransferLib for address;

    address public factory;
    address public hook;
    address public override router;
    address public override subject;
    bytes32 public poolId;
    /// @notice The pool's quote asset; zero is native HYPE.
    address public quote;

    event Collected(bytes32 indexed poolId, uint256 amount);
    event Forwarded(address indexed asset, uint256 amount);

    error AlreadyInitialized();
    error NotFactory();
    error ForwardFailed();

    /// @dev The implementation itself can never be initialized; only clones can.
    constructor() {
        factory = address(0xdead);
    }

    function initialize(address hook_, address router_, address token_, address quote_) external {
        if (factory != address(0)) revert AlreadyInitialized();
        factory = msg.sender;
        hook = hook_;
        router = router_;
        subject = token_;
        quote = quote_;
        poolId = IMontraLaunchToken(token_).poolId();
        // The router lets its launchpad adapter bind the launched token.
        IMisthraRouterBind(router_).bind(token_);
    }

    /// @notice Native HYPE claimed from the hook (or sent by anyone) waits here
    /// until `forward` sends it to the router.
    receive() external payable { }

    function intakeAssets() external view override returns (address[] memory assets) {
        assets = new address[](1);
        assets[0] = quote;
    }

    /// @notice Claims the pool's creator fees into this adapter. Permissionless.
    /// Nothing accrued, or the hook refusing for any reason, is a no-op.
    function collect() public override returns (uint256[] memory amounts) {
        amounts = new uint256[](1);
        try IMontraLaunchHook(hook).claim(poolId, address(this)) returns (uint256 amount) {
            amounts[0] = amount;
            if (amount != 0) emit Collected(poolId, amount);
        } catch { }
    }

    /// @notice Sends this adapter's whole balance of `asset` (zero = native HYPE)
    /// to the router. Permissionless.
    function forward(address asset) public override returns (uint256 amount) {
        if (asset == address(0)) {
            amount = address(this).balance;
            if (amount == 0) return 0;
            (bool ok,) = router.call{ value: amount }("");
            if (!ok) revert ForwardFailed();
        } else {
            amount = asset.safeBalanceOf(address(this));
            if (amount == 0) return 0;
            asset.safeTransfer(router, amount);
        }
        emit Forwarded(asset, amount);
    }

    /// @notice Claim and forward in one call: what a keeper or the creator runs.
    /// The router still needs its own `sync` to account for what arrived.
    function collectAndForward() external returns (uint256 amount) {
        collect();
        amount = forward(quote);
    }
}
