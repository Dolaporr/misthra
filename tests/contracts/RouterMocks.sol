// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

// Test-only doubles for the Misthra fee router suite. Never deploy these.

contract MockWHYPE {
    string public constant name = "Wrapped HYPE";
    string public constant symbol = "WHYPE";
    uint8 public constant decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    receive() external payable { deposit(); }

    function deposit() public payable { balanceOf[msg.sender] += msg.value; }

    function withdraw(uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        (bool ok,) = msg.sender.call{ value: amount }("");
        require(ok, "send");
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        return transferFrom(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        if (from != msg.sender) allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);

    constructor(string memory name_, string memory symbol_) {
        name = name_;
        symbol = symbol_;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        return transferFrom(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        if (from != msg.sender) allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

/// @notice SwapRouter02-shaped exactInputSingle at a fixed, settable rate.
contract MockV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    uint256 public rateNumerator = 1;
    uint256 public rateDenominator = 1;

    function setRate(uint256 numerator, uint256 denominator) external {
        rateNumerator = numerator;
        rateDenominator = denominator;
    }

    function exactInputSingle(ExactInputSingleParams calldata p)
        external
        payable
        returns (uint256 amountOut)
    {
        MockToken(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        amountOut = p.amountIn * rateNumerator / rateDenominator;
        require(amountOut >= p.amountOutMinimum, "Too little received");
        MockToken(p.tokenOut).transfer(p.recipient, amountOut);
    }
}

contract MockPriceGuard {
    uint256 public minimum;
    uint48 public lifetime = 300;

    function set(uint256 minimum_, uint48 lifetime_) external {
        minimum = minimum_;
        lifetime = lifetime_;
    }

    function minimumOutput(address, address, address, uint256, bytes32, bytes calldata)
        external
        view
        returns (uint256, uint48)
    {
        return (minimum, uint48(block.timestamp) + lifetime);
    }
}

contract MockSink {
    uint256 public total;

    function fund(address, address asset, uint256 amount, bytes calldata)
        external
        payable
        returns (uint256)
    {
        MockToken(asset).transferFrom(msg.sender, address(this), amount);
        total += amount;
        return amount;
    }
}

/// @notice Just enough of a Uniswap v3 pool and factory for the TWAP guard.
contract MockV3Factory {
    mapping(bytes32 => address) public pools;

    function setPool(address a, address b, uint24 fee, address pool) external {
        pools[keccak256(abi.encode(a, b, fee))] = pool;
        pools[keccak256(abi.encode(b, a, fee))] = pool;
    }

    function feeAmountTickSpacing(uint24 fee) external pure returns (int24) {
        return fee == 10_000 ? int24(200) : fee == 3000 ? int24(60) : int24(0);
    }

    function getPool(address a, address b, uint24 fee) external view returns (address) {
        return pools[keccak256(abi.encode(a, b, fee))];
    }
}

contract MockV3Pool {
    address public immutable factory;
    address public immutable token0;
    address public immutable token1;
    uint24 public immutable fee;
    int24 public spotTick;
    int24 public twapTick;
    uint16 public cardinality = 1;

    constructor(address factory_, address a, address b, uint24 fee_) {
        factory = factory_;
        (token0, token1) = a < b ? (a, b) : (b, a);
        fee = fee_;
    }

    function setTicks(int24 spot, int24 twap) external {
        spotTick = spot;
        twapTick = twap;
    }

    function increaseObservationCardinalityNext(uint16) external {
        cardinality = 2;
    }

    function slot0()
        external
        view
        returns (uint160, int24, uint16, uint16, uint16, uint8, bool)
    {
        return (0, spotTick, 0, cardinality, cardinality, 0, true);
    }

    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory liquidity)
    {
        tickCumulatives = new int56[](2);
        liquidity = new uint160[](2);
        tickCumulatives[0] = 0;
        tickCumulatives[1] = int56(twapTick) * int56(uint56(secondsAgos[0]));
    }
}
