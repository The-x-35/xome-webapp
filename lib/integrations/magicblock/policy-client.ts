"use client";

import bs58 from "bs58";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { getSecretValue, setSecret, deleteSecret } from "@/lib/store/secrets";
import { requireSolanaWallet } from "@/lib/integrations/solana/wallet-bridge";
import { CLUSTER, IS_DEVNET, POLICY_PROGRAM_ID, baseRpcUrl } from "./config";

/**
 * Client for the `xome_agent_policy` program.
 *
 * The policy is the agent's leash: caps the user sets, enforced by a program
 * rather than by the browser code that asks for approval. Before any private
 * payment the agent records the spend against the policy; if the program
 * refuses, the payment never happens.
 *
 * Instructions are encoded by hand from the program's IDL discriminators rather
 * than pulling @coral-xyz/anchor into the browser bundle, which would add about
 * a megabyte for eight instructions of fixed layout.
 */

/** Magic Router. Routes a transaction to the rollup when the account is
 *  delegated and to the base chain when it is not, so this client does not have
 *  to track delegation state itself. */
export const ROUTER_RPC = IS_DEVNET
  ? "https://devnet-router.magicblock.app"
  : "https://router.magicblock.app";

/** Rollup validator to delegate to. The TEE one, so policy state is private. */
export const TEE_VALIDATOR = new PublicKey("MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo");

const DELEGATION_PROGRAM = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
const MAGIC_PROGRAM = new PublicKey("Magic11111111111111111111111111111111111111");
const MAGIC_CONTEXT = new PublicKey("MagicContext1111111111111111111111111111111");

const POLICY_SEED = new TextEncoder().encode("policy");

/** Instruction discriminators, copied from target/idl/xome_agent_policy.json. */
const IX = {
  initializePolicy: [9, 186, 86, 225, 129, 162, 231, 56],
  updatePolicy: [212, 245, 246, 7, 163, 151, 18, 57],
  setAgent: [154, 74, 121, 91, 137, 19, 101, 166],
  setPaused: [91, 60, 125, 192, 176, 225, 166, 218],
  resetSpend: [156, 43, 189, 165, 182, 223, 20, 187],
  recordSpend: [111, 102, 17, 64, 245, 202, 79, 55],
  delegatePolicy: [50, 172, 191, 221, 123, 35, 1, 173],
} as const;

const ACCOUNT_DISCRIMINATOR = [148, 193, 218, 129, 21, 96, 195, 77];

/** Program error codes, from the IDL. Mapped so a refusal can be reported as
 *  the rule that refused rather than a hex code. */
const ERROR_MESSAGES: Record<number, string> = {
  6000: "The signing key is neither the policy owner nor the authorized agent.",
  6001: "The spend policy is paused.",
  6002: "The agent's spending authority has expired.",
  6003: "Amount must be greater than zero.",
  6004: "Daily cap must be at least the per-transaction cap.",
  6005: "That token is not on the policy's allowed list.",
  6006: "Amount exceeds the per-transaction cap.",
  6007: "Amount would exceed the daily cap.",
  6008: "Too many tokens for one policy (maximum 4).",
  6009: "At least one token must be allowed.",
  6010: "Expiry must be in the future.",
  6011: "Policy account does not match the owner's address.",
};

export const MAX_MINTS = 4;
const DAY_SECONDS = 86_400;

export interface AgentPolicy {
  owner: string;
  agent: string;
  perTxCap: bigint;
  dailyCap: bigint;
  spentToday: bigint;
  dayStart: number;
  allowedMints: string[];
  expiresAt: number;
  paused: boolean;
  nonce: bigint;
  bump: number;
}

export class PolicyError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
    this.name = "PolicyError";
  }
}

export function isPolicyConfigured(): boolean {
  return POLICY_PROGRAM_ID.length > 0;
}

function programId(): PublicKey {
  if (!POLICY_PROGRAM_ID) {
    throw new PolicyError(
      "The agent spend policy program is not configured. Set NEXT_PUBLIC_XOME_POLICY_PROGRAM_ID.",
    );
  }
  return new PublicKey(POLICY_PROGRAM_ID);
}

export function policyPda(owner: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [POLICY_SEED, new PublicKey(owner).toBuffer()],
    programId(),
  )[0];
}

let _base: Connection | null = null;
function baseConnection(): Connection {
  if (!_base) _base = new Connection(baseRpcUrl(), "confirmed");
  return _base;
}

let _router: Connection | null = null;
function routerConnection(): Connection {
  if (!_router) _router = new Connection(ROUTER_RPC, "confirmed");
  return _router;
}

// ── Encoding ────────────────────────────────────────────────────────────────

function u64(value: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, value, true);
  return b;
}

function i64(value: number | bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigInt64(0, BigInt(value), true);
  return b;
}

function u32(value: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, value, true);
  return b;
}

function concat(...parts: Uint8Array[]): Buffer {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return Buffer.from(out);
}

/** Borsh `Vec<Pubkey>`: a u32 length then the raw keys. */
function vecPubkey(mints: string[]): Uint8Array {
  return concat(u32(mints.length), ...mints.map((m) => new PublicKey(m).toBytes()));
}

// ── Decoding ────────────────────────────────────────────────────────────────

export function decodePolicy(data: Uint8Array): AgentPolicy {
  for (let i = 0; i < 8; i++) {
    if (data[i] !== ACCOUNT_DISCRIMINATOR[i]) {
      throw new PolicyError("Account at the policy address is not an AgentPolicy.");
    }
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const key = (at: number) => new PublicKey(data.slice(at, at + 32)).toBase58();

  // Field offsets after the 8-byte discriminator:
  // owner 8, agent 40, per_tx_cap 72, daily_cap 80, spent_today 88,
  // day_start 96, allowed_mints 104 (4 x 32), mint_count 232,
  // expires_at 233, paused 241, nonce 242, bump 250. Total 251 bytes.
  const MINTS_AT = 104;
  const mintCount = Math.min(data[232], MAX_MINTS);
  const allowedMints: string[] = [];
  for (let i = 0; i < mintCount; i++) allowedMints.push(key(MINTS_AT + i * 32));

  return {
    owner: key(8),
    agent: key(40),
    perTxCap: view.getBigUint64(72, true),
    dailyCap: view.getBigUint64(80, true),
    spentToday: view.getBigUint64(88, true),
    dayStart: Number(view.getBigInt64(96, true)),
    allowedMints,
    expiresAt: Number(view.getBigInt64(233, true)),
    paused: data[241] === 1,
    nonce: view.getBigUint64(242, true),
    bump: data[250],
  };
}

/** Read the policy, or null when the user has not created one. Reads through
 *  the router so a delegated policy returns its live rollup state. */
export async function fetchPolicy(owner: string): Promise<AgentPolicy | null> {
  const pda = policyPda(owner);
  const info =
    (await routerConnection().getAccountInfo(pda, "confirmed")) ??
    (await baseConnection().getAccountInfo(pda, "confirmed"));
  if (!info) return null;
  return decodePolicy(new Uint8Array(info.data));
}

export async function isDelegated(owner: string): Promise<boolean> {
  const info = await baseConnection().getAccountInfo(policyPda(owner), "confirmed");
  return info ? info.owner.equals(DELEGATION_PROGRAM) : false;
}

// ── The session key ─────────────────────────────────────────────────────────

const sessionSecretId = () => `magicblock.session.${CLUSTER}`;

/** The agent's signing key for `record_spend`. Generated in the browser, stored
 *  beside the other secrets, and useless for anything except recording spending
 *  against a policy that names it. It cannot move funds. */
export async function getSessionKeypair(): Promise<Keypair> {
  const stored = await getSecretValue(sessionSecretId());
  if (stored) {
    try {
      return Keypair.fromSecretKey(bs58.decode(stored));
    } catch {
      // Unreadable, fall through and mint a new one.
    }
  }
  const kp = Keypair.generate();
  await setSecret(sessionSecretId(), bs58.encode(kp.secretKey), { cluster: CLUSTER });
  return kp;
}

/** Throw the current session key away, so the next call mints a fresh one. The
 *  owner must then re-bind it with `setAgent`. */
export async function rotateSessionKeypair(): Promise<Keypair> {
  await deleteSecret(sessionSecretId());
  return getSessionKeypair();
}

// ── Instructions ────────────────────────────────────────────────────────────

function ownerOnlyIx(owner: PublicKey, data: Buffer): TransactionInstruction {
  return new TransactionInstruction({
    programId: programId(),
    keys: [
      { pubkey: policyPda(owner.toBase58()), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data,
  });
}

export function initializePolicyIx(args: {
  owner: string;
  perTxCap: bigint;
  dailyCap: bigint;
  allowedMints: string[];
  expiresAt: number;
}): TransactionInstruction {
  const owner = new PublicKey(args.owner);
  return new TransactionInstruction({
    programId: programId(),
    keys: [
      { pubkey: policyPda(args.owner), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: concat(
      new Uint8Array(IX.initializePolicy),
      u64(args.perTxCap),
      u64(args.dailyCap),
      vecPubkey(args.allowedMints),
      i64(args.expiresAt),
    ),
  });
}

export function updatePolicyIx(args: {
  owner: string;
  perTxCap: bigint;
  dailyCap: bigint;
  allowedMints: string[];
  expiresAt: number;
}): TransactionInstruction {
  return ownerOnlyIx(
    new PublicKey(args.owner),
    concat(
      new Uint8Array(IX.updatePolicy),
      u64(args.perTxCap),
      u64(args.dailyCap),
      vecPubkey(args.allowedMints),
      i64(args.expiresAt),
    ),
  );
}

export function setAgentIx(owner: string, agent: string): TransactionInstruction {
  return ownerOnlyIx(
    new PublicKey(owner),
    concat(new Uint8Array(IX.setAgent), new PublicKey(agent).toBytes()),
  );
}

export function setPausedIx(owner: string, paused: boolean): TransactionInstruction {
  return ownerOnlyIx(
    new PublicKey(owner),
    concat(new Uint8Array(IX.setPaused), new Uint8Array([paused ? 1 : 0])),
  );
}

export function resetSpendIx(owner: string): TransactionInstruction {
  return ownerOnlyIx(new PublicKey(owner), concat(new Uint8Array(IX.resetSpend)));
}

export function recordSpendIx(args: {
  owner: string;
  authority: PublicKey;
  amount: bigint;
  mint: string;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: programId(),
    keys: [
      { pubkey: policyPda(args.owner), isSigner: false, isWritable: true },
      { pubkey: args.authority, isSigner: true, isWritable: false },
    ],
    data: concat(
      new Uint8Array(IX.recordSpend),
      u64(args.amount),
      new PublicKey(args.mint).toBytes(),
    ),
  });
}

/** Hand the policy to the TEE rollup. The delegation program derives its own
 *  bookkeeping PDAs, which have to be passed in the exact IDL order. */
export function delegatePolicyIx(owner: string): TransactionInstruction {
  const pid = programId();
  const pda = policyPda(owner);
  const seed = (label: string, key: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [new TextEncoder().encode(label), key.toBuffer()],
      DELEGATION_PROGRAM,
    )[0];

  const buffer = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("buffer"), pda.toBuffer()],
    pid,
  )[0];

  return new TransactionInstruction({
    programId: pid,
    keys: [
      { pubkey: new PublicKey(owner), isSigner: true, isWritable: true },
      { pubkey: buffer, isSigner: false, isWritable: true },
      { pubkey: seed("delegation", pda), isSigner: false, isWritable: true },
      { pubkey: seed("delegation-metadata", pda), isSigner: false, isWritable: true },
      { pubkey: pda, isSigner: false, isWritable: true },
      { pubkey: pid, isSigner: false, isWritable: false },
      { pubkey: DELEGATION_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      // Pin the rollup to the TEE validator.
      { pubkey: TEE_VALIDATOR, isSigner: false, isWritable: false },
    ],
    data: concat(new Uint8Array(IX.delegatePolicy)),
  });
}

export { MAGIC_PROGRAM, MAGIC_CONTEXT, DELEGATION_PROGRAM };

// ── The gate ────────────────────────────────────────────────────────────────

export interface SpendCheck {
  allowed: boolean;
  reason?: string;
  policy: AgentPolicy;
  remainingToday: bigint;
}

/**
 * The same rules the program enforces, evaluated locally.
 *
 * This exists to give the user a clear "why not" before a round trip, not as
 * the enforcement itself: the program is the enforcement. A payment is only
 * allowed to proceed after `recordSpend` succeeds on-chain.
 */
export function checkSpendLocally(
  policy: AgentPolicy,
  amount: bigint,
  mint: string,
  nowSeconds: number,
): SpendCheck {
  const windowExpired = nowSeconds - policy.dayStart >= DAY_SECONDS;
  const base = windowExpired ? 0n : policy.spentToday;
  const remainingToday = policy.dailyCap > base ? policy.dailyCap - base : 0n;
  const out = (reason?: string): SpendCheck => ({
    allowed: !reason,
    reason,
    policy,
    remainingToday,
  });

  if (policy.paused) return out("The spend policy is paused.");
  if (policy.expiresAt !== 0 && nowSeconds > policy.expiresAt) {
    return out("The agent's spending authority has expired.");
  }
  if (amount <= 0n) return out("Amount must be greater than zero.");
  if (!policy.allowedMints.includes(mint)) {
    return out("That token is not on the policy's allowed list.");
  }
  if (amount > policy.perTxCap) {
    return out(`Amount exceeds the per-transaction cap of ${policy.perTxCap} base units.`);
  }
  if (base + amount > policy.dailyCap) {
    return out(`Amount would exceed the daily cap. ${remainingToday} base units left today.`);
  }
  return out();
}

/** Pull the program's error code out of a failed simulation or send. */
function programErrorCode(e: unknown): number | undefined {
  const text = JSON.stringify((e as { logs?: string[] })?.logs ?? []) + String(e);
  const custom = text.match(/custom program error: 0x([0-9a-fA-F]+)/);
  if (custom) return parseInt(custom[1], 16);
  const named = text.match(/Error Number: (\d+)/);
  if (named) return Number(named[1]);
  return undefined;
}

export interface RecordedSpend {
  signature: string;
  spentToday: bigint;
  remainingToday: bigint;
  nonce: bigint;
  onRollup: boolean;
}

/**
 * Record a spend against the policy. This is the gate every payment passes
 * through, and it fails closed: if it throws, the caller must not pay.
 *
 * The session key signs, so no wallet prompt appears. Sent through the Magic
 * Router, which puts it on the rollup when the policy is delegated (free, a few
 * milliseconds) and on the base chain when it is not.
 */
export async function recordSpend(args: {
  owner: string;
  amount: bigint;
  mint: string;
}): Promise<RecordedSpend> {
  const policy = await fetchPolicy(args.owner);
  if (!policy) {
    throw new PolicyError(
      "No spend policy exists for this wallet. Create one under Settings, Agent spend policy.",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const check = checkSpendLocally(policy, args.amount, args.mint, now);
  if (!check.allowed) throw new PolicyError(check.reason!);

  const session = await getSessionKeypair();
  const usingSession = policy.agent === session.publicKey.toBase58();
  const authority = usingSession ? session.publicKey : new PublicKey(args.owner);

  const ix = recordSpendIx({
    owner: args.owner,
    authority,
    amount: args.amount,
    mint: args.mint,
  });

  const conn = routerConnection();
  const tx = new Transaction().add(ix);
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;

  let signature: string;
  try {
    if (usingSession) {
      tx.feePayer = session.publicKey;
      tx.sign(session);
      signature = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    } else {
      // No session key bound, so the owner has to sign this one itself.
      const wallet = requireSolanaWallet();
      tx.feePayer = new PublicKey(args.owner);
      const signed = await wallet.signTransaction(tx, CLUSTER);
      signature = await conn.sendRawTransaction(Buffer.from(signed));
    }
    await conn.confirmTransaction(signature, "confirmed");
  } catch (e) {
    const code = programErrorCode(e);
    throw new PolicyError(
      ERROR_MESSAGES[code ?? -1] ?? `The policy program refused the spend: ${String(e)}`,
      code,
    );
  }

  const after = (await fetchPolicy(args.owner)) ?? policy;
  return {
    signature,
    spentToday: after.spentToday,
    remainingToday: after.dailyCap > after.spentToday ? after.dailyCap - after.spentToday : 0n,
    nonce: after.nonce,
    onRollup: await isDelegated(args.owner),
  };
}

/** Owner-signed policy writes. Always go to the base chain unless the policy is
 *  delegated, in which case the router forwards them to the rollup. */
export async function sendOwnerInstruction(
  owner: string,
  ix: TransactionInstruction,
): Promise<string> {
  const wallet = requireSolanaWallet();
  const conn = routerConnection();
  const tx = new Transaction().add(ix);
  tx.feePayer = new PublicKey(owner);
  tx.recentBlockhash = (await conn.getLatestBlockhash("confirmed")).blockhash;

  const signed = await wallet.signTransaction(tx, CLUSTER);
  const signature = await conn.sendRawTransaction(Buffer.from(signed));
  await conn.confirmTransaction(signature, "confirmed");
  return signature;
}
