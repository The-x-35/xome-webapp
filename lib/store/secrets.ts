"use client";

import { db, type SecretRecord } from "./db";

/**
 * Secrets store, API keys, OAuth tokens, the Notion token. Web analogue of
 * flutter_secure_storage / api_keys_store.dart. Stored in origin-isolated
 * IndexedDB and only ever read client-side; secrets are attached to requests
 * at call time and forwarded through the stateless proxy, never persisted
 * server-side.
 */

export async function getSecret(id: string): Promise<SecretRecord | undefined> {
  return (await db()).get("secrets", id);
}

export async function getSecretValue(id: string): Promise<string | null> {
  return (await getSecret(id))?.value ?? null;
}

export async function setSecret(
  id: string,
  value: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  await (await db()).put("secrets", { id, value, meta, updatedAt: Date.now() });
}

export async function deleteSecret(id: string): Promise<void> {
  await (await db()).delete("secrets", id);
}

export async function listSecretIds(): Promise<string[]> {
  return (await (await db()).getAllKeys("secrets")) as string[];
}

// ── API keys ──────────────────────────────────────────────────────────────
export const apiKeyId = (provider: string) => `apikey.${provider}`;
export const getApiKey = (provider: string) => getSecretValue(apiKeyId(provider));
export const setApiKey = (provider: string, key: string) => setSecret(apiKeyId(provider), key);
export const deleteApiKey = (provider: string) => deleteSecret(apiKeyId(provider));

// ── OAuth tokens ────────────────────────────────────────────────────────────
export interface OAuthToken {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: number | null; // epoch ms
  scopes?: string[];
  account?: string | null; // email / username
}

export const oauthId = (integration: string) => `oauth.${integration}`;

export async function getOAuth(integration: string): Promise<OAuthToken | null> {
  const s = await getSecret(oauthId(integration));
  if (!s) return null;
  try {
    return JSON.parse(s.value) as OAuthToken;
  } catch {
    return null;
  }
}

export async function setOAuth(integration: string, token: OAuthToken): Promise<void> {
  await setSecret(oauthId(integration), JSON.stringify(token), {
    account: token.account ?? null,
    scopes: token.scopes ?? [],
  });
}

export async function deleteOAuth(integration: string): Promise<void> {
  await deleteSecret(oauthId(integration));
}

// ── Notion internal-integration token ───────────────────────────────────────
export const getNotionToken = () => getSecretValue("notion.token");
export const setNotionToken = (t: string) => setSecret("notion.token", t);
export const deleteNotionToken = () => deleteSecret("notion.token");
