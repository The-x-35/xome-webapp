import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import {
  providerConfig,
  redirectUri,
  requestOrigin,
  type AuthProvider,
} from "@/lib/integrations/oauth-config";

/**
 * OAuth callback. Validates state, exchanges the code for tokens (server-side,
 * with the client secret), then returns a tiny HTML page that postMessages the
 * token to the opener window and closes the popup. Tokens are handed to the
 * browser to store locally — no token is persisted on the server.
 */
export const runtime = "nodejs";

function page(payload: Record<string, unknown>): Response {
  const json = JSON.stringify(payload);
  const html = `<!doctype html><meta charset="utf-8"><title>Connecting…</title>
<body style="font-family:system-ui;background:#f7f6f3;color:#1b1a18;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><div style="font-size:15px;opacity:.7">You can close this window.</div></div>
<script>
(function(){
  var msg = Object.assign({ source: "xome-oauth" }, ${json});
  try { if (window.opener) window.opener.postMessage(msg, "*"); } catch(e){}
  setTimeout(function(){ try{ window.close(); }catch(e){} }, 300);
})();
</script></body>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider: providerParam } = await ctx.params;
  const provider = providerParam as AuthProvider;
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const err = req.nextUrl.searchParams.get("error");
  if (err) return page({ ok: false, error: err });
  if (!code || !state) return page({ ok: false, error: "missing_code" });

  const cookieStore = await cookies();
  const raw = cookieStore.get(`xome_oauth_${provider}`)?.value;
  if (!raw) return page({ ok: false, error: "missing_state_cookie" });
  let stored: { integration: string; state: string; verifier: string };
  try {
    stored = JSON.parse(raw);
  } catch {
    return page({ ok: false, error: "bad_state_cookie" });
  }
  if (stored.state !== state) return page({ ok: false, error: "state_mismatch" });
  cookieStore.delete(`xome_oauth_${provider}`);

  const origin = requestOrigin(req);
  const cfg = providerConfig(provider, origin);
  if (!cfg.clientId || !cfg.clientSecret) return page({ ok: false, error: "not_configured" });

  const form = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri(origin, provider),
  });
  if (cfg.usesPkce && stored.verifier) form.set("code_verifier", stored.verifier);

  const tokenRes = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: form.toString(),
  });
  const data = (await tokenRes.json().catch(() => ({}))) as Record<string, unknown>;

  // Normalize across providers.
  let accessToken: string | undefined;
  let refreshToken: string | undefined;
  let expiresIn: number | undefined;
  let account: string | undefined;
  let scopes: string[] = [];

  if (provider === "slack") {
    // chat:write etc. requested as user scopes → token under authed_user.
    const authedUser = data.authed_user as Record<string, unknown> | undefined;
    accessToken = (authedUser?.access_token as string) ?? (data.access_token as string);
    scopes = String((authedUser?.scope as string) ?? data.scope ?? "").split(/[, ]+/).filter(Boolean);
    account = (data.team as { name?: string } | undefined)?.name;
    if ((data as { ok?: boolean }).ok === false) return page({ ok: false, error: String(data.error) });
  } else {
    accessToken = data.access_token as string;
    refreshToken = data.refresh_token as string | undefined;
    expiresIn = data.expires_in as number | undefined;
    scopes = String((data.scope as string) ?? "").split(/[ ,]+/).filter(Boolean);
    if (provider === "google" && typeof data.id_token === "string") {
      account = decodeIdTokenEmail(data.id_token);
    }
  }

  if (!accessToken) return page({ ok: false, error: "no_access_token", detail: data });

  return page({
    ok: true,
    integration: stored.integration,
    provider,
    token: {
      accessToken,
      refreshToken: refreshToken ?? null,
      expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null,
      scopes,
      account: account ?? null,
    },
  });
}

function decodeIdTokenEmail(idToken: string): string | undefined {
  try {
    const payload = idToken.split(".")[1];
    const json = JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));
    return json.email as string | undefined;
  } catch {
    return undefined;
  }
}
