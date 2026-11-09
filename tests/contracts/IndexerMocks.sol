// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { MockToken } from "./RouterMocks.sol";

// Test-only: emits the Uniswap v3 events the indexer reads. Never deploy.
contract MockEventPool {
    event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick);
    address public immutable token0;
    address public immutable token1;

    constructor(address a, address b) { (token0, token1) = a < b ? (a, b) : (b, a); }

    function swap(int256 amount0, int256 amount1, address recipient) external {
        emit Swap(msg.sender, recipient, amount0, amount1, 0, 0, 0);
    }
}

contract MockEventFactory {
    event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool);

    function createPool(address a, address b, uint24 fee) public returns (address pool) {
        pool = address(new MockEventPool(a, b));
        (address t0, address t1) = a < b ? (a, b) : (b, a);
        emit PoolCreated(t0, t1, fee, 200, pool);
    }
}

/// @notice A launchpad: deploys a token, mints it, and opens its WHYPE pool in one call.
contract MockPad {
    function launch(MockEventFactory factory, address whype, string calldata name, string calldata symbol) external returns (address token, address pool) {
        MockToken t = new MockToken(name, symbol);
        token = address(t);
        pool = factory.createPool(token, whype, 10000);
        t.mint(pool, 800_000_000 ether);
        t.mint(msg.sender, 200_000_000 ether);
    }
}

/// @notice Montra-style launcher: emits TokenLaunched with the shape Montra documents.
contract MockMontraFactory {
    event TokenLaunched(address indexed token, address indexed creator, bytes32 indexed poolId, uint256 configId, address quote, bool quoteIsCurrency0, uint256 supply, int24 startTick, address feeRecipient, bool feeLocked, uint256 firstBuyIn, uint256 firstBuyOut);

    function launch(string calldata name, string calldata symbol, string calldata image, bytes32 poolId, address quote, address feeRecipient, address holder) external returns (address token) {
        image; // carried in calldata only, like Montra
        MockToken t = new MockToken(name, symbol);
        token = address(t);
        t.mint(holder, 1_000_000_000 ether);
        // Native HYPE is v4 currency address(0), which always sorts first.
        bool quoteIs0 = quote == address(0) || quote < token;
        emit TokenLaunched(token, msg.sender, poolId, 1, quote, quoteIs0, 1_000_000_000 ether, 0, feeRecipient, true, 0, 0);
    }
}

/// @notice Emits Uniswap v4 PoolManager Swap events (swapper-side amounts).
contract MockV4PoolManager {
    event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee);

    function swap(bytes32 id, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity) external {
        emit Swap(id, msg.sender, amount0, amount1, sqrtPriceX96, liquidity, 0, 10000);
    }
}
