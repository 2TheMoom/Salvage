// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISalvageRecoveryRouter {
    function registerClaim(
        address token,
        address victim,
        address finder,
        bytes32 lossTxHash,
        uint256 deadline,
        bytes calldata victimSignature
    ) external returns (bytes32 claimId, address receiver);

    function settle(bytes32 claimId) external;
}

/**
 * @title SalvageBatchWrapper
 * @notice Purely additive orchestration layer over SalvageRecoveryRouter —
 * batches N register/settle calls into one transaction without touching or
 * trusting anything beyond calling the router's own existing, permissioned
 * functions. Holds no funds, has no admin role, verifies nothing itself:
 * the router still independently checks every signature and moves every
 * token exactly as it already does when called directly.
 *
 * Registering N tokens still needs N EIP-712 signatures — the router checks
 * one per call, scoped to a single token, and that check can't be bypassed
 * from outside it — but this collapses N transactions into one. Settling
 * needs no signature at all (settle() is already permissionless), so
 * batching it is a full one-click win with no caveat.
 *
 * A batch cap (MAX_BATCH_SIZE) exists purely to keep a single transaction
 * within a safe gas envelope. Callers with more tokens than that submit
 * multiple batches — chunking handled by the frontend, not this contract.
 */
contract SalvageBatchWrapper {
    ISalvageRecoveryRouter public immutable router;
    uint256 public constant MAX_BATCH_SIZE = 20;

    event BatchRegistered(uint256 count, uint256 succeeded);
    event BatchSettled(uint256 count, uint256 succeeded);

    error EmptyBatch();
    error BatchTooLarge();
    error LengthMismatch();

    constructor(address _router) {
        require(_router != address(0), "zero router");
        router = ISalvageRecoveryRouter(_router);
    }

    /// @notice Registers up to MAX_BATCH_SIZE claims in one transaction, all
    /// sharing the same victim/finder/lossTxHash/deadline (the contract-level
    /// find case this exists for) — each token still carries its own
    /// signature, verified independently by the router exactly as if called
    /// directly. One token failing (already registered, bad signature, past
    /// deadline) does not revert the rest of the batch; check `succeeded`
    /// per index to see which ones actually landed.
    function batchRegisterClaims(
        address[] calldata tokens,
        address victim,
        address finder,
        bytes32 lossTxHash,
        uint256 deadline,
        bytes[] calldata signatures
    ) external returns (bool[] memory succeeded, bytes32[] memory claimIds) {
        uint256 len = tokens.length;
        if (len == 0) revert EmptyBatch();
        if (len > MAX_BATCH_SIZE) revert BatchTooLarge();
        if (signatures.length != len) revert LengthMismatch();

        succeeded = new bool[](len);
        claimIds  = new bytes32[](len);
        uint256 successCount;

        for (uint256 i = 0; i < len; i++) {
            try router.registerClaim(tokens[i], victim, finder, lossTxHash, deadline, signatures[i])
                returns (bytes32 claimId, address)
            {
                succeeded[i] = true;
                claimIds[i]  = claimId;
                unchecked { successCount++; }
            } catch {
                // leave succeeded[i] = false, claimIds[i] = bytes32(0) — this
                // one token is skipped, the rest of the batch still proceeds.
            }
        }

        emit BatchRegistered(len, successCount);
    }

    /// @notice Settles up to MAX_BATCH_SIZE claims in one transaction.
    /// Fully permissionless, identical to calling settle() directly for
    /// each — a claim that isn't funded yet, or has nothing new to sweep,
    /// is skipped rather than reverting the rest of the batch.
    function batchSettle(bytes32[] calldata claimIds)
        external
        returns (bool[] memory succeeded)
    {
        uint256 len = claimIds.length;
        if (len == 0) revert EmptyBatch();
        if (len > MAX_BATCH_SIZE) revert BatchTooLarge();

        succeeded = new bool[](len);
        uint256 successCount;

        for (uint256 i = 0; i < len; i++) {
            try router.settle(claimIds[i]) {
                succeeded[i] = true;
                unchecked { successCount++; }
            } catch {
                // leave succeeded[i] = false — this claim is skipped, the
                // rest of the batch still proceeds.
            }
        }

        emit BatchSettled(len, successCount);
    }
}
