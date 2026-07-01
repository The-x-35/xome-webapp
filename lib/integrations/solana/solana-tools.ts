"use client";

import { defineTool, type Tool } from "@/lib/agent/tools/tool";
import { ConsentLevel } from "@/lib/agent/tools/consent";
import { getSolanaWallet } from "./wallet-bridge";
import {
  KNOWN_TOKENS,
  getSolBalance,
  getTokenBalances,
  resolveRecipient,
  sendToken,
  swap,
  jupiterPrice,
  resolveToken,
  solscanTx,
} from "./solana-client";

const INTEGRATION_ID = "solana";
const GROUP = "Solana";

function walletAddressOr(args: Record<string, unknown>): string | null {
  const explicit = typeof args.address === "string" ? args.address.trim() : "";
  if (explicit) return explicit;
  return getSolanaWallet()?.address ?? null;
}

export const solanaTools: Tool[] = [
  defineTool({
    name: "solana_get_address",
    description:
      "Get the connected Solana wallet's address (public key) so the user can receive SOL or tokens.",
    parameterSchema: { type: "object", properties: {}, additionalProperties: false },
    consent: ConsentLevel.preApproved,
    integrationId: INTEGRATION_ID,
    group: GROUP,
    invoke: async () => {
      const w = getSolanaWallet();
      if (!w) return { error: "not_connected", message: "No Solana wallet connected." };
      return { address: w.address, receiveWith: "Share this address to receive SOL or SPL tokens." };
    },
  }),

  defineTool({
    name: "solana_get_balance",
    description:
      "Get SOL and SPL token balances for a Solana address. Defaults to the connected wallet when no address is given.",
    parameterSchema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Wallet address to check. Optional; defaults to the connected wallet." },
      },
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    integrationId: INTEGRATION_ID,
    group: GROUP,
    invoke: async (args) => {
      const address = walletAddressOr(args);
      if (!address) return { error: "not_connected", message: "No address given and no wallet connected." };
      try {
        const [sol, tokens] = await Promise.all([getSolBalance(address), getTokenBalances(address)]);
        return { address, sol, tokens };
      } catch (e) {
        return { error: "balance_failed", message: String(e) };
      }
    },
  }),

  defineTool({
    name: "solana_token_price",
    description:
      "Get the current USD price of one or more Solana tokens via Jupiter. Accepts symbols (SOL, USDC, USDT) or mint addresses.",
    parameterSchema: {
      type: "object",
      properties: {
        tokens: {
          type: "array",
          items: { type: "string" },
          description: "Token symbols or mint addresses, e.g. [\"SOL\", \"USDC\"].",
        },
      },
      required: ["tokens"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    integrationId: INTEGRATION_ID,
    group: GROUP,
    invoke: async (args) => {
      const input = Array.isArray(args.tokens) ? (args.tokens as unknown[]).map(String) : [];
      if (!input.length) return { error: "empty", message: "Provide at least one token." };
      try {
        const resolved = await Promise.all(input.map((t) => resolveToken(t)));
        const mints = resolved.map((r) => r.mint);
        const prices = await jupiterPrice(mints);
        const out: Record<string, number | null> = {};
        input.forEach((label, i) => {
          out[label] = prices[mints[i]]?.price ?? null;
        });
        return { prices: out };
      } catch (e) {
        return { error: "price_failed", message: String(e) };
      }
    },
  }),

  defineTool({
    name: "solana_resolve_domain",
    description: "Resolve a Solana .sol domain name (SNS) to its owner wallet address.",
    parameterSchema: {
      type: "object",
      properties: { domain: { type: "string", description: "A .sol domain, e.g. bob.sol" } },
      required: ["domain"],
      additionalProperties: false,
    },
    consent: ConsentLevel.preApproved,
    integrationId: INTEGRATION_ID,
    group: GROUP,
    invoke: async (args) => {
      const domain = String(args.domain ?? "").trim();
      if (!domain) return { error: "empty", message: "domain is required" };
      try {
        return { domain, address: await resolveRecipient(domain) };
      } catch (e) {
        return { error: "resolve_failed", message: String(e) };
      }
    },
  }),

  defineTool({
    name: "solana_send",
    description:
      "Send SOL or an SPL token from the connected wallet to a recipient (a wallet address or a .sol domain). Amount is in whole token units (e.g. 0.5 SOL).",
    parameterSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient wallet address or .sol domain." },
        amount: { type: "number", description: "Amount to send, in token units." },
        token: {
          type: "string",
          description: `Token symbol (${Object.keys(KNOWN_TOKENS).join(", ")}) or mint address. Defaults to SOL.`,
        },
      },
      required: ["to", "amount"],
      additionalProperties: false,
    },
    consent: ConsentLevel.alwaysAsk,
    integrationId: INTEGRATION_ID,
    group: GROUP,
    invoke: async (args) => {
      const to = String(args.to ?? "").trim();
      const amount = Number(args.amount ?? 0);
      const token = String(args.token ?? "SOL").trim() || "SOL";
      if (!to) return { error: "empty_to", message: "to is required" };
      if (!(amount > 0)) return { error: "invalid_amount", message: "amount must be positive" };
      const w = getSolanaWallet();
      if (!w) return { error: "not_connected", message: "No Solana wallet connected." };
      try {
        const signature = await sendToken(token, to, amount);
        return { signature, explorer: solscanTx(signature), sent: { amount, token, to } };
      } catch (e) {
        return { error: "send_failed", message: String(e) };
      }
    },
  }),

  defineTool({
    name: "solana_swap",
    description:
      "Swap one token for another via Jupiter using the connected wallet. Amount is in whole units of the input token. Tokens can be symbols (SOL, USDC, USDT) or mint addresses.",
    parameterSchema: {
      type: "object",
      properties: {
        inputToken: { type: "string", description: "Token to swap from (symbol or mint)." },
        outputToken: { type: "string", description: "Token to swap to (symbol or mint)." },
        amount: { type: "number", description: "Amount of the input token to swap." },
      },
      required: ["inputToken", "outputToken", "amount"],
      additionalProperties: false,
    },
    consent: ConsentLevel.alwaysAsk,
    integrationId: INTEGRATION_ID,
    group: GROUP,
    invoke: async (args) => {
      const inputToken = String(args.inputToken ?? "").trim();
      const outputToken = String(args.outputToken ?? "").trim();
      const amount = Number(args.amount ?? 0);
      if (!inputToken || !outputToken) return { error: "empty", message: "inputToken and outputToken are required" };
      if (!(amount > 0)) return { error: "invalid_amount", message: "amount must be positive" };
      const w = getSolanaWallet();
      if (!w) return { error: "not_connected", message: "No Solana wallet connected." };
      try {
        const res = await swap(inputToken, outputToken, amount);
        return { ...res, explorer: solscanTx(res.signature) };
      } catch (e) {
        return { error: "swap_failed", message: String(e) };
      }
    },
  }),
];
