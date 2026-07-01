/** Consent model — port of lib/agent/tools/consent.dart. */

export enum ConsentLevel {
  /** Show approval sheet on every invocation (writes / sends). */
  alwaysAsk = "alwaysAsk",
  /** Ask on first use this session, then remember (location, contacts…). */
  askOncePerSession = "askOncePerSession",
  /** No prompt — safe reads / local utilities. */
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
}

export type ApprovalGate = (req: ApprovalRequest) => Promise<ApprovalResult>;
