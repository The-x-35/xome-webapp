import { NextRequest } from "next/server";
import { providerConfig, INTEGRATION_AUTH } from "@/lib/integrations/oauth-config";

/** Refresh an access token using the stored refresh token + the server-side
 *  client secret. The browser sends the refresh token; we return fresh tokens.
 *  Stateless — nothing stored here. (Google/GitHub support refresh; Slack user
 *  tokens generally don't expire.) */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { integration?: string; refreshToken?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const auth = body.integration ? INTEGRATION_AUTH[body.integration] : undefined;
  if (!auth || !body.refreshToken) return Response.json({ error: "bad_request" }, { status: 400 });

  const cfg = providerConfig(auth.provider);
  if (!cfg.clientId || !cfg.clientSecret) return Response.json({ error: "not_configured" }, { status: 501 });

  const form = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
    refresh_token: body.refreshToken,
  });

  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: form.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const accessToken = data.access_token as string | undefined;
  if (!accessToken) return Response.json({ error: "refresh_failed", detail: data }, { status: 400 });

  return Response.json({
    accessToken,
    // Google may rotate the refresh token; keep the new one if present.
    refreshToken: (data.refresh_token as string) ?? body.refreshToken,
    expiresAt: data.expires_in ? Date.now() + (data.expires_in as number) * 1000 : null,
  });
}
