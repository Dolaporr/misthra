// SPDX-License-Identifier: Apache-2.0
// Modified by Misthra, 2026-11-08, from Sinjoh-Finance/sinjoh-contracts
// (sinjoh-liquidity-manager/src/interfaces/ISinjohPriceGuard.sol, Apache-2.0).
// Changes: renamed. This is the liquidity-manager variant, a superset of the
// fee-router one, so one interface covers the router and both guards.
pragma solidity 0.8.28;

interface IMisthraPriceGuard {
    function validatePoolPrice(
        address subject,
        address assetIn,
        address assetOut,
        uint160 venueSqrtPriceX96
    ) external view;

    function minimumOutput(
        address subject,
        address assetIn,
        address assetOut,
        uint256 amountIn,
        bytes32 routeHash,
        bytes calldata guardData
    ) external view returns (uint256 minOut, uint48 validUntil);
}
