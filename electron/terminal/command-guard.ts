import { classifyCommand } from './command-policy';

export interface CommandCheckResult {
    blocked: boolean;
    reason?: string;
}

/**
 * Legacy wrapper used by PTY code. The source of truth is command-policy.ts.
 */
export function isCommandBlocked(command: string): CommandCheckResult {
    const policy = classifyCommand(command);
    return { blocked: policy.blocked, reason: policy.blocked ? policy.reason : undefined };
}
