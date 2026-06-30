// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SalvageFeeContract
 * @notice On-chain find registration and fee routing for the Salvage protocol.
 *
 * Flow:
 *   1. Hunter calls registerFind() to claim discovery of stranded tokens
 *   2. Project team recovers tokens and calls confirmRecovery()
 *   3. Contract routes 7% to hunter, 3% to protocol founder, automatically
 *
 * Rules:
 *   - One registered find per (contractAddress, tokenAddress) pair
 *   - Finds expire after 90 days if not confirmed
 *   - Only the founder can confirm recoveries (trustless v2 will use oracle)
 *   - Founder address is immutable after deployment
 */
contract SalvageFeeContract {

    // ── Constants
    uint256 public constant HUNTER_FEE_BPS   = 700;  // 7%
    uint256 public constant PROTOCOL_FEE_BPS = 300;  // 3%
    uint256 public constant TOTAL_FEE_BPS    = 1000; // 10% total
    uint256 public constant BPS_DENOMINATOR  = 10000;
    uint256 public constant CLAIM_WINDOW     = 90 days;

    // ── State
    address public immutable founder;

    struct Find {
        address hunter;
        address contractAddress;
        address tokenAddress;
        uint256 registeredAt;
        bool    confirmed;
        bool    expired;
    }

    // findId => Find
    mapping(bytes32 => Find) public finds;

    // hunter => total earned (in wei)
    mapping(address => uint256) public hunterEarnings;

    // Protocol totals
    uint256 public totalRecovered;
    uint256 public totalProtocolFees;
    uint256 public totalHunterFees;

    // ── Events
    event FindRegistered(
        bytes32 indexed findId,
        address indexed hunter,
        address indexed contractAddress,
        address tokenAddress,
        uint256 timestamp
    );

    event RecoveryConfirmed(
        bytes32 indexed findId,
        address indexed hunter,
        uint256 recoveredAmount,
        uint256 hunterFee,
        uint256 protocolFee
    );

    event FindExpired(bytes32 indexed findId);

    // ── Errors
    error NotFounder();
    error FindAlreadyExists();
    error FindNotFound();
    error FindAlreadyConfirmed();
    error FindAlreadyExpired();
    error ClaimWindowExpired();
    error ClaimWindowNotExpired();
    error InsufficientPayment();
    error TransferFailed();
    error ZeroAddress();

    // ── Constructor
    constructor(address _founder) {
        if (_founder == address(0)) revert ZeroAddress();
        founder = _founder;
    }

    // ── Modifiers
    modifier onlyFounder() {
        if (msg.sender != founder) revert NotFounder();
        _;
    }

    // ── Generate find ID
    function getFindId(
        address contractAddress,
        address tokenAddress
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(contractAddress, tokenAddress));
    }

    /**
     * @notice Register a stranded token find on-chain.
     * @param contractAddress The contract holding the stranded tokens
     * @param tokenAddress    The ERC-20 token address that is stranded
     */
    function registerFind(
        address contractAddress,
        address tokenAddress
    ) external {
        if (contractAddress == address(0)) revert ZeroAddress();
        if (tokenAddress == address(0))    revert ZeroAddress();

        bytes32 findId = getFindId(contractAddress, tokenAddress);
        Find storage existing = finds[findId];

        // Allow re-registration only if previous find expired
        if (existing.hunter != address(0)) {
            if (!existing.expired && !_isExpired(existing)) {
                revert FindAlreadyExists();
            }
        }

        finds[findId] = Find({
            hunter:          msg.sender,
            contractAddress: contractAddress,
            tokenAddress:    tokenAddress,
            registeredAt:    block.timestamp,
            confirmed:       false,
            expired:         false
        });

        emit FindRegistered(
            findId,
            msg.sender,
            contractAddress,
            tokenAddress,
            block.timestamp
        );
    }

    /**
     * @notice Confirm a recovery and route fees.
     * @dev Caller must send ETH equal to the total fee (10% of recovered value).
     * @param contractAddress The contract that was recovered from
     * @param tokenAddress    The token that was recovered
     * @param recoveredAmount The USD value recovered (in wei-equivalent for accounting)
     */
    function confirmRecovery(
        address contractAddress,
        address tokenAddress,
        uint256 recoveredAmount
    ) external payable onlyFounder {
        bytes32 findId = getFindId(contractAddress, tokenAddress);
        Find storage find = finds[findId];

        if (find.hunter == address(0))   revert FindNotFound();
        if (find.confirmed)              revert FindAlreadyConfirmed();
        if (find.expired)                revert FindAlreadyExpired();
        if (_isExpired(find))            revert ClaimWindowExpired();

        // Calculate fees
        uint256 hunterFee   = (recoveredAmount * HUNTER_FEE_BPS)  / BPS_DENOMINATOR;
        uint256 protocolFee = (recoveredAmount * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;

        // Verify payment covers fees
        if (msg.value < hunterFee + protocolFee) revert InsufficientPayment();

        // Mark confirmed
        find.confirmed = true;

        // Update accounting
        hunterEarnings[find.hunter] += hunterFee;
        totalRecovered               += recoveredAmount;
        totalProtocolFees            += protocolFee;
        totalHunterFees              += hunterFee;

        // Route hunter fee
        (bool hunterSuccess, ) = find.hunter.call{ value: hunterFee }('');
        if (!hunterSuccess) revert TransferFailed();

        // Route protocol fee to founder
        (bool founderSuccess, ) = founder.call{ value: protocolFee }('');
        if (!founderSuccess) revert TransferFailed();

        emit RecoveryConfirmed(
            findId,
            find.hunter,
            recoveredAmount,
            hunterFee,
            protocolFee
        );
    }

    /**
     * @notice Mark a find as expired after the 90-day window.
     */
    function expireFind(
        address contractAddress,
        address tokenAddress
    ) external {
        bytes32 findId = getFindId(contractAddress, tokenAddress);
        Find storage find = finds[findId];

        if (find.hunter == address(0)) revert FindNotFound();
        if (find.confirmed)            revert FindAlreadyConfirmed();
        if (find.expired)              revert FindAlreadyExpired();
        if (!_isExpired(find))         revert ClaimWindowNotExpired();

        find.expired = true;
        emit FindExpired(findId);
    }

    /**
     * @notice Get full details of a find.
     */
    function getFind(
        address contractAddress,
        address tokenAddress
    ) external view returns (Find memory) {
        bytes32 findId = getFindId(contractAddress, tokenAddress);
        return finds[findId];
    }

    /**
     * @notice Check if a find is still within the claim window.
     */
    function isClaimable(
        address contractAddress,
        address tokenAddress
    ) external view returns (bool) {
        bytes32 findId = getFindId(contractAddress, tokenAddress);
        Find storage find = finds[findId];
        return find.hunter != address(0)
            && !find.confirmed
            && !find.expired
            && !_isExpired(find);
    }

    /**
     * @notice Get total earnings for a hunter address.
     */
    function getHunterEarnings(address hunter) external view returns (uint256) {
        return hunterEarnings[hunter];
    }

    // ── Internal
    function _isExpired(Find storage find) internal view returns (bool) {
        return block.timestamp > find.registeredAt + CLAIM_WINDOW;
    }

    // ── Receive ETH
    receive() external payable {}
}