"use client";

import { proxyFetch } from "@/lib/net/proxy";
import { API_CLUSTER, API_CLUSTER_PUBLIC, PAYMENTS_API } from "./config";
import { getAuthToken } from "./auth";

/**
 * Client for MagicBlock's Private Payments API.
 *
 * The API builds transactions but never signs as the user: every builder call
 * returns an unsigned transaction plus where to send it. We sign with the
 * embedded wallet and hand it back to `POST /v1/transaction/send`, so the
 * browser never has to reach an Ephemeral Rollup RPC directly.
 *
 * Requests go through /api/proxy (same as every other integration) rather than
 * fetch(), so there is no CORS surface and the host stays on the allowlist.
 */

/** Common shape returned by every transaction-builder endpoint. */
export interface BuiltTransaction {
  kind: string;
  version: "legacy" | "v0";
  transactionBase64: string;
  sendTo: "base" | "ephemeral";
  sendRpcEndpoint?: string;
  from?: "base" | "ephemeral";
  recentBlockhash: string;
  lastValidBlockHeight: number;
  instructionCount: number;
  requiredSigners: string[];
  validator?: string;
  fees?: { lamports: string; tokens: string };
}

export interface SendResult {
  signature: string;
  confirmed?: boolean;
  confirmationRpcEndpoint?: string;
  confirmationRequiresAuthToken?: boolean;
}

export interface BalanceResult {
  address: string;
  mint: string;
  ata: string;
  location: "base" | "ephemeral";
  balance: string;
}

export class PaymentsApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PaymentsApiError";
  }
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; issues?: Array<{ message?: string; path?: string[] }> };
}

/** Turn a non-2xx response into a PaymentsApiError with the API's own code. */
function fail(status: number, text: string): never {
  let body: ApiErrorBody = {};
  try {
    body = JSON.parse(text) as ApiErrorBody;
  } catch {
    throw new PaymentsApiError("http_error", text.slice(0, 300) || `HTTP ${status}`, status);
  }
  const code = body.error?.code ?? "http_error";
  const issues = body.error?.issues?.map((i) => `${i.path?.join(".") ?? ""} ${i.message ?? ""}`.trim());
  const message = [body.error?.message, issues?.join("; ")].filter(Boolean).join(" — ");
  throw new PaymentsApiError(code, message || `HTTP ${status}`, status);
}

async function call<T>(
  path: string,
  init: { method?: "GET" | "POST"; query?: Record<string, string>; body?: unknown; token?: string },
): Promise<T> {
  const qs = init.query ? `?${new URLSearchParams(init.query).toString()}` : "";
  const headers: Record<string, string> = {};
  if (init.body) headers["content-type"] = "application/json";
  if (init.token) headers.authorization = `Bearer ${init.token}`;

  const res = await proxyFetch({
    url: `${PAYMENTS_API}${path}${qs}`,
    method: init.method ?? "GET",
    headers,
    body: init.body,
  });
  if (!res.ok) fail(res.status, res.text);
  return res.json<T>();
}

// ── Auth ────────────────────────────────────────────────────────────────────

/** Step 1 of the login flow: a nonce for the wallet to sign. */
export function challenge(pubkey: string): Promise<{ challenge: string }> {
  return call("/v1/spl/challenge", { query: { pubkey, cluster: API_CLUSTER_PUBLIC } });
}

/** Step 2: exchange the signed challenge for a bearer token scoped to `pubkey`. */
export function login(args: {
  pubkey: string;
  challenge: string;
  signature: string;
}): Promise<{ token: string }> {
  return call("/v1/spl/login", {
    method: "POST",
    body: { ...args, cluster: API_CLUSTER_PUBLIC },
  });
}

// ── Reads ───────────────────────────────────────────────────────────────────

/** Public, base-chain balance. No auth. */
export function balance(address: string, mint: string): Promise<BalanceResult> {
  return call("/v1/spl/balance", {
    query: { address, mint, cluster: API_CLUSTER_PUBLIC },
  });
}

/** Balance inside the private rollup. Requires the bearer token, which is what
 *  makes the balance private: only the wallet that signed can read it. */
export async function privateBalance(address: string, mint: string): Promise<BalanceResult> {
  return call("/v1/spl/private-balance", {
    query: { address, mint, cluster: API_CLUSTER },
    token: await getAuthToken(address),
  });
}

// ── Builders ────────────────────────────────────────────────────────────────

/** Move tokens from the public chain into the private rollup. */
export function buildDeposit(args: {
  owner: string;
  mint: string;
  amount: bigint;
}): Promise<BuiltTransaction> {
  return call("/v1/spl/deposit", {
    method: "POST",
    body: {
      owner: args.owner,
      mint: args.mint,
      amount: Number(args.amount),
      cluster: API_CLUSTER,
      private: true,
      idempotent: true,
      initIfMissing: true,
      initAtasIfMissing: true,
      initVaultIfMissing: true,
    },
  });
}

export interface TransferArgs {
  from: string;
  to: string;
  mint: string;
  amount: bigint;
  /** Split into N sub-transfers to break up the amount. 1 to 15. */
  split?: number;
  /** Random delay window before each split is scheduled, in ms. */
  minDelayMs?: number;
  maxDelayMs?: number;
  /** Correlation id, encrypted, for reconciling the payment later. */
  clientRefId?: string;
  memo?: string;
}

/** A private transfer. Both sides stay in the rollup, so the amount and
 *  recipient never appear on the public ledger. */
export async function buildPrivateTransfer(args: TransferArgs): Promise<BuiltTransaction> {
  return call("/v1/spl/transfer", {
    method: "POST",
    token: await getAuthToken(args.from),
    body: {
      from: args.from,
      to: args.to,
      mint: args.mint,
      amount: Number(args.amount),
      cluster: API_CLUSTER,
      visibility: "private",
      fromBalance: "ephemeral",
      toBalance: "ephemeral",
      initIfMissing: true,
      initAtasIfMissing: true,
      split: args.split ?? 1,
      minDelayMs: String(args.minDelayMs ?? 0),
      maxDelayMs: String(args.maxDelayMs ?? args.minDelayMs ?? 0),
      exactOut: true,
      ...(args.clientRefId ? { clientRefId: args.clientRefId } : {}),
      ...(args.memo ? { memo: args.memo } : {}),
    },
  });
}

/** Move tokens back out of the rollup to the public chain. */
export function buildWithdraw(args: {
  owner: string;
  mint: string;
  amount: bigint;
}): Promise<BuiltTransaction> {
  return call("/v1/spl/withdraw", {
    method: "POST",
    body: {
      owner: args.owner,
      mint: args.mint,
      amount: Number(args.amount),
      cluster: API_CLUSTER,
      idempotent: true,
      initIfMissing: true,
      initAtasIfMissing: true,
    },
  });
}

// ── Swaps ───────────────────────────────────────────────────────────────────

export interface SwapQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  slippageBps: number;
  [k: string]: unknown;
}

export function swapQuote(args: {
  inputMint: string;
  outputMint: string;
  amount: bigint;
  slippageBps?: number;
}): Promise<SwapQuote> {
  return call("/v1/swap/quote", {
    query: {
      inputMint: args.inputMint,
      outputMint: args.outputMint,
      amount: String(args.amount),
      slippageBps: String(args.slippageBps ?? 50),
    },
  });
}

/** A private swap: Jupiter routes the trade, then the output is delivered to
 *  `destination` through the private transfer queue rather than landing in a
 *  publicly linkable account. */
export function buildPrivateSwap(args: {
  userPublicKey: string;
  quoteResponse: SwapQuote;
  destination: string;
  split?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
}): Promise<{ swapTransaction: string; lastValidBlockHeight: number }> {
  return call("/v1/swap/swap", {
    method: "POST",
    body: {
      userPublicKey: args.userPublicKey,
      quoteResponse: args.quoteResponse,
      visibility: "private",
      destination: args.destination,
      split: args.split ?? 1,
      minDelayMs: String(args.minDelayMs ?? 0),
      maxDelayMs: String(args.maxDelayMs ?? args.minDelayMs ?? 0),
    },
  });
}

// ── Submission ──────────────────────────────────────────────────────────────

/** Submit a signed transaction to whichever runtime the builder named. */
export async function sendSigned(
  built: Pick<
    BuiltTransaction,
    "sendTo" | "sendRpcEndpoint" | "recentBlockhash" | "lastValidBlockHeight"
  >,
  signedBase64: string,
  owner: string,
): Promise<SendResult> {
  return call("/v1/transaction/send", {
    method: "POST",
    // Confirming through the private rollup needs the same bearer token the
    // transfer was built with.
    token: built.sendTo === "ephemeral" ? await getAuthToken(owner) : undefined,
    body: {
      transactionBase64: signedBase64,
      sendTo: built.sendTo,
      ...(built.sendRpcEndpoint ? { sendRpcEndpoint: built.sendRpcEndpoint } : {}),
      confirm: true,
      recentBlockhash: built.recentBlockhash,
      lastValidBlockHeight: built.lastValidBlockHeight,
    },
  });
}
