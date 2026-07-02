// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SalvageRecoveryRouter
 * @notice Non-custodial settlement for recovered stranded tokens.
 *
 * Flow:
 *   1. Victim signs an EIP-712 RecoveryClaim (binding token, victim, finder,
 *      loss tx hash, deadline) — anyone may submit it via registerClaim().
 *   2. Each claim gets a deterministic CREATE2 receiver address. The stuck
 *      contract's owner rescues tokens INTO that receiver — never into a
 *      shared pot, so claims can never be confused or cross-drained.
 *   3. settle(claimId) is permissionless: it sweeps the receiver and splits
 *      by the fee schedule frozen at registration. Front-running settle is
 *      harmless — payout addresses and splits are immutable per claim.
 *
 * Fee schedule (frozen per claim at registration):
 *   - Victim-initiated (finder == address(0)):  95% victim · 5% protocol
 *   - Finder-brokered:                          90% victim · 7% finder · 3% protocol
 *
 * Security properties:
 *   - No admin function can touch claim funds or receivers. The owner can
 *     only change where FUTURE protocol fees are sent (two-step ownership).
 *   - Non-upgradeable, no external dependencies, no delegatecall.
 *   - Balance-delta accounting: fee-on-transfer tokens split correctly.
 *   - Residual-safe: settle() may be called again if more tokens arrive
 *     at a claim's receiver after the first settlement.
 */

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

/// @notice Minimal per-claim deposit receiver. Deployed via CREATE2 at
/// settlement time; only the router can sweep it.
contract ClaimReceiver {
    address public immutable router;

    constructor() {
        router = msg.sender;
    }

    function sweep(address token) external returns (uint256 amount) {
        require(msg.sender == router, "not router");
        amount = IERC20(token).balanceOf(address(this));
        if (amount > 0) {
            _safeTransfer(token, router, amount);
        }
    }

    function _safeTransfer(address token, address to, uint256 value) private {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, value));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "transfer failed");
    }
}

contract SalvageRecoveryRouter {

    // ── Fee constants (basis points)
    uint256 public constant VICTIM_PROTOCOL_BPS = 500; // 5% when self-recovered
    uint256 public constant FINDER_PROTOCOL_BPS = 300; // 3% when finder-brokered
    uint256 public constant FINDER_FEE_BPS      = 700; // 7% finder fee
    uint256 public constant BPS_DENOMINATOR     = 10_000;

    // ── EIP-712
    bytes32 private constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant CLAIM_TYPEHASH = keccak256(
        "RecoveryClaim(address token,address victim,address finder,bytes32 lossTxHash,uint256 deadline)"
    );
    bytes32 public immutable DOMAIN_SEPARATOR;

    // ── Ownership (two-step; controls ONLY the protocol fee recipient)
    address public owner;
    address public pendingOwner;
    address public protocolFeeRecipient;

    // ── Claims
    struct Claim {
        address token;
        address victim;
        address finder;       // address(0) = victim-initiated
        bytes32 lossTxHash;
        uint64  createdAt;
        uint256 totalSettled;
    }
    mapping(bytes32 => Claim) public claims;

    // ── Reentrancy guard
    uint256 private _locked = 1;
    modifier nonReentrant() {
        require(_locked == 1, "reentrancy");
        _locked = 2;
        _;
        _locked = 1;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    // ── Events
    event ClaimRegistered(
        bytes32 indexed claimId,
        address indexed token,
        address indexed victim,
        address finder,
        bytes32 lossTxHash,
        address receiver
    );
    event ClaimSettled(
        bytes32 indexed claimId,
        uint256 amount,
        uint256 victimPayout,
        uint256 finderPayout,
        uint256 protocolPayout
    );
    event ProtocolFeeRecipientChanged(address indexed previous, address indexed current);
    event OwnershipTransferStarted(address indexed previous, address indexed pending);
    event OwnershipTransferred(address indexed previous, address indexed current);

    constructor(address _protocolFeeRecipient) {
        require(_protocolFeeRecipient != address(0), "zero recipient");
        owner = msg.sender;
        protocolFeeRecipient = _protocolFeeRecipient;
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            DOMAIN_TYPEHASH,
            keccak256(bytes("SalvageRecoveryRouter")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
    }

    // ═══════════════════════════════════════════════════════════
    //  Claims
    // ═══════════════════════════════════════════════════════════

    /// @notice Register a recovery claim, authorized by the victim's EIP-712
    /// signature. Anyone may submit (relayer-friendly); the signature binds
    /// every economic parameter, so submission cannot alter outcomes.
    function registerClaim(
        address token,
        address victim,
        address finder,
        bytes32 lossTxHash,
        uint256 deadline,
        bytes calldata victimSignature
    ) external returns (bytes32 claimId, address receiver) {
        require(token  != address(0), "zero token");
        require(victim != address(0), "zero victim");
        require(finder != victim,     "finder is victim");
        require(block.timestamp <= deadline, "signature expired");

        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(CLAIM_TYPEHASH, token, victim, finder, lossTxHash, deadline))
        ));
        require(_recover(digest, victimSignature) == victim, "invalid signature");

        claimId = keccak256(abi.encode(token, victim, finder, lossTxHash));
        require(claims[claimId].victim == address(0), "claim exists");

        claims[claimId] = Claim({
            token:        token,
            victim:       victim,
            finder:       finder,
            lossTxHash:   lossTxHash,
            createdAt:    uint64(block.timestamp),
            totalSettled: 0
        });

        receiver = claimReceiver(claimId);
        emit ClaimRegistered(claimId, token, victim, finder, lossTxHash, receiver);
    }

    /// @notice Deterministic deposit address for a claim. The stuck
    /// contract's owner rescues tokens to this address.
    function claimReceiver(bytes32 claimId) public view returns (address) {
        bytes32 initCodeHash = keccak256(type(ClaimReceiver).creationCode);
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff), address(this), claimId, initCodeHash
        )))));
    }

    /// @notice Permissionless settlement. Sweeps the claim's receiver and
    /// splits by the schedule frozen at registration. Callable again if
    /// residual tokens arrive later.
    function settle(bytes32 claimId) external nonReentrant {
        Claim storage c = claims[claimId];
        require(c.victim != address(0), "unknown claim");

        address receiverAddr = claimReceiver(claimId);
        ClaimReceiver receiver;
        if (receiverAddr.code.length == 0) {
            receiver = new ClaimReceiver{salt: claimId}();
            require(address(receiver) == receiverAddr, "create2 mismatch");
        } else {
            receiver = ClaimReceiver(receiverAddr);
        }

        // Balance-delta accounting — correct for fee-on-transfer tokens
        uint256 before = IERC20(c.token).balanceOf(address(this));
        receiver.sweep(c.token);
        uint256 amount = IERC20(c.token).balanceOf(address(this)) - before;
        require(amount > 0, "nothing to settle");

        uint256 protocolBps = c.finder == address(0) ? VICTIM_PROTOCOL_BPS : FINDER_PROTOCOL_BPS;
        uint256 protocolCut = (amount * protocolBps) / BPS_DENOMINATOR;
        uint256 finderCut   = c.finder == address(0)
            ? 0
            : (amount * FINDER_FEE_BPS) / BPS_DENOMINATOR;
        uint256 victimPayout = amount - protocolCut - finderCut;

        c.totalSettled += amount;

        _safeTransfer(c.token, c.victim, victimPayout);
        if (finderCut > 0) _safeTransfer(c.token, c.finder, finderCut);
        if (protocolCut > 0) _safeTransfer(c.token, protocolFeeRecipient, protocolCut);

        emit ClaimSettled(claimId, amount, victimPayout, finderCut, protocolCut);
    }

    // ═══════════════════════════════════════════════════════════
    //  Admin — protocol fee recipient only; claims are untouchable
    // ═══════════════════════════════════════════════════════════

    function setProtocolFeeRecipient(address recipient) external onlyOwner {
        require(recipient != address(0), "zero recipient");
        emit ProtocolFeeRecipientChanged(protocolFeeRecipient, recipient);
        protocolFeeRecipient = recipient;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    // ═══════════════════════════════════════════════════════════
    //  Internal
    // ═══════════════════════════════════════════════════════════

    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address) {
        require(sig.length == 65, "bad sig length");
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8   v = uint8(sig[64]);
        // Reject malleable signatures (EIP-2)
        require(uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0, "bad s");
        require(v == 27 || v == 28, "bad v");
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "bad signature");
        return signer;
    }

    function _safeTransfer(address token, address to, uint256 value) private {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, value));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "transfer failed");
    }
}