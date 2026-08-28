"use client";

import type { Transaction, VersionedTransaction } from "@solana/web3.js";

/**
 * Bridge between the Privy React wallet (which only exists inside React context)
 * and the agent tools (plain async functions the orchestrator calls outside
 * React). A `<SolanaProvider>` component reads the embedded wallet via Privy
 * hooks and pushes a handle here; the Solana tools read it synchronously.
 */

export interface SolanaWalletHandle {
  address: string;
  /** Sign AND broadcast a transaction via the Privy embedded wallet; resolves
   *  to the transaction signature. */
  signAndSend: (tx: VersionedTransaction | Transaction) => Promise<string>;
  /** Sign a message without sending anything. Used for the MagicBlock private
   *  rollup challenge/login, which proves wallet ownership before it will
   *  answer reads of private state. */
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  /** Sign a transaction and return the signed bytes rather than broadcasting.
   *  MagicBlock's Payments API tells us which runtime to submit to (the base
   *  chain or a specific rollup RPC), so we cannot let the wallet choose. */
  signTransaction: (
    tx: VersionedTransaction | Transaction,
    chain?: "devnet" | "mainnet",
  ) => Promise<Uint8Array>;
}

type Listener = (h: SolanaWalletHandle | null) => void;

let current: SolanaWalletHandle | null = null;
const listeners = new Set<Listener>();

export function setSolanaWallet(h: SolanaWalletHandle | null): void {
  current = h;
  listeners.forEach((l) => l(current));
}

export function getSolanaWallet(): SolanaWalletHandle | null {
  return current;
}

export function requireSolanaWallet(): SolanaWalletHandle {
  if (!current) {
    throw new Error("Solana wallet not connected. Connect it under Connections first.");
  }
  return current;
}

export function isSolanaConnected(): boolean {
  return !!current;
}

/** Subscribe to wallet changes. Fires immediately with the current value. */
export function subscribeSolanaWallet(fn: Listener): () => void {
  listeners.add(fn);
  fn(current);
  return () => {
    listeners.delete(fn);
  };
}
