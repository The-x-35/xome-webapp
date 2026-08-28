/** Consent model, port of lib/agent/tools/consent.dart. */

export enum ConsentLevel {
  /** Show approval sheet on every invocation (writes / sends). */
  alwaysAsk = "alwaysAsk",
  /** Ask on first use this session, then remember (location, contacts…). */
  askOncePerSession = "askOncePerSession",
  /** No prompt, safe reads / local utilities. */
  preApproved = "preApproved",
}

export interface ApprovalRequest {
  toolName: string;
  description: string;
  args: Record<string, unknown>;
  consent: ConsentLevel;
}

export interface ApprovalResult {
  approved: boolean;
  /** Honored only when consent === askOncePerSession. */
  rememberForSession?: boolean;
  /** Persist to the always-allow list (never honored for NEVER_ALWAYS_ALLOW tools). */
  rememberAlways?: boolean;
}

export type ApprovalGate = (req: ApprovalRequest) => Promise<ApprovalResult>;

/** Tools that move money (or are otherwise irreversible) can never be added to
 *  the persisted allowlist, they show the approval sheet every single time. */
export const NEVER_ALWAYS_ALLOW: ReadonlySet<string> = new Set([
  "solana_send",
  "solana_swap",
  "private_send",
  "private_swap",
  "private_deposit",
  "private_withdraw",
  "memory_replace",
]);
