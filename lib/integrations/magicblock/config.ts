/**
 * MagicBlock configuration.
 *
 * Private payments run through MagicBlock's hosted Payments API against a
 * TEE-secured Private Ephemeral Rollup. This ships on devnet by default: the
 * flow is new and moves real balances, so mainnet is opt-in per deployment.
 * The existing mainnet `solana_send` / `solana_swap` tools are unaffected.
 */

export type MagicBlockCluster = "devnet" | "mainnet";

/** Payments API base. Same host for both clusters; `cluster` is per request. */
export const PAYMENTS_API = "https://payments.magicblock.app";

const CLUSTER_ENV = (process.env.NEXT_PUBLIC_MAGICBLOCK_CLUSTER ?? "").toLowerCase();

export const CLUSTER: MagicBlockCluster = CLUSTER_ENV === "mainnet" ? "mainnet" : "devnet";

export const IS_DEVNET = CLUSTER === "devnet";

/** What the API's `cluster` field carries. The `-private` variants route reads
 *  and writes through the TEE rollup, which is what makes a transfer private. */
export const API_CLUSTER = IS_DEVNET ? "devnet-private" : "mainnet-private";

/** Public (non-TEE) cluster name, for reads that do not need permissioning. */
export const API_CLUSTER_PUBLIC = IS_DEVNET ? "devnet" : "mainnet";

/** TEE rollup RPC, used for the auth challenge and attestation check. */
export const TEE_RPC = IS_DEVNET
  ? "https://devnet-tee.magicblock.app"
  : "https://mainnet-tee.magicblock.app";

/** Base-layer RPC, proxied so the upstream key never reaches the browser. */
export function baseRpcUrl(): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  return `${origin}/api/solana/rpc?cluster=${CLUSTER}`;
}

export interface TokenInfo {
  mint: string;
  symbol: string;
  decimals: number;
}

/** Tokens private payments accept. USDC is the only one MagicBlock's queue is
 *  initialized for on devnet, so it is the default and the sole safe choice
 *  there. */
export const TOKENS: Record<string, TokenInfo> = IS_DEVNET
  ? {
      USDC: { mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", symbol: "USDC", decimals: 6 },
    }
  : {
      USDC: { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", decimals: 6 },
      USDT: { mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", symbol: "USDT", decimals: 6 },
    };

export const DEFAULT_TOKEN = TOKENS.USDC;

/** Resolve a symbol ("USDC") or a raw mint address to a token. */
export function resolveToken(symbolOrMint?: string): TokenInfo | null {
  if (!symbolOrMint) return DEFAULT_TOKEN;
  const key = symbolOrMint.trim().toUpperCase();
  if (TOKENS[key]) return TOKENS[key];
  const byMint = Object.values(TOKENS).find((t) => t.mint === symbolOrMint.trim());
  return byMint ?? null;
}

/** Whole units to base units, e.g. 1.5 USDC to 1500000. */
export function toBaseUnits(amount: number, decimals: number): bigint {
  return BigInt(Math.round(amount * 10 ** decimals));
}

/** Base units to whole units for display. */
export function fromBaseUnits(raw: string | bigint, decimals: number): number {
  return Number(BigInt(raw)) / 10 ** decimals;
}

/** The agent spend policy program, deployed on devnet. Empty when unset, in
 *  which case the policy gate is unavailable and payment tools refuse. */
export const POLICY_PROGRAM_ID = process.env.NEXT_PUBLIC_XOME_POLICY_PROGRAM_ID ?? "";

export const explorerTx = (sig: string) =>
  IS_DEVNET
    ? `https://solscan.io/tx/${sig}?cluster=devnet`
    : `https://solscan.io/tx/${sig}`;

export const explorerAccount = (addr: string) =>
  IS_DEVNET
    ? `https://solscan.io/account/${addr}?cluster=devnet`
    : `https://solscan.io/account/${addr}`;
