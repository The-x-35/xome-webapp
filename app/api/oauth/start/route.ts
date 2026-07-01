import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { providerConfig, INTEGRATION_AUTH, redirectUri, requestOrigin } from "@/lib/integrations/oauth-config";

/** Begins an OAuth flow (opened in a popup). Stashes state + PKCE verifier in a
 *  short-lived httpOnly cookie, then 302-redirects to the provider. */
export const runtime = "nodejs";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function GET(req: NextRequest) {
  const integration = req.nextUrl.searchParams.get("integration") ?? "";
  const auth = INTEGRATION_AUTH[integration];
  if (!auth) return new NextResponse("Unknown integration", { status: 400 });

  const origin = requestOrigin(req);
  const cfg = providerConfig(auth.provider, origin);
  if (!cfg.clientId || !cfg.clientSecret) {
    return new NextResponse(
      `${auth.provider} OAuth is not configured. Set ${auth.provider.toUpperCase()}_CLIENT_ID and _SECRET in env.`,
      { status: 501 },
    );
  }

  const state = b64url(crypto.randomBytes(16));
  const verifier = cfg.usesPkce ? b64url(crypto.randomBytes(32)) : "";

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri(origin, auth.provider),
    response_type: "code",
    scope: auth.scopes.join(" "),
    state,
  });
  if (auth.provider === "google") {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
    params.set("include_granted_scopes", "true");
  }
  if (cfg.usesPkce) {
    const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
    params.set("code_challenge", challenge);
    params.set("code_challenge_method", "S256");
  }
  if (auth.provider === "slack") {
    // Slack splits bot vs user scopes; request these as user scopes.
    params.delete("scope");
    params.set("user_scope", auth.scopes.join(" "));
  }

  const cookieStore = await cookies();
  cookieStore.set(
    `xome_oauth_${auth.provider}`,
    JSON.stringify({ integration, state, verifier }),
    { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" },
  );

  return NextResponse.redirect(`${cfg.authorizeUrl}?${params.toString()}`);
}
