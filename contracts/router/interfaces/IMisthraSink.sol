// SPDX-License-Identifier: Apache-2.0
// Modified by Misthra, 2026-11-07, from Sinjoh-Finance/sinjoh-contracts
// (sinjoh-fee-router/src/interfaces/ISinjohSink.sol, Apache-2.0). Changes: renamed for Misthra on Elysium; the wrapped
// native asset is WHYPE instead of WETH. See NOTICE.
pragma solidity 0.8.28;

interface IMisthraSink {
    function fund(address subject, address asset, uint256 amount, bytes calldata config)
        external
        payable
        returns (uint256 received);
}
