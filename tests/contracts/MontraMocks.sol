// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import { Clones } from "../../contracts/router/libraries/Clones.sol";

/// @notice Stands in for Montra's LaunchToken master: only its factory can initialize a clone.
contract MockMontraToken {
    address public factory;
    address public creator;
    address public hook;
    bytes32 public poolId;
    function setUp(address factory_) external { require(factory == address(0)); factory = factory_; }
    function init(address creator_, address hook_, bytes32 poolId_) external {
        require(msg.sender == factory && creator == address(0), "not factory");
        creator = creator_; hook = hook_; poolId = poolId_;
    }
}

/// @notice Launches EIP-1167 clones of the token master, the creator being msg.sender, like Montra.
contract MockMontraLaunchFactory {
    address public immutable master;
    address public immutable hook;
    constructor(address master_, address hook_) { master = master_; hook = hook_; }
    function launch(bytes32 salt, address recipient) external returns (address token, bytes32 poolId) {
        token = Clones.cloneDeterministic(master, keccak256(abi.encode(msg.sender, salt)));
        MockMontraToken(token).setUp(address(this));
        poolId = keccak256(abi.encode(token));
        MockMontraToken(token).init(msg.sender, hook, poolId);
        MockMontraHook(payable(hook)).register(poolId, recipient);
    }
}

/// @notice Holds creator fees per pool until the pool's recipient claims them, like Montra's hook.
contract MockMontraHook {
    mapping(bytes32 => address) public recipient;
    mapping(bytes32 => uint256) public tab;
    function register(bytes32 poolId, address r) external { recipient[poolId] = r; }
    function accrue(bytes32 poolId) external payable { tab[poolId] += msg.value; }
    function updateRecipient(bytes32 poolId, address r) external { require(msg.sender == recipient[poolId], "not recipient"); recipient[poolId] = r; }
    function claim(bytes32 poolId, address to) external returns (uint256 amount) {
        require(msg.sender == recipient[poolId], "not recipient");
        amount = tab[poolId]; tab[poolId] = 0;
        (bool ok,) = to.call{ value: amount }(""); require(ok);
    }
}

/// @notice A contract that pretends to be a Montra token naming a victim as creator.
contract FakeMontraToken {
    address public creator; address public hook; bytes32 public poolId;
    constructor(address creator_, address hook_) { creator = creator_; hook = hook_; poolId = bytes32(uint256(1)); }
}

/// @notice Montra's factory with the real launch(LaunchParams) ABI, for testing the planner.
contract MockMontraFactoryFull {
    struct Socials { string telegram; string twitter; string discord; string website; string extra; }
    struct Profile { string logo; string description; Socials socials; }
    struct Permit { uint256 deadline; uint8 v; bytes32 r; bytes32 s; }
    struct LaunchParams { string name; string symbol; string metadataURI; Profile profile; uint256 configId; uint256 supply; bytes32 salt; address[] feeRecipients; uint16[] feeShares; uint256 firstBuyAmount; uint256 firstBuyMinOut; Permit permit; }
    struct LaunchConfig { uint256 moduleSetId; address quote; uint256 baseSupply; int24 tickSpacing; int24 startTick; uint24 graduationTicks; uint24 lpLineTicks; uint24 totalFeePips; uint24 totalFeeMinPips; uint24 protocolFeePips; uint24 lpFeePips; uint24 earlyBuyFeeStartPips; uint32 earlyBuyFeeWindow; address liquidityPolicy; bool liquiditySealed; uint32 streamDuration; uint16 pushBountyBps; uint128 pushFloor; bool enabled; bool exists; }

    address public immutable master;
    address public immutable hook;
    uint256 public launchFee = 0.01 ether;
    bool public launchEnabled = true;
    bytes public lastData;
    string public lastName;
    uint256 public lastValue;
    constructor(address master_, address hook_) { master = master_; hook = hook_; }

    struct ModuleSet { address hook; address tokenMaster; address splitterMaster; bool exists; }
    function getModuleSet(uint256) external view returns (ModuleSet memory) { return ModuleSet(hook, master, address(0), true); }
    function configCount() external pure returns (uint256) { return 2; }
    function getConfig(uint256 id) public pure returns (LaunchConfig memory c) {
        if (id > 1) return c;
        c.quote = address(0); c.baseSupply = 1e27; c.totalFeePips = 10000; c.protocolFeePips = 4000; c.lpFeePips = 2000;
        c.enabled = id == 0; c.exists = true;
    }
    function predictTokenAddress(address sender, bytes32 salt, uint256 configId) public view returns (address) {
        return Clones.predictDeterministicAddress(master, keccak256(abi.encode(sender, salt, configId)), address(this));
    }
    function launch(LaunchParams calldata p) external payable returns (address token, bytes32 poolId) {
        LaunchConfig memory c = getConfig(p.configId);
        require(c.enabled && launchEnabled, "config");
        require(p.supply == c.baseSupply, "supply");
        require(msg.value == launchFee + p.firstBuyAmount, "value");
        require(p.feeRecipients.length == 1 && p.feeShares[0] == 10000, "route");
        token = Clones.cloneDeterministic(master, keccak256(abi.encode(msg.sender, p.salt, p.configId)));
        MockMontraToken(token).setUp(address(this));
        poolId = keccak256(abi.encode(token));
        MockMontraToken(token).init(msg.sender, hook, poolId);
        MockMontraHook(payable(hook)).register(poolId, p.feeRecipients[0]);
        lastData = msg.data; lastName = p.name; lastValue = msg.value;
    }
}
