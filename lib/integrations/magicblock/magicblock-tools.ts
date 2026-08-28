"use client";

import { defineTool, type Tool, type ToolResult } from "@/lib/agent/tools/tool";
import { ConsentLevel } from "@/lib/agent/tools/consent";
import { getSolanaWallet } from "@/lib/integrations/solana/wallet-bridge";
import { resolveRecipient } from "@/lib/integrations/solana/solana-client";
import {
  CLUSTER,
  DEFAULT_TOKEN,
  TOKENS,
  explorerTx,
  fromBaseUnits,
  resolveToken,
  toBaseUnits,
} from "./config";
import {
  PaymentsApiError,
  balance,
  buildDeposit,
  buildPrivateSwap,
  buildPrivateTransfer,
  buildWithdraw,
  privateBalance,
  sendSigned,
  swapQuote,
  type BuiltTransaction,
} from "./payments-client";
import {
  PolicyError,
  fetchPolicy,
  isDelegated,
  isPolicyConfigured,
  recordSpend,
} from "./policy-client";

/**
 * Private payment tools, powered by MagicBlock.
 *
 * Ordinary Solana transfers put the amount, the recipient, and the timing on a
 * public ledger forever. These move the same tokens inside a TEE-secured
 * Ephemeral Rollup instead, so the transfer itself is not visible on chain.
 *
 * Everything that moves money passes through two gates: the approval sheet the
 * user sees, and `record_spend` on the on-chain policy program. Both must pass.
 */

const INTEGRATION_ID = "magicblock";
const GROUP = "Private payments";

const VERSION_LEGACY = "legacy";

function tokenList(): string {
  return Object.keys(TOKENS).join(", ");
}

function wallet() {
  const w = getSolanaWallet();
  if (!w) throw new ToolFailure("not_connected", "No Solana wallet connected. Connect one under Connections.");
  return w;
}

/** A failure the tool should report to the model rather than throw. */
class ToolFailure extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/** Map any thrown error onto the `{ error, message }` shape tools return. */
function asError(e: unknown): ToolResult {
  if (e instanceof ToolFailure) return { error: e.code, message: e.message };
  if (e instanceof PolicyError) {
    return {
      error: "policy_refused",
      message: e.message,
      refusedBy: "The on-chain agent spend policy. No funds moved.",
    };
  }
  if (e instanceof PaymentsApiError) return { error: e.code, message: e.message };
  return { error: "failed", message: String(e) };
}

function requireToken(symbolOrMint?: string) {
  const token = resolveToken(symbolOrMint);
  if (!token) {
    throw new ToolFailure(
      "unknown_token",
      `Private payments support ${tokenList()} on ${CLUSTER}. Got "${symbolOrMint}".`,
    );
  }
  return token;
}

function requireAmount(raw: unknown): number {
  const amount = Number(raw ?? 0);
  if (!(amount > 0)) throw new ToolFailure("invalid_amount", "amount must be greater than zero");
  return amount;
}

/** Sign a built transaction with the embedded wallet and submit it to whichever
 *  runtime the API named. */
async function signAndSubmit(built: BuiltTransaction, owner: string) {
  const { Transaction, VersionedTransaction } = await import("@solana/web3.js");
  const bytes = Buffer.from(built.transactionBase64, "base64");
  const tx =
    built.version === VERSION_LEGACY
      ? Transaction.from(bytes)
      : VersionedTransaction.deserialize(new Uint8Array(bytes));

  const signed = await wallet().signTransaction(tx, CLUSTER);
  return sendSigned(built, Buffer.from(signed).toString("base64"), owner);
}

/**
 * The policy gate. Runs before anything is built or signed, so a refusal costs
 * the user nothing. Returns what the program recorded, for the tool to report.
 */
async function gate(owner: string, amount: bigint, mint: string) {
  if (!isPolicyConfigured()) {
    throw new ToolFailure(
      "policy_unavailable",
      "The agent spend policy program is not configured for this deployment, so private payments are disabled.",
    );
  }
  return recordSpend({ owner, amount, mint });
}

export const magicblockTools: Tool[] = [
  defineTool({
    name: "private_balance",
    description:
      "Get the user's private token balance held inside the MagicBlock rollup, and their public on-chain balance for the same token, for comparison. Reading the private balance needs a one-time wallet signature per day.",
    parameterSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: `Token symbol (${tokenList()}) or mint address. Defaults to USDC.` },
      },
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    integrationId: INTEGRATION_ID,
    group: GROUP,
    invoke: async (args) => {
      try {
        const w = wallet();
        const token = requireToken(args.token as string | undefined);
        const [priv, pub] = await Promise.all([
          privateBalance(w.address, token.mint),
          balance(w.address, token.mint).catch(() => null),
        ]);
        return {
          token: token.symbol,
          cluster: CLUSTER,
          private: fromBaseUnits(priv.balance, token.decimals),
          public: pub ? fromBaseUnits(pub.balance, token.decimals) : null,
          note: "The private balance lives in a TEE-secured rollup and is readable only by this wallet.",
        };
      } catch (e) {
        return asError(e);
      }
    },
  }),

  defineTool({
    name: "agent_policy_get",
    description:
      "Read the on-chain spend policy that limits what this agent may pay out: per-transaction cap, daily cap, how much is left today, which tokens are allowed, and whether it is paused or expired. Read only; the agent cannot change its own limits.",
    parameterSchema: { type: "object", properties: {}, additionalProperties: false },
    consent: ConsentLevel.preApproved,
    integrationId: INTEGRATION_ID,
    group: GROUP,
    invoke: async () => {
      try {
        const w = wallet();
        if (!isPolicyConfigured()) {
          return { error: "policy_unavailable", message: "No policy program is configured for this deployment." };
        }
        const policy = await fetchPolicy(w.address);
        if (!policy) {
          return {
            exists: false,
            message:
              "No spend policy yet. The user creates one under Settings, Agent spend policy. Until then private payments are refused.",
          };
        }
        const d = DEFAULT_TOKEN.decimals;
        const remaining = policy.dailyCap > policy.spentToday ? policy.dailyCap - policy.spentToday : 0n;
        return {
          exists: true,
          perTxCap: fromBaseUnits(policy.perTxCap, d),
          dailyCap: fromBaseUnits(policy.dailyCap, d),
          spentToday: fromBaseUnits(policy.spentToday, d),
          remainingToday: fromBaseUnits(remaining, d),
          allowedTokens: policy.allowedMints.map(
            (m) => Object.values(TOKENS).find((t) => t.mint === m)?.symbol ?? m,
          ),
          paused: policy.paused,
          expiresAt: policy.expiresAt === 0 ? null : new Date(policy.expiresAt * 1000).toISOString(),
          agentBound: policy.agent !== "11111111111111111111111111111111",
          paymentsRecorded: Number(policy.nonce),
          onRollup: await isDelegated(w.address),
        };
      } catch (e) {
        return asError(e);
      }
    },
  }),

  defineTool({
    name: "private_deposit",
    description:
      "Move tokens from the user's public Solana balance into their private MagicBlock balance. Required before any private payment: you can only send privately what is already inside the rollup. The deposit itself is a public transaction; what happens afterwards is not.",
    parameterSchema: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Amount in whole token units, e.g. 25 for 25 USDC." },
        token: { type: "string", description: `Token symbol (${tokenList()}) or mint address. Defaults to USDC.` },
      },
      required: ["amount"],
      additionalProperties: false,
    },
    consent: ConsentLevel.alwaysAsk,
    integrationId: INTEGRATION_ID,
    group: GROUP,
    invoke: async (args) => {
      try {
        const w = wallet();
        const token = requireToken(args.token as string | undefined);
        const amount = requireAmount(args.amount);
        const raw = toBaseUnits(amount, token.decimals);

        const built = await buildDeposit({ owner: w.address, mint: token.mint, amount: raw });
        const sent = await signAndSubmit(built, w.address);
        return {
          deposited: amount,
          token: token.symbol,
          signature: sent.signature,
          explorer: explorerTx(sent.signature),
          confirmed: sent.confirmed ?? false,
          next: "This amount can now be sent privately with private_send.",
        };
      } catch (e) {
        return asError(e);
      }
    },
  }),

  defineTool({
    name: "private_send",
    description:
      "Send tokens privately to a recipient, from the user's private MagicBlock balance. The amount and recipient do not appear on the public Solana ledger. Requires a prior private_deposit. Optionally split the payment and add a random delay to obscure its timing. Every send is checked against the user's on-chain spend policy first.",
    parameterSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient wallet address or .sol domain." },
        amount: { type: "number", description: "Amount in whole token units, e.g. 12.5" },
        token: { type: "string", description: `Token symbol (${tokenList()}) or mint address. Defaults to USDC.` },
        split: {
          type: "number",
          description:
            "Split into this many sub-transfers to hide the amount, 1 to 15. Defaults to 1. Only use above 1 when the user asks for extra unlinkability.",
        },
        delaySeconds: {
          type: "number",
          description:
            "Upper bound of a random scheduling delay, in seconds, to obscure timing. Defaults to 0 (immediate).",
        },
        memo: { type: "string", description: "Optional note attached to the payment." },
      },
      required: ["to", "amount"],
      additionalProperties: false,
    },
    consent: ConsentLevel.alwaysAsk,
    integrationId: INTEGRATION_ID,
    group: GROUP,
    invoke: async (args) => {
      try {
        const w = wallet();
        const token = requireToken(args.token as string | undefined);
        const amount = requireAmount(args.amount);
        const raw = toBaseUnits(amount, token.decimals);

        const toInput = String(args.to ?? "").trim();
        if (!toInput) throw new ToolFailure("empty_to", "to is required");
        const to = await resolveRecipient(toInput);

        const split = Math.min(Math.max(Math.round(Number(args.split ?? 1)), 1), 15);
        const delayMs = Math.max(0, Math.round(Number(args.delaySeconds ?? 0) * 1000));

        // Gate first: a refusal here costs nothing and moves nothing.
        const recorded = await gate(w.address, raw, token.mint);

        const clientRefId = String(Date.now());
        const built = await buildPrivateTransfer({
          from: w.address,
          to,
          mint: token.mint,
          amount: raw,
          split,
          minDelayMs: 0,
          maxDelayMs: delayMs,
          clientRefId,
          memo: typeof args.memo === "string" ? args.memo : undefined,
        });
        const sent = await signAndSubmit(built, w.address);

        return {
          submitted: true,
          settlement: delayMs > 0 || split > 1 ? "pending" : "submitted",
          amount,
          token: token.symbol,
          to,
          resolvedFrom: toInput === to ? undefined : toInput,
          split,
          clientRefId,
          signature: sent.signature,
          policy: {
            spentToday: fromBaseUnits(recorded.spentToday, token.decimals),
            remainingToday: fromBaseUnits(recorded.remainingToday, token.decimals),
            recordedOnRollup: recorded.onRollup,
          },
          note:
            "The source transaction is confirmed, but a split or delayed private transfer settles asynchronously. Confirm receipt with private_balance rather than treating this as final.",
        };
      } catch (e) {
        return asError(e);
      }
    },
  }),

  defineTool({
    name: "private_withdraw",
    description:
      "Move tokens from the user's private MagicBlock balance back to their public Solana balance. The withdrawal itself is a public transaction.",
    parameterSchema: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Amount in whole token units." },
        token: { type: "string", description: `Token symbol (${tokenList()}) or mint address. Defaults to USDC.` },
      },
      required: ["amount"],
      additionalProperties: false,
    },
    consent: ConsentLevel.alwaysAsk,
    integrationId: INTEGRATION_ID,
    group: GROUP,
    invoke: async (args) => {
      try {
        const w = wallet();
        const token = requireToken(args.token as string | undefined);
        const amount = requireAmount(args.amount);
        const raw = toBaseUnits(amount, token.decimals);

        const recorded = await gate(w.address, raw, token.mint);
        const built = await buildWithdraw({ owner: w.address, mint: token.mint, amount: raw });
        const sent = await signAndSubmit(built, w.address);

        return {
          withdrawn: amount,
          token: token.symbol,
          signature: sent.signature,
          explorer: explorerTx(sent.signature),
          confirmed: sent.confirmed ?? false,
          policy: { remainingToday: fromBaseUnits(recorded.remainingToday, token.decimals) },
        };
      } catch (e) {
        return asError(e);
      }
    },
  }),

  defineTool({
    name: "private_swap",
    description:
      "Swap one token for another and have the output delivered privately, so the trade's output does not land in a publicly linkable account. Routed through Jupiter, then delivered through MagicBlock's private transfer queue.",
    parameterSchema: {
      type: "object",
      properties: {
        inputToken: { type: "string", description: "Token to swap from (symbol or mint)." },
        outputToken: { type: "string", description: "Token to swap to (symbol or mint)." },
        amount: { type: "number", description: "Amount of the input token, in whole units." },
        destination: {
          type: "string",
          description:
            "Where the output is delivered. A wallet address or .sol domain. Defaults to the user's own wallet.",
        },
        delaySeconds: {
          type: "number",
          description: "Upper bound of a random delivery delay, in seconds. Maximum 600.",
        },
      },
      required: ["inputToken", "outputToken", "amount"],
      additionalProperties: false,
    },
    consent: ConsentLevel.alwaysAsk,
    integrationId: INTEGRATION_ID,
    group: GROUP,
    invoke: async (args) => {
      try {
        const w = wallet();
        const input = requireToken(String(args.inputToken ?? ""));
        const output = requireToken(String(args.outputToken ?? ""));
        const amount = requireAmount(args.amount);
        const raw = toBaseUnits(amount, input.decimals);

        const destInput = String(args.destination ?? "").trim();
        const destination = destInput ? await resolveRecipient(destInput) : w.address;
        const delayMs = Math.min(Math.max(0, Math.round(Number(args.delaySeconds ?? 0) * 1000)), 600_000);

        const recorded = await gate(w.address, raw, input.mint);

        const quote = await swapQuote({
          inputMint: input.mint,
          outputMint: output.mint,
          amount: raw,
        });
        const built = await buildPrivateSwap({
          userPublicKey: w.address,
          quoteResponse: quote,
          destination,
          minDelayMs: 0,
          maxDelayMs: delayMs,
        });

        const { VersionedTransaction } = await import("@solana/web3.js");
        const tx = VersionedTransaction.deserialize(
          new Uint8Array(Buffer.from(built.swapTransaction, "base64")),
        );
        const signed = await wallet().signTransaction(tx, CLUSTER);
        const sent = await sendSigned(
          {
            sendTo: "base",
            recentBlockhash: "",
            lastValidBlockHeight: built.lastValidBlockHeight,
          },
          Buffer.from(signed).toString("base64"),
          w.address,
        );

        return {
          submitted: true,
          settlement: "pending",
          swapped: { amount, from: input.symbol, to: output.symbol },
          expectedOut: fromBaseUnits(quote.outAmount, output.decimals),
          priceImpactPct: quote.priceImpactPct,
          destination,
          signature: sent.signature,
          policy: { remainingToday: fromBaseUnits(recorded.remainingToday, input.decimals) },
          note: "Private delivery settles asynchronously. Check private_balance to confirm receipt.",
        };
      } catch (e) {
        return asError(e);
      }
    },
  }),
];
