"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallets } from "@privy-io/react-auth/solana";
import { usePrivy } from "@privy-io/react-auth";
import { Tag, Button, Spinner } from "@/components/ui/index";
import type { IntegrationDescriptor } from "@/lib/integrations/registry";
import { isSolanaConfigured } from "@/components/chrome/solana-provider";
import { getPrefs, setPrefs } from "@/lib/store/prefs";
import { emit, on } from "@/lib/store/bus";
import { BrandTile } from "./brand-icons";
import {
  CLUSTER,
  DEFAULT_TOKEN,
  IS_DEVNET,
  TEE_RPC,
  fromBaseUnits,
} from "@/lib/integrations/magicblock/config";
import { hasAuthToken, getAuthToken } from "@/lib/integrations/magicblock/auth";
import { privateBalance } from "@/lib/integrations/magicblock/payments-client";
import {
  fetchPolicy,
  isDelegated,
  isPolicyConfigured,
  type AgentPolicy,
} from "@/lib/integrations/magicblock/policy-client";

/**
 * MagicBlock row. Private payments only work when three things line up: a
 * connected wallet, a signed-in session for private reads, and a spend policy
 * on chain. This row shows which of those is missing rather than a bare
 * "not connected".
 */

type Attestation = "checking" | "verified" | "failed";

function Shell({
  descriptor,
  connected,
  subtitle,
  right,
  children,
}: {
  descriptor: IntegrationDescriptor;
  connected: boolean;
  subtitle: string;
  right: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <BrandTile id={descriptor.id} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-medium text-text">{descriptor.label}</span>
            {connected ? <Tag kind="success" dot>Ready</Tag> : <Tag kind="neutral">Not set up</Tag>}
            {IS_DEVNET ? <Tag kind="neutral">Devnet</Tag> : null}
          </div>
          <div className="mt-0.5 text-[13px] text-text-2">{subtitle}</div>
        </div>
        <div className="shrink-0">{right}</div>
      </div>
      {children}
    </div>
  );
}

export function MagicBlockRow({ descriptor }: { descriptor: IntegrationDescriptor }) {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const address = wallets?.[0]?.address ?? null;
  const walletConnected = authenticated && !!address;

  const [attestation, setAttestation] = useState<Attestation>("checking");
  const [authed, setAuthed] = useState(false);
  const [authing, setAuthing] = useState(false);
  const [policy, setPolicy] = useState<AgentPolicy | null>(null);
  const [delegated, setDelegated] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const configured = isSolanaConfigured && isPolicyConfigured();
  const ok = walletConnected && configured && !!policy && authed;

  /** Ask the rollup to prove it is really running inside a genuine TEE. */
  useEffect(() => {
    if (!configured) return;
    let alive = true;
    (async () => {
      try {
        const { verifyTeeRpcIntegrity } = await import("@magicblock-labs/ephemeral-rollups-sdk");
        await verifyTeeRpcIntegrity(TEE_RPC);
        if (alive) setAttestation("verified");
      } catch {
        if (alive) setAttestation("failed");
      }
    })();
    return () => {
      alive = false;
    };
  }, [configured]);

  const refresh = useCallback(async () => {
    if (!address || !configured) return;
    setError(null);
    try {
      const [p, d, a] = await Promise.all([
        fetchPolicy(address),
        isDelegated(address),
        hasAuthToken(address),
      ]);
      setPolicy(p);
      setDelegated(d);
      setAuthed(a);
      if (a) {
        const b = await privateBalance(address, DEFAULT_TOKEN.mint).catch(() => null);
        setBalance(b ? fromBaseUnits(b.balance, DEFAULT_TOKEN.decimals) : null);
      } else {
        setBalance(null);
      }
    } catch (e) {
      setError(String(e));
    }
  }, [address, configured]);

  useEffect(() => {
    refresh();
    return on("connections", refresh);
  }, [refresh]);

  /** Enable the tools only when a payment could actually succeed, so the model
   *  is never offered a tool that is guaranteed to refuse. */
  useEffect(() => {
    const enabled = new Set(getPrefs().enabledIntegrations);
    if (ok) enabled.add("magicblock");
    else enabled.delete("magicblock");
    setPrefs({ enabledIntegrations: [...enabled] });
    emit("connections");
  }, [ok]);

  async function authenticate() {
    if (!address) return;
    setAuthing(true);
    setError(null);
    try {
      await getAuthToken(address);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuthing(false);
    }
  }

  if (!configured) {
    return (
      <Shell
        descriptor={descriptor}
        connected={false}
        subtitle={
          !isSolanaConfigured
            ? "Set NEXT_PUBLIC_PRIVY_APP_ID to enable the wallet first."
            : "Set NEXT_PUBLIC_XOME_POLICY_PROGRAM_ID to enable private payments."
        }
        right={
          <Button variant="outlined" className="!px-4 !py-2 text-[13px]" disabled>
            Not configured
          </Button>
        }
      />
    );
  }

  if (!ready) return <Shell descriptor={descriptor} connected={false} subtitle={descriptor.tagline} right={<Spinner />} />;

  if (!walletConnected) {
    return (
      <Shell
        descriptor={descriptor}
        connected={false}
        subtitle="Connect the Solana wallet above first, private payments use the same wallet."
        right={
          <Button variant="outlined" className="!px-4 !py-2 text-[13px]" disabled>
            Needs wallet
          </Button>
        }
      />
    );
  }

  const right = !policy ? (
    <Link href="/settings/policy">
      <Button className="!px-4 !py-2 text-[13px]">Set limits</Button>
    </Link>
  ) : !authed ? (
    <Button className="!px-4 !py-2 text-[13px]" onClick={authenticate} disabled={authing}>
      {authing ? "Signing…" : "Authenticate"}
    </Button>
  ) : (
    <Link href="/settings/policy">
      <Button variant="outlined" className="!px-4 !py-2 text-[13px]">Manage</Button>
    </Link>
  );

  const subtitle = !policy
    ? "No spend policy yet. Set caps before the agent can pay anyone."
    : !authed
      ? "Sign once to read your private balance."
      : `Private balance ${balance ?? 0} ${DEFAULT_TOKEN.symbol}`;

  const d = DEFAULT_TOKEN.decimals;

  return (
    <Shell descriptor={descriptor} connected={ok} subtitle={subtitle} right={right}>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-border pt-3 text-[12px] text-text-2">
        <span>
          Enclave{" "}
          {attestation === "checking" ? (
            <span className="text-text-3">checking…</span>
          ) : attestation === "verified" ? (
            <span className="text-accent-text">attested</span>
          ) : (
            <span className="text-text-3">unverified</span>
          )}
        </span>
        {policy ? (
          <>
            <span>
              Per payment <span className="text-text">{fromBaseUnits(policy.perTxCap, d)}</span>
            </span>
            <span>
              Left today{" "}
              <span className="text-text">
                {fromBaseUnits(
                  policy.dailyCap > policy.spentToday ? policy.dailyCap - policy.spentToday : 0n,
                  d,
                )}
              </span>{" "}
              of {fromBaseUnits(policy.dailyCap, d)}
            </span>
            <span>Policy {delegated ? "on rollup" : "on Solana"}</span>
            {policy.paused ? <span className="text-text">Paused</span> : null}
          </>
        ) : null}
        <span className="text-text-3">{CLUSTER}</span>
      </div>
      {error ? <div className="mt-2 text-[12px] text-text-3">{error}</div> : null}
    </Shell>
  );
}
