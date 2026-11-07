// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Independently implemented native-HYPE account and mission escrow.
/// @dev All amounts are wei (18 decimals). No token approval, arbitrary call,
///      owner, upgrade, delegated spending, or original-service dependency.
contract ErrandBoard is EIP712, ReentrancyGuard {
    enum Phase { None, Open, Picking, Claimed, Submitted, Paid, Refunded, Expired }
    enum Kind { Post, Claim, Assign, Submit, Revise, Accept, Reject, Cancel, Raise, Withdraw, SelectWinner, ConfirmWinner }

    struct PostParams {
        uint256 reward;
        uint64 deadline;
        uint64 reviewWindow;
        uint64 claimTtl;
        address assignee;
        bool pickOnly;
        bool competition;
        uint8 maxRevisions;
        bytes32 specHash;
    }
    struct Mission {
        address poster;
        address worker;
        uint256 reward;
        uint64 deadline;
        uint64 reviewWindow;
        uint64 claimTtl;
        uint64 claimedAt;
        uint64 submittedAt;
        Phase phase;
        uint8 revisions;
        uint8 maxRevisions;
        bool pickOnly;
        bool competition;
        bytes32 specHash;
        bytes32 resultHash;
        string resultURI;
        bytes32 noteHash;
    }
    struct Action {
        address actor;
        uint8 kind;
        uint256 id;
        uint256 amount;
        address who;
        bytes32 dataHash;
        uint256 nonce;
        uint64 expiry;
    }

    uint256 public constant FEE_BPS = 250;
    uint256 public constant MAX_URI = 2048;
    uint64 public constant MAX_WINDOW = 365 days;
    uint8 public constant MAX_REVISIONS = 10;
    bytes32 public constant ACTION_TYPEHASH = keccak256("Action(address actor,uint8 kind,uint256 id,uint256 amount,address who,bytes32 dataHash,uint256 nonce,uint64 expiry)");
    address public immutable treasury;
    uint256 public nextId = 1;
    uint256 public totalAccountLiability;
    uint256 public totalEscrowLiability;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => Mission) public missions;
    mapping(address => mapping(uint256 => bool)) public nonces;

    error Unauthorized();
    error InvalidState();
    error InvalidInput();
    error InsufficientBalance();
    error TimeWindow();
    error InvalidSignature();
    error NonceUsed();
    error TransferFailed();

    event Deposited(address indexed payer, address indexed account, uint256 amount);
    event Withdrawn(address indexed account, address indexed to, uint256 amount);
    event Posted(uint256 indexed id, address indexed poster, uint256 reward, bytes32 specHash);
    event Claimed(uint256 indexed id, address indexed worker);
    event WinnerSelected(uint256 indexed id, address indexed worker, bytes32 resultHash);
    event Submitted(uint256 indexed id, address indexed worker, bytes32 resultHash, string resultURI);
    event ChangesRequested(uint256 indexed id, uint8 revision, bytes32 noteHash);
    event Raised(uint256 indexed id, uint256 amount);
    event ClaimRecovered(uint256 indexed id, Phase phase);
    event Settled(uint256 indexed id, address indexed worker, uint256 net, uint256 fee, uint256 tip);
    event Refunded(uint256 indexed id, address indexed poster, uint256 amount, Phase phase);
    event Executed(address indexed actor, uint256 indexed nonce, uint8 kind);

    constructor(address treasury_) EIP712("ErrandBoard", "1") {
        if (treasury_ == address(0) || treasury_ == address(this)) revert InvalidInput();
        treasury = treasury_;
    }

    function deposit() external payable nonReentrant { _deposit(msg.sender); }
    function depositFor(address account) external payable nonReentrant { _deposit(account); }
    function _deposit(address account) private {
        if (msg.value == 0 || account == address(0) || account == address(this)) revert InvalidInput();
        balanceOf[account] += msg.value;
        totalAccountLiability += msg.value;
        emit Deposited(msg.sender, account, msg.value);
    }

    function withdraw(uint256 amount, address payable to) external nonReentrant { _withdraw(msg.sender, amount, to); }
    function _withdraw(address actor, uint256 amount, address payable to) private {
        if (amount == 0 || to == address(0) || to == address(this)) revert InvalidInput();
        _debit(actor, amount);
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(actor, to, amount);
    }

    function quote(uint256 reward) public pure returns (uint256 net, uint256 fee) {
        // Division first avoids overflow even for an untrusted quote input.
        fee = (reward / 10000) * FEE_BPS + ((reward % 10000) * FEE_BPS) / 10000;
        net = reward - fee;
    }

    function post(PostParams calldata params) external nonReentrant returns (uint256) { return _post(msg.sender, params); }
    function _post(address actor, PostParams memory p) private returns (uint256 missionId) {
        if (p.reward == 0 || p.deadline <= block.timestamp || p.deadline > block.timestamp + MAX_WINDOW ||
            p.reviewWindow == 0 || p.reviewWindow > MAX_WINDOW || p.claimTtl == 0 || p.claimTtl > MAX_WINDOW ||
            p.maxRevisions > MAX_REVISIONS || p.specHash == bytes32(0) || p.assignee == actor ||
            p.assignee == address(this) || (p.competition && (!p.pickOnly || p.assignee != address(0)))) revert InvalidInput();
        _debit(actor, p.reward);
        totalEscrowLiability += p.reward;
        missionId = nextId++;
        Mission storage m = missions[missionId];
        m.poster = actor;
        m.reward = p.reward;
        m.deadline = p.deadline;
        m.reviewWindow = p.reviewWindow;
        m.claimTtl = p.claimTtl;
        m.maxRevisions = p.maxRevisions;
        m.pickOnly = p.pickOnly || p.assignee != address(0);
        m.competition = p.competition;
        m.specHash = p.specHash;
        m.phase = m.pickOnly ? Phase.Picking : Phase.Open;
        emit Posted(missionId, actor, p.reward, p.specHash);
        if (p.assignee != address(0)) _start(missionId, m, p.assignee);
    }

    function claim(uint256 missionId) external nonReentrant { _claim(msg.sender, missionId); }
    function _claim(address actor, uint256 missionId) private {
        Mission storage m = missions[missionId];
        if (m.phase != Phase.Open) revert InvalidState();
        if (actor == m.poster) revert Unauthorized();
        _beforeDeadline(m);
        _start(missionId, m, actor);
    }
    function assign(uint256 missionId, address worker) external nonReentrant { _assign(msg.sender, missionId, worker); }
    function _assign(address actor, uint256 missionId, address worker) private {
        Mission storage m = missions[missionId];
        _poster(actor, m);
        if (m.phase != Phase.Picking || m.competition) revert InvalidState();
        _validWorker(m, worker);
        _beforeDeadline(m);
        _start(missionId, m, worker);
    }
    function _start(uint256 missionId, Mission storage m, address worker) private {
        m.worker = worker;
        m.claimedAt = uint64(block.timestamp);
        m.phase = Phase.Claimed;
        emit Claimed(missionId, worker);
    }

    function selectWinner(uint256 missionId, address worker, bytes32 resultHash) external nonReentrant { _selectWinner(msg.sender, missionId, worker, resultHash); }
    function _selectWinner(address actor, uint256 missionId, address worker, bytes32 resultHash) private {
        Mission storage m = missions[missionId];
        _poster(actor, m);
        if (m.phase != Phase.Picking || !m.competition || m.worker != address(0)) revert InvalidState();
        if (block.timestamp >= uint256(m.deadline) + m.reviewWindow) revert TimeWindow();
        _validWorker(m, worker);
        if (resultHash == bytes32(0)) revert InvalidInput();
        m.worker = worker;
        m.claimedAt = uint64(block.timestamp);
        m.resultHash = resultHash;
        emit WinnerSelected(missionId, worker, resultHash);
    }
    function confirmWinner(uint256 missionId, string calldata resultURI, bytes32 resultHash) external nonReentrant { _confirmWinner(msg.sender, missionId, resultURI, resultHash); }
    function _confirmWinner(address actor, uint256 missionId, string memory resultURI, bytes32 resultHash) private {
        Mission storage m = missions[missionId];
        if (m.phase != Phase.Picking || !m.competition) revert InvalidState();
        if (actor != m.worker) revert Unauthorized();
        if (m.resultHash != resultHash) revert InvalidInput();
        if (block.timestamp >= uint256(m.claimedAt) + m.claimTtl) revert TimeWindow();
        _recordSubmission(missionId, m, resultURI, resultHash);
    }

    function submit(uint256 missionId, string calldata resultURI, bytes32 resultHash) external nonReentrant { _submit(msg.sender, missionId, resultURI, resultHash); }
    function _submit(address actor, uint256 missionId, string memory resultURI, bytes32 resultHash) private {
        Mission storage m = missions[missionId];
        if (m.phase != Phase.Claimed) revert InvalidState();
        if (actor != m.worker) revert Unauthorized();
        _beforeDeadline(m);
        if (block.timestamp >= uint256(m.claimedAt) + m.claimTtl) revert TimeWindow();
        _recordSubmission(missionId, m, resultURI, resultHash);
    }
    function _recordSubmission(uint256 missionId, Mission storage m, string memory resultURI, bytes32 resultHash) private {
        if (bytes(resultURI).length == 0 || bytes(resultURI).length > MAX_URI || resultHash == bytes32(0)) revert InvalidInput();
        m.resultURI = resultURI;
        m.resultHash = resultHash;
        m.submittedAt = uint64(block.timestamp);
        m.phase = Phase.Submitted;
        emit Submitted(missionId, m.worker, resultHash, resultURI);
    }
    function requestChanges(uint256 missionId, bytes32 noteHash) external nonReentrant { _requestChanges(msg.sender, missionId, noteHash); }
    function _requestChanges(address actor, uint256 missionId, bytes32 noteHash) private {
        Mission storage m = missions[missionId];
        _poster(actor, m);
        _reviewing(m);
        if (m.revisions >= m.maxRevisions || noteHash == bytes32(0)) revert InvalidInput();
        ++m.revisions;
        m.noteHash = noteHash;
        m.claimedAt = uint64(block.timestamp);
        uint64 revisionDeadline = uint64(block.timestamp + m.claimTtl);
        if (m.deadline < revisionDeadline) m.deadline = revisionDeadline;
        m.phase = Phase.Claimed;
        emit ChangesRequested(missionId, m.revisions, noteHash);
    }

    function accept(uint256 missionId, uint256 tip) external nonReentrant { _accept(msg.sender, missionId, tip); }
    function _accept(address actor, uint256 missionId, uint256 tip) private {
        Mission storage m = missions[missionId];
        _poster(actor, m);
        if (m.phase != Phase.Submitted) revert InvalidState();
        if (tip != 0) _debit(actor, tip);
        _settle(missionId, m, tip);
    }
    function finalize(uint256 missionId) external nonReentrant {
        Mission storage m = missions[missionId];
        if (m.phase != Phase.Submitted) revert InvalidState();
        if (block.timestamp < uint256(m.submittedAt) + m.reviewWindow) revert TimeWindow();
        _settle(missionId, m, 0);
    }
    function _settle(uint256 missionId, Mission storage m, uint256 tip) private {
        m.phase = Phase.Paid;
        totalEscrowLiability -= m.reward;
        (uint256 net, uint256 fee) = quote(m.reward);
        _credit(m.worker, net + tip);
        _credit(treasury, fee);
        emit Settled(missionId, m.worker, net, fee, tip);
    }
    function reject(uint256 missionId) external nonReentrant { _reject(msg.sender, missionId); }
    function _reject(address actor, uint256 missionId) private {
        Mission storage m = missions[missionId];
        _poster(actor, m);
        _reviewing(m);
        _refund(missionId, m, Phase.Refunded);
    }
    function cancel(uint256 missionId) external nonReentrant { _cancel(msg.sender, missionId); }
    function _cancel(address actor, uint256 missionId) private {
        Mission storage m = missions[missionId];
        _poster(actor, m);
        if (m.phase != Phase.Open && m.phase != Phase.Picking) revert InvalidState();
        if (m.competition && m.worker != address(0)) revert InvalidState();
        _refund(missionId, m, Phase.Refunded);
    }
    function raise(uint256 missionId, uint256 amount) external nonReentrant { _raise(msg.sender, missionId, amount); }
    function _raise(address actor, uint256 missionId, uint256 amount) private {
        Mission storage m = missions[missionId];
        _poster(actor, m);
        if (m.phase != Phase.Open && m.phase != Phase.Picking && m.phase != Phase.Claimed && m.phase != Phase.Submitted) revert InvalidState();
        if (amount == 0) revert InvalidInput();
        if (m.phase == Phase.Submitted) _reviewing(m); else _beforeDeadline(m);
        _debit(actor, amount);
        totalEscrowLiability += amount;
        m.reward += amount;
        emit Raised(missionId, amount);
    }
    function expire(uint256 missionId) external nonReentrant {
        Mission storage m = missions[missionId];
        if (m.phase != Phase.Open && m.phase != Phase.Picking && m.phase != Phase.Claimed) revert InvalidState();
        uint256 expiresAt = m.deadline;
        if (m.competition) {
            // Selection has its own window; a selected winner gets a full TTL.
            expiresAt = m.worker == address(0)
                ? uint256(m.deadline) + m.reviewWindow
                : uint256(m.claimedAt) + m.claimTtl;
        }
        if (block.timestamp < expiresAt) revert TimeWindow();
        _refund(missionId, m, Phase.Expired);
    }
    function recoverClaim(uint256 missionId) external nonReentrant {
        Mission storage m = missions[missionId];
        if (m.phase != Phase.Claimed) revert InvalidState();
        if (m.competition) {
            if (block.timestamp < uint256(m.claimedAt) + m.claimTtl) revert TimeWindow();
            _refund(missionId, m, Phase.Expired);
        } else if (block.timestamp >= m.deadline) {
            _refund(missionId, m, Phase.Expired);
        } else {
            if (block.timestamp < uint256(m.claimedAt) + m.claimTtl) revert TimeWindow();
            m.phase = m.pickOnly ? Phase.Picking : Phase.Open;
            m.worker = address(0);
            m.claimedAt = 0;
            // Revision limits apply to the mission, including replacement workers.
            m.submittedAt = 0;
            m.resultHash = bytes32(0);
            delete m.resultURI;
            m.noteHash = bytes32(0);
        }
        emit ClaimRecovered(missionId, m.phase);
    }
    function _refund(uint256 missionId, Mission storage m, Phase phase) private {
        m.phase = phase;
        totalEscrowLiability -= m.reward;
        _credit(m.poster, m.reward);
        emit Refunded(missionId, m.poster, m.reward, phase);
    }

    /// @notice Relays a bounded typed action; never executes arbitrary calldata.
    /// @dev Each actor chooses one-use nonces. Failed actions revert nonce consumption.
    function execute(Action calldata a, bytes calldata data, bytes calldata signature) external nonReentrant returns (uint256 postedId) {
        if (block.timestamp >= a.expiry) revert TimeWindow();
        if (a.actor == address(0) || keccak256(data) != a.dataHash) revert InvalidSignature();
        if (nonces[a.actor][a.nonce]) revert NonceUsed();
        bytes32 structHash = keccak256(abi.encode(ACTION_TYPEHASH, a.actor, a.kind, a.id, a.amount, a.who, a.dataHash, a.nonce, a.expiry));
        if (ECDSA.recover(_hashTypedDataV4(structHash), signature) != a.actor) revert InvalidSignature();
        nonces[a.actor][a.nonce] = true;
        Kind kind = Kind(a.kind);
        if (kind == Kind.Post) postedId = _post(a.actor, abi.decode(data, (PostParams)));
        else if (kind == Kind.Claim) _claim(a.actor, a.id);
        else if (kind == Kind.Assign) _assign(a.actor, a.id, a.who);
        else if (kind == Kind.Submit) {
            (string memory uri, bytes32 hash) = abi.decode(data, (string, bytes32));
            _submit(a.actor, a.id, uri, hash);
        } else if (kind == Kind.Revise) _requestChanges(a.actor, a.id, abi.decode(data, (bytes32)));
        else if (kind == Kind.Accept) _accept(a.actor, a.id, a.amount);
        else if (kind == Kind.Reject) _reject(a.actor, a.id);
        else if (kind == Kind.Cancel) _cancel(a.actor, a.id);
        else if (kind == Kind.Raise) _raise(a.actor, a.id, a.amount);
        else if (kind == Kind.Withdraw) _withdraw(a.actor, a.amount, payable(a.who));
        else if (kind == Kind.SelectWinner) _selectWinner(a.actor, a.id, a.who, abi.decode(data, (bytes32)));
        else if (kind == Kind.ConfirmWinner) {
            (string memory uri, bytes32 hash) = abi.decode(data, (string, bytes32));
            _confirmWinner(a.actor, a.id, uri, hash);
        }
        emit Executed(a.actor, a.nonce, a.kind);
    }

    function _debit(address actor, uint256 amount) private {
        if (balanceOf[actor] < amount) revert InsufficientBalance();
        balanceOf[actor] -= amount;
        totalAccountLiability -= amount;
    }
    function _credit(address actor, uint256 amount) private {
        balanceOf[actor] += amount;
        totalAccountLiability += amount;
    }
    function _poster(address actor, Mission storage m) private view {
        if (actor != m.poster || m.poster == address(0)) revert Unauthorized();
    }
    function _validWorker(Mission storage m, address worker) private view {
        if (worker == address(0) || worker == m.poster || worker == address(this)) revert InvalidInput();
    }
    function _beforeDeadline(Mission storage m) private view { if (block.timestamp >= m.deadline) revert TimeWindow(); }
    function _reviewing(Mission storage m) private view {
        if (m.phase != Phase.Submitted) revert InvalidState();
        if (block.timestamp >= uint256(m.submittedAt) + m.reviewWindow) revert TimeWindow();
    }
}
