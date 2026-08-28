"use client";

import { useCallback, useEffect, useState } from "react";
import { INTEGRATIONS } from "@/lib/integrations/registry";
import { IntegrationRow } from "@/components/connections/integration-row";
import { SolanaRow } from "@/components/connections/solana-row";
import { MagicBlockRow } from "@/components/connections/magicblock-row";
import { WorkspaceRow } from "@/components/connections/workspace-row";
import { McpSection } from "@/components/connections/mcp-section";
import { getOAuth, getNotionToken } from "@/lib/store/secrets";
import { on } from "@/lib/store/bus";
import { IconShield } from "@/components/chrome/icons";

export default function ConnectionsPage() {
  const [state, setState] = useState<Record<string, { connected: boolean; account: string | null }>>({});

  const refresh = useCallback(async () => {
    const next: Record<string, { connected: boolean; account: string | null }> = {};
    for (const i of INTEGRATIONS) {
      if (i.authKind === "notion") {
        next[i.id] = { connected: !!(await getNotionToken()), account: "Workspace" };
      } else {
        const t = await getOAuth(i.id);
        next[i.id] = { connected: !!t, account: t?.account ?? null };
      }
    }
    setState(next);
  }, []);

  useEffect(() => {
    refresh();
    return on("connections", refresh);
  }, [refresh]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-3 font-display text-3xl font-medium tracking-[-0.02em]">Connections</h1>

        <div className="mb-7 flex items-start gap-3 rounded-[var(--radius-card)] border border-border bg-accent-soft px-4 py-3">
          <IconShield width={20} height={20} className="mt-0.5 shrink-0 text-accent-text" />
          <p className="text-[13px] leading-relaxed text-text">
            Local-first. Your tokens stay in this browser and ride out through a stateless proxy only when a tool runs -
            never stored on a Xome server. Reads are automatic; every write asks first.
          </p>
        </div>

        <section className="mb-8">
          <h2 className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-text-3">Apps</h2>
          <div className="flex flex-col gap-2.5">
            <WorkspaceRow />
            {INTEGRATIONS.map((i) =>
              i.authKind === "solana" ? (
                <SolanaRow key={i.id} descriptor={i} />
              ) : i.authKind === "magicblock" ? (
                <MagicBlockRow key={i.id} descriptor={i} />
              ) : (
                <IntegrationRow
                  key={i.id}
                  descriptor={i}
                  connected={state[i.id]?.connected ?? false}
                  account={state[i.id]?.account ?? null}
                  onChanged={refresh}
                />
              ),
            )}
          </div>
        </section>

        <McpSection />
      </div>
    </div>
  );
}
