"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallets } from "@privy-io/react-auth/solana";
import { Section, Row, Toggle } from "@/components/settings/primitives";
import { Button, Tag, Spinner } from "@/components/ui/index";
import { emit } from "@/lib/store/bus";
import {
  CLUSTER,
  DEFAULT_TOKEN,
  IS_DEVNET,
  TOKENS,
  explorerAccount,
  fromBaseUnits,
  toBaseUnits,
} from "@/lib/integrations/magicblock/config";
import {
  delegatePolicyIx,
  fetchPolicy,
  getSessionKeypair,
  initializePolicyIx,
  isDelegated,
  isPolicyConfigured,
  policyPda,
  resetSpendIx,
  rotateSessionKeypair,
  sendOwnerInstruction,
  setAgentIx,
  setPausedIx,
  updatePolicyIx,
  type AgentPolicy,
} from "@/lib/integrations/magicblock/policy-client";

/**
 * The agent's spend policy.
 *
 * This is the page that decides what the agent can do with money. Everything
 * here is signed by the wallet and enforced by the program, so nothing on this
 * page can be changed by the agent itself, or by any tool it can call.
 */

const NEVER = 0;

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-[13px] font-medium text-text">{label}</div>
      {hint ? <div className="mt-0.5 text-[12px] text-text-2">{hint}</div> : null}
      <div className="mt-2">{children}</div>
    </label>
  );
}

const inputClass =
  "w-full rounded-[var(--radius-input,10px)] border border-border bg-surface-2 px-3 py-2 text-[14px] text-text outline-none focus:border-border-strong";

export default function PolicyPage() {
  const { wallets } = useWallets();
  const address = wallets?.[0]?.address ?? null;

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [policy, setPolicy] = useState<AgentPolicy | null>(null);
  const [delegated, setDelegated] = useState(false);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [perTx, setPerTx] = useState("5");
  const [daily, setDaily] = useState("25");
  const [mints, setMints] = useState<string[]>([DEFAULT_TOKEN.mint]);
  const [expiryDays, setExpiryDays] = useState("30");

  const configured = isPolicyConfigured();

  const refresh = useCallback(async () => {
    if (!address || !configured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [p, d, kp] = await Promise.all([
        fetchPolicy(address),
        isDelegated(address),
        getSessionKeypair(),
      ]);
      setPolicy(p);
      setDelegated(d);
      setSessionKey(kp.publicKey.toBase58());
      if (p) {
        const dec = DEFAULT_TOKEN.decimals;
        setPerTx(String(fromBaseUnits(p.perTxCap, dec)));
        setDaily(String(fromBaseUnits(p.dailyCap, dec)));
        setMints(p.allowedMints);
        setExpiryDays(
          p.expiresAt === NEVER
            ? "0"
            : String(Math.max(0, Math.round((p.expiresAt - Date.now() / 1000) / 86400))),
        );
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [address, configured]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Run an owner-signed instruction, then refresh. */
  async function run(label: string, build: () => Promise<void>) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      await build();
      await refresh();
      emit("connections");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function formValues() {
    const dec = DEFAULT_TOKEN.decimals;
    const perTxCap = toBaseUnits(Number(perTx), dec);
    const dailyCap = toBaseUnits(Number(daily), dec);
    if (!(perTxCap > 0n)) throw new Error("Per-payment cap must be greater than zero.");
    if (dailyCap < perTxCap) throw new Error("Daily cap must be at least the per-payment cap.");
    if (mints.length === 0) throw new Error("Allow at least one token.");
    const days = Number(expiryDays);
    const expiresAt = days > 0 ? Math.floor(Date.now() / 1000) + days * 86400 : NEVER;
    return { perTxCap, dailyCap, allowedMints: mints, expiresAt };
  }

  if (!configured) {
    return (
      <Wrapper>
        <Row
          title="Not configured"
          subtitle="This deployment has no policy program set, so private payments are disabled. Set NEXT_PUBLIC_XOME_POLICY_PROGRAM_ID."
        />
      </Wrapper>
    );
  }

  if (!address) {
    return (
      <Wrapper>
        <Row
          title="No wallet connected"
          subtitle="Connect a Solana wallet before setting spend limits."
          right={
            <Link href="/connections">
              <Button className="!px-4 !py-2 text-[13px]">Connections</Button>
            </Link>
          }
        />
      </Wrapper>
    );
  }

  if (loading) {
    return (
      <Wrapper>
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      </Wrapper>
    );
  }

  const dec = DEFAULT_TOKEN.decimals;
  const agentBound = policy && sessionKey && policy.agent === sessionKey;

  return (
    <Wrapper>
      {policy ? (
        <Section title="Status">
          <Row title="Spent today" subtitle={`Resets 24 hours after the first payment of the day.`}>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-text-2">
              <span className="text-text">
                {fromBaseUnits(policy.spentToday, dec)} of {fromBaseUnits(policy.dailyCap, dec)}{" "}
                {DEFAULT_TOKEN.symbol}
              </span>
              <span>{Number(policy.nonce)} payments recorded</span>
              <span>{delegated ? "Enforced on the rollup" : "Enforced on Solana"}</span>
            </div>
          </Row>

          <Row
            title="Pause all agent spending"
            subtitle="A paused policy refuses every payment, whatever the limits say."
            right={
              <Toggle
                on={policy.paused}
                onChange={(v) =>
                  run("pause", async () => {
                    await sendOwnerInstruction(address, setPausedIx(address, v));
                  })
                }
              />
            }
          />

          <Row
            title="Reset today's spending"
            subtitle="Clears the daily counter early. The lifetime payment count is never reset."
            right={
              <Button
                variant="outlined"
                className="!px-4 !py-2 text-[13px]"
                disabled={busy !== null}
                onClick={() =>
                  run("reset", async () => {
                    await sendOwnerInstruction(address, resetSpendIx(address));
                  })
                }
              >
                Reset
              </Button>
            }
          />
        </Section>
      ) : null}

      <Section title={policy ? "Limits" : "Set your limits"}>
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <div className="flex flex-col gap-4">
            <Field label={`Per payment (${DEFAULT_TOKEN.symbol})`} hint="The largest single payment the agent may make.">
              <input className={inputClass} value={perTx} onChange={(e) => setPerTx(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label={`Per day (${DEFAULT_TOKEN.symbol})`} hint="Total across all payments in a rolling 24 hours.">
              <input className={inputClass} value={daily} onChange={(e) => setDaily(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Allowed tokens" hint="The agent cannot spend anything not ticked here.">
              <div className="flex flex-wrap gap-2">
                {Object.values(TOKENS).map((t) => {
                  const on = mints.includes(t.mint);
                  return (
                    <button
                      key={t.mint}
                      type="button"
                      onClick={() =>
                        setMints((cur) =>
                          cur.includes(t.mint) ? cur.filter((m) => m !== t.mint) : [...cur, t.mint].slice(0, 4),
                        )
                      }
                      className={`rounded-full border px-3 py-1.5 text-[13px] ${
                        on ? "border-border-strong bg-surface-2 text-text" : "border-border text-text-2"
                      }`}
                    >
                      {t.symbol}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Expires in (days)" hint="After this the agent stops being able to spend until you renew. 0 means no expiry.">
              <input className={inputClass} value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} inputMode="numeric" />
            </Field>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                className="!px-4 !py-2 text-[13px]"
                disabled={busy !== null}
                onClick={() =>
                  run("save", async () => {
                    const v = formValues();
                    if (policy) {
                      await sendOwnerInstruction(address, updatePolicyIx({ owner: address, ...v }));
                      setNotice("Limits updated on chain.");
                    } else {
                      await sendOwnerInstruction(address, initializePolicyIx({ owner: address, ...v }));
                      const kp = await getSessionKeypair();
                      await sendOwnerInstruction(address, setAgentIx(address, kp.publicKey.toBase58()));
                      setNotice("Policy created and the agent key authorized.");
                    }
                  })
                }
              >
                {busy === "save" ? "Signing…" : policy ? "Update limits" : "Create policy"}
              </Button>
              {policy && !agentBound ? (
                <Button
                  variant="outlined"
                  className="!px-4 !py-2 text-[13px]"
                  disabled={busy !== null}
                  onClick={() =>
                    run("bind", async () => {
                      const kp = await getSessionKeypair();
                      await sendOwnerInstruction(address, setAgentIx(address, kp.publicKey.toBase58()));
                      setNotice("Agent key authorized.");
                    })
                  }
                >
                  Authorize agent key
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </Section>

      {policy ? (
        <Section title="Agent key">
          <Row
            title={agentBound ? "Authorized" : "Not authorized"}
            subtitle={
              agentBound
                ? "This browser holds a key that can record spending against the policy. It cannot move funds and it cannot change these limits."
                : "The policy does not recognise this browser's key, so every payment will ask the wallet to sign the policy check as well."
            }
            right={
              <Button
                variant="outlined"
                className="!px-4 !py-2 text-[13px]"
                disabled={busy !== null}
                onClick={() =>
                  run("rotate", async () => {
                    const kp = await rotateSessionKeypair();
                    await sendOwnerInstruction(address, setAgentIx(address, kp.publicKey.toBase58()));
                    setNotice("New agent key generated and authorized. The old one is now useless.");
                  })
                }
              >
                Rotate
              </Button>
            }
          />
          <Row
            title="Revoke the agent key"
            subtitle="Stops the agent recording spending at all, without changing your limits."
            right={
              <Button
                variant="outlined"
                className="!px-4 !py-2 text-[13px]"
                disabled={busy !== null || !agentBound}
                onClick={() =>
                  run("revoke", async () => {
                    await sendOwnerInstruction(
                      address,
                      setAgentIx(address, "11111111111111111111111111111111"),
                    );
                    setNotice("Agent key revoked.");
                  })
                }
              >
                Revoke
              </Button>
            }
          />
        </Section>
      ) : null}

      {policy ? (
        <Section title="Rollup">
          <Row
            title={delegated ? "Policy runs on the MagicBlock rollup" : "Move the policy onto the rollup"}
            subtitle={
              delegated
                ? "Spend checks settle in milliseconds and cost nothing. State commits back to Solana every 5 minutes."
                : "Right now every spend check is an ordinary Solana transaction. Delegating makes them free and near-instant."
            }
            right={
              delegated ? (
                <Tag kind="success" dot>Delegated</Tag>
              ) : (
                <Button
                  className="!px-4 !py-2 text-[13px]"
                  disabled={busy !== null}
                  onClick={() =>
                    run("delegate", async () => {
                      await sendOwnerInstruction(address, delegatePolicyIx(address));
                      setNotice("Policy delegated to the rollup.");
                    })
                  }
                >
                  {busy === "delegate" ? "Signing…" : "Delegate"}
                </Button>
              )
            }
          />
          <Row title="Policy account">
            <a
              className="mt-1 block break-all text-[12px] text-text-2 underline underline-offset-2"
              href={explorerAccount(policyPda(address).toBase58())}
              target="_blank"
              rel="noreferrer"
            >
              {policyPda(address).toBase58()}
            </a>
          </Row>
        </Section>
      ) : null}

      {notice ? <p className="px-1 pb-3 text-[13px] text-accent-text">{notice}</p> : null}
      {error ? <p className="px-1 pb-3 text-[13px] text-text-2">{error}</p> : null}
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-2 flex items-center gap-2">
          <h1 className="font-display text-3xl font-medium tracking-[-0.02em]">Agent spend policy</h1>
          {IS_DEVNET ? <Tag kind="neutral">Devnet</Tag> : null}
        </div>
        <p className="mb-7 text-[13px] leading-relaxed text-text-2">
          A limit on what the agent can pay out, enforced by a program on Solana rather than by this
          app. The agent can read these limits; it cannot change them, and no tool it calls can
          either. If a payment would breach them, the chain refuses it and nothing moves.
        </p>
        {children}
        <p className="px-1 pb-6 text-[12px] leading-relaxed text-text-3">
          Running on {CLUSTER}. The policy program is unaudited and holds no funds, it stores only
          your caps and a running total.
        </p>
      </div>
    </div>
  );
}
