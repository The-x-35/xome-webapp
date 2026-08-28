"use client";

import bs58 from "bs58";
import { getSecretValue, setSecret, deleteSecret } from "@/lib/store/secrets";
import { requireSolanaWallet } from "@/lib/integrations/solana/wallet-bridge";
import { challenge, login } from "./payments-client";
import { CLUSTER } from "./config";

/**
 * Bearer tokens for reading private rollup state.
 *
 * Private balances are readable only by the wallet that owns them: you sign a
 * challenge, get a token, and the rollup answers your reads. The token is held
 * in the same origin-isolated IndexedDB as every other secret and never leaves
 * the browser except as an Authorization header on the request it belongs to.
 */

const TTL_MS = 24 * 60 * 60 * 1000;
/** Refresh a little early so a long tool call cannot straddle the expiry. */
const SKEW_MS = 5 * 60 * 1000;

interface StoredToken {
  token: string;
  expiresAt: number;
}

const secretId = (address: string) => `magicblock.token.${CLUSTER}.${address}`;

/** In-flight logins, so several tools starting at once produce one signature
 *  prompt rather than a burst of them. */
const pending = new Map<string, Promise<string>>();

async function readCached(address: string): Promise<string | null> {
  const raw = await getSecretValue(secretId(address));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredToken;
    if (parsed.token && parsed.expiresAt > Date.now() + SKEW_MS) return parsed.token;
  } catch {
    // Corrupt entry, fall through and re-authenticate.
  }
  return null;
}

/** Whether a usable token is already held, so the UI can show the state without
 *  triggering a signature. */
export async function hasAuthToken(address: string): Promise<boolean> {
  return (await readCached(address)) !== null;
}

/**
 * Get a bearer token for `address`, signing a challenge if needed.
 *
 * The signature prompt is the honest cost of private reads: the rollup has to
 * know it is you. It happens roughly once a day, not per payment.
 */
export async function getAuthToken(address: string): Promise<string> {
  const cached = await readCached(address);
  if (cached) return cached;

  const existing = pending.get(address);
  if (existing) return existing;

  const run = (async () => {
    const wallet = requireSolanaWallet();
    if (wallet.address !== address) {
      throw new Error(
        `Connected wallet is ${wallet.address}, cannot authenticate as ${address}.`,
      );
    }

    const { challenge: nonce } = await challenge(address);
    const signature = await wallet.signMessage(new TextEncoder().encode(nonce));
    const { token } = await login({
      pubkey: address,
      challenge: nonce,
      signature: bs58.encode(signature),
    });

    await setSecret(
      secretId(address),
      JSON.stringify({ token, expiresAt: Date.now() + TTL_MS } satisfies StoredToken),
      { cluster: CLUSTER, address },
    );
    return token;
  })();

  pending.set(address, run);
  try {
    return await run;
  } finally {
    pending.delete(address);
  }
}

/** Drop the stored token. Used on disconnect and when a read is rejected. */
export async function clearAuthToken(address: string): Promise<void> {
  await deleteSecret(secretId(address));
}
