import { NextRequest } from "next/server";

/**
 * Solana JSON-RPC proxy. The browser's @solana/web3.js Connection points at this
 * route, so all RPC traffic (balances, blockhash, token accounts, SNS lookups,
 * broadcasts) goes out from the server, the upstream RPC URL / key in
 * SOLANA_RPC_URL never reaches the browser. Defaults to the public mainnet RPC.
 */
export const runtime = "nodejs";

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

/** This route spends OUR upstream RPC quota, so it must only serve the app
 *  itself: same-origin browser requests (sec-fetch-site) or a matching Origin.
 *  Cross-site pages and third-party scripts get a 403. */
function isSameOrigin(req: NextRequest): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!origin) return true; // non-browser clients without Origin (e.g. curl in dev)
  try {
    const host = new URL(origin).host;
    return host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
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
