"use client";

import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from "@solana/spl-token";
import { resolve as resolveSns } from "@bonfida/spl-name-service";
import { proxyFetch } from "@/lib/net/proxy";
import { requireSolanaWallet } from "./wallet-bridge";

/** Curated tokens so users can say "USDC" instead of a mint. Native SOL uses the
 *  wrapped-SOL mint (what Jupiter expects for quotes/swaps). */
export const KNOWN_TOKENS: Record<string, { mint: string; symbol: string; decimals: number }> = {
  SOL: { mint: "So11111111111111111111111111111111111111112", symbol: "SOL", decimals: 9 },
  USDC: { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", decimals: 6 },
  USDT: { mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", symbol: "USDT", decimals: 6 },
};

const JUP_BASE = process.env.NEXT_PUBLIC_JUPITER_BASE || "https://lite-api.jup.ag";

let _conn: Connection | null = null;
function rpcUrl(): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  return `${origin}/api/solana/rpc`;
}
function connection(): Connection {
  if (!_conn) _conn = new Connection(rpcUrl(), "confirmed");
  return _conn;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const solscanTx = (sig: string) => `https://solscan.io/tx/${sig}`;

/** Resolve a "SOL"/"USDC" symbol or a raw mint to { mint, decimals }. */
export async function resolveToken(symbolOrMint: string): Promise<{ mint: string; decimals: number; symbol?: string }> {
  const key = symbolOrMint.trim().toUpperCase();
  if (KNOWN_TOKENS[key]) return KNOWN_TOKENS[key];
  const mintPk = new PublicKey(symbolOrMint.trim());
  const info = await connection().getParsedAccountInfo(mintPk);
  const parsed = info.value?.data as { parsed?: { info?: { decimals?: number } } } | undefined;
  const decimals = parsed?.parsed?.info?.decimals ?? 0;
  return { mint: mintPk.toBase58(), decimals };
}

/** Resolve a recipient: a `.sol` SNS domain → owner address, else validate as a
 *  base58 address and return it. */
export async function resolveRecipient(input: string): Promise<string> {
  const s = input.trim();
  if (s.toLowerCase().endsWith(".sol")) {
    const owner = await resolveSns(connection(), s.slice(0, -4));
    return owner.toBase58();
  }
  return new PublicKey(s).toBase58();
}

export async function getSolBalance(address: string): Promise<number> {
  const lamports = await connection().getBalance(new PublicKey(address));
  return lamports / LAMPORTS_PER_SOL;
}

export async function getTokenBalances(
  address: string,
): Promise<Array<{ mint: string; amount: number; decimals: number }>> {
  const res = await connection().getParsedTokenAccountsByOwner(new PublicKey(address), {
    programId: TOKEN_PROGRAM_ID,
  });
  return res.value
    .map((v) => {
      const info = (v.account.data as { parsed: { info: { mint: string; tokenAmount: { uiAmount: number; decimals: number } } } })
        .parsed.info;
      return { mint: info.mint, amount: info.tokenAmount.uiAmount, decimals: info.tokenAmount.decimals };
    })
    .filter((t) => t.amount > 0);
}

/** Send native SOL. `amount` is in SOL. */
export async function sendSol(toInput: string, amount: number): Promise<string> {
  const w = requireSolanaWallet();
  const conn = connection();
  const from = new PublicKey(w.address);
  const to = new PublicKey(await resolveRecipient(toInput));
  const lamports = Math.round(amount * LAMPORTS_PER_SOL);
  const { blockhash } = await conn.getLatestBlockhash();
  const ix = SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports });
  const msg = new TransactionMessage({ payerKey: from, recentBlockhash: blockhash, instructions: [ix] }).compileToV0Message();
  return w.signAndSend(new VersionedTransaction(msg));
}

/** Send SOL or any SPL token. `amount` is in token UI units. */
export async function sendToken(tokenSymbolOrMint: string, toInput: string, amount: number): Promise<string> {
  const { mint, decimals } = await resolveToken(tokenSymbolOrMint);
  if (mint === KNOWN_TOKENS.SOL.mint) return sendSol(toInput, amount);

  const w = requireSolanaWallet();
  const conn = connection();
  const from = new PublicKey(w.address);
  const to = new PublicKey(await resolveRecipient(toInput));
  const mintPk = new PublicKey(mint);
  const fromAta = await getAssociatedTokenAddress(mintPk, from);
  const toAta = await getAssociatedTokenAddress(mintPk, to);

  const instructions = [];
  if (!(await conn.getAccountInfo(toAta))) {
    instructions.push(createAssociatedTokenAccountInstruction(from, toAta, to, mintPk));
  }
  const raw = BigInt(Math.round(amount * 10 ** decimals));
  instructions.push(createTransferInstruction(fromAta, toAta, from, raw));

  const { blockhash } = await conn.getLatestBlockhash();
  const msg = new TransactionMessage({ payerKey: from, recentBlockhash: blockhash, instructions }).compileToV0Message();
  return w.signAndSend(new VersionedTransaction(msg));
}

// ── Jupiter (public API, via the stateless proxy) ──────────────────────────────
export interface JupQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct?: string;
  [k: string]: unknown;
}

export async function jupiterQuote(
  inputMint: string,
  outputMint: string,
  amountRaw: string,
  slippageBps = 50,
): Promise<JupQuote> {
  const url = `${JUP_BASE}/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountRaw}&slippageBps=${slippageBps}`;
  const r = await proxyFetch({ url, method: "GET" });
  if (!r.ok) throw new Error(`Jupiter quote failed (${r.status}): ${r.text.slice(0, 200)}`);
  return r.json<JupQuote>();
}

async function jupiterSwapTx(quote: JupQuote, userPublicKey: string): Promise<string> {
  const r = await proxyFetch({
    url: `${JUP_BASE}/swap/v1/swap`,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { quoteResponse: quote, userPublicKey, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true },
  });
  if (!r.ok) throw new Error(`Jupiter swap failed (${r.status}): ${r.text.slice(0, 200)}`);
  return r.json<{ swapTransaction: string }>().swapTransaction;
}

export async function jupiterPrice(mints: string[]): Promise<Record<string, { price: number }>> {
  const r = await proxyFetch({ url: `${JUP_BASE}/price/v3?ids=${mints.join(",")}`, method: "GET" });
  if (!r.ok) throw new Error(`Jupiter price failed (${r.status}): ${r.text.slice(0, 200)}`);
  // v3 returns { "<mint>": { usdPrice, ... } } keyed directly by mint.
  const raw = r.json<Record<string, { usdPrice?: number }>>();
  const out: Record<string, { price: number }> = {};
  for (const [mint, v] of Object.entries(raw)) {
    if (v && typeof v.usdPrice === "number") out[mint] = { price: v.usdPrice };
  }
  return out;
}

/** Full swap: quote → build → sign → broadcast. `amount` is in input-token UI units. */
export async function swap(
  inputToken: string,
  outputToken: string,
  amount: number,
): Promise<{ signature: string; inAmount: string; outAmount: string; priceImpactPct?: string }> {
  const w = requireSolanaWallet();
  const inp = await resolveToken(inputToken);
  const out = await resolveToken(outputToken);
  const amountRaw = BigInt(Math.round(amount * 10 ** inp.decimals)).toString();
  const quote = await jupiterQuote(inp.mint, out.mint, amountRaw);
  const b64 = await jupiterSwapTx(quote, w.address);
  const tx = VersionedTransaction.deserialize(b64ToBytes(b64));
  const signature = await w.signAndSend(tx);
  return {
    signature,
    inAmount: quote.inAmount,
    outAmount: quote.outAmount,
    priceImpactPct: quote.priceImpactPct,
  };
}
