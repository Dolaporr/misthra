// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { SafeTransferLib } from "../router/libraries/SafeTransferLib.sol";

interface IWHYPE {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
}

interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

/// @notice Misthra terminal trades: one Uniswap v3 swap through SwapRouter02 with
/// a fixed platform fee taken in HYPE in the same transaction.
///
/// @dev Non-custodial. The trader signs every call; the gateway holds nothing
/// between transactions, approves the swap router for the exact amount and
/// resets it, and checks every minimum against balances it measured itself.
/// The fee and its recipient are immutable; a different fee means a new
/// gateway. Buys pay the fee from the HYPE sent; sells pay it from the HYPE
/// received, so the fee is always in HYPE and never in the traded token.
contract MisthraTradeGateway {
    using SafeTransferLib for address;

    uint16 public constant BPS = 10_000;
    uint16 public constant MAX_FEE_BPS = 100; // 1%

    address public immutable swapRouter;
    address public immutable whype;
    address public immutable feeRecipient;
    uint16 public immutable feeBps;

    error InvalidConfiguration();
    error InvalidAmount();
    error Expired();
    error InsufficientOutput(uint256 minimum, uint256 actual);
    error Reentrancy();
    error UnexpectedSender();

    event Trade(
        address indexed trader,
        address indexed token,
        bool indexed isBuy,
        uint256 hypeAmount,
        uint256 tokenAmount,
        uint256 fee
    );

    uint256 private _lock = 1;

    modifier nonReentrant() {
        if (_lock == 2) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address swapRouter_, address whype_, address feeRecipient_, uint16 feeBps_) {
        if (
            swapRouter_.code.length == 0 || whype_.code.length == 0 || feeRecipient_ == address(0)
                || feeBps_ > MAX_FEE_BPS
        ) revert InvalidConfiguration();
        swapRouter = swapRouter_;
        whype = whype_;
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
    }

    /// @dev Only WHYPE unwrapping may send native HYPE here.
    receive() external payable {
        if (msg.sender != whype) revert UnexpectedSender();
    }

    /// @notice Buy `token` with the HYPE sent. The fee comes off the top; the
    /// rest is swapped and delivered straight to the trader.
    function buy(address token, uint24 poolFee, uint256 minTokensOut, uint256 deadline)
        external
        payable
        nonReentrant
        returns (uint256 tokensOut)
    {
        if (block.timestamp > deadline) revert Expired();
        if (msg.value == 0 || token == whype || token == address(0)) revert InvalidAmount();
        uint256 fee = msg.value * feeBps / BPS;
        uint256 amountIn = msg.value - fee;

        IWHYPE(whype).deposit{ value: amountIn }();
        whype.safeApprove(swapRouter, amountIn);
        uint256 before = token.safeBalanceOf(msg.sender);
        ISwapRouter02(swapRouter)
            .exactInputSingle(
                ISwapRouter02.ExactInputSingleParams({
                    tokenIn: whype,
                    tokenOut: token,
                    fee: poolFee,
                    recipient: msg.sender,
                    amountIn: amountIn,
                    amountOutMinimum: minTokensOut,
                    sqrtPriceLimitX96: 0
                })
            );
        whype.safeApprove(swapRouter, 0);
        tokensOut = token.safeBalanceOf(msg.sender) - before;
        if (tokensOut == 0 || tokensOut < minTokensOut) {
            revert InsufficientOutput(minTokensOut, tokensOut);
        }
        if (fee != 0) SafeTransferLib.safeTransferETH(feeRecipient, fee);
        emit Trade(msg.sender, token, true, msg.value, tokensOut, fee);
    }

    /// @notice Sell `amountIn` of `token` (approved to this gateway) for HYPE.
    /// `minHypeOut` is what the trader receives after the fee.
    function sell(
        address token,
        uint24 poolFee,
        uint256 amountIn,
        uint256 minHypeOut,
        uint256 deadline
    ) external nonReentrant returns (uint256 hypeOut) {
        if (block.timestamp > deadline) revert Expired();
        if (amountIn == 0 || token == whype || token == address(0)) revert InvalidAmount();

        uint256 tokenBefore = token.safeBalanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amountIn);
        uint256 received = token.safeBalanceOf(address(this)) - tokenBefore;
        if (received == 0) revert InvalidAmount();

        uint256 whypeBefore = IWHYPE(whype).balanceOf(address(this));
        token.safeApprove(swapRouter, received);
        ISwapRouter02(swapRouter)
            .exactInputSingle(
                ISwapRouter02.ExactInputSingleParams({
                    tokenIn: token,
                    tokenOut: whype,
                    fee: poolFee,
                    recipient: address(this),
                    amountIn: received,
                    amountOutMinimum: minHypeOut,
                    sqrtPriceLimitX96: 0
                })
            );
        token.safeApprove(swapRouter, 0);
        uint256 gross = IWHYPE(whype).balanceOf(address(this)) - whypeBefore;
        IWHYPE(whype).withdraw(gross);
        uint256 fee = gross * feeBps / BPS;
        hypeOut = gross - fee;
        if (hypeOut == 0 || hypeOut < minHypeOut) revert InsufficientOutput(minHypeOut, hypeOut);
        SafeTransferLib.safeTransferETH(msg.sender, hypeOut);
        if (fee != 0) SafeTransferLib.safeTransferETH(feeRecipient, fee);
        emit Trade(msg.sender, token, false, gross, received, fee);
    }
}
