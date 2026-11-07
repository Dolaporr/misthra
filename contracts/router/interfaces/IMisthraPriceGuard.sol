// SPDX-License-Identifier: Apache-2.0
// Modified by Misthra, 2026-11-07, from Sinjoh-Finance/sinjoh-contracts
// (sinjoh-fee-router/src/interfaces/ISinjohPriceGuard.sol, Apache-2.0). Changes: renamed for Misthra on Elysium; the wrapped
// native asset is WHYPE instead of WETH. See NOTICE.
pragma solidity 0.8.28;

interface IMisthraPriceGuard {
    function minimumOutput(
        address subject,
        address assetIn,
        address assetOut,
        uint256 amountIn,
        bytes32 routeHash,
        bytes calldata guardData
    ) external view returns (uint256 minOut, uint48 validUntil);
}
