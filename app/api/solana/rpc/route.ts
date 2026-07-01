import { NextRequest } from "next/server";

/**
 * Solana JSON-RPC proxy. The browser's @solana/web3.js Connection points at this
 * route, so all RPC traffic (balances, blockhash, token accounts, SNS lookups,
 * broadcasts) goes out from the server — the upstream RPC URL / key in
 * SOLANA_RPC_URL never reaches the browser. Defaults to the public mainnet RPC.
 */
export const runtime = "nodejs";

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

export async function POST(req: NextRequest) {
  const body = await req.text();
  try {
    const upstream = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (e) {
    return Response.json({ error: "rpc_failed", message: String(e) }, { status: 502 });
  }
}
