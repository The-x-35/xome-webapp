"use client";

import { useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { Tag, Button, Spinner } from "@/components/ui/index";
import type { IntegrationDescriptor } from "@/lib/integrations/registry";
import { isSolanaConfigured } from "@/components/chrome/solana-provider";
import { getPrefs, setPrefs } from "@/lib/store/prefs";
import { emit } from "@/lib/store/bus";
import { BrandTile } from "./brand-icons";

function short(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

function Shell({
  descriptor,
  connected,
  subtitle,
  right,
}: {
  descriptor: IntegrationDescriptor;
  connected: boolean;
  subtitle: string;
  right: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <BrandTile id={descriptor.id} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-medium text-text">{descriptor.label}</span>
            {connected ? <Tag kind="success" dot>Connected</Tag> : <Tag kind="neutral">Not connected</Tag>}
          </div>
          <div className="mt-0.5 truncate text-[13px] text-text-2">{subtitle}</div>
        </div>
        <div className="shrink-0">{right}</div>
      </div>
    </div>
  );
}

/** Solana connection row. Uses Privy for login + embedded wallet. Auto-enables
 *  the "solana" integration (so its tools reach the model) while connected. */
export function SolanaRow({ descriptor }: { descriptor: IntegrationDescriptor }) {
  if (!isSolanaConfigured) {
    return (
      <Shell
        descriptor={descriptor}
        connected={false}
        subtitle="Set NEXT_PUBLIC_PRIVY_APP_ID to enable Solana."
        right={
          <Button variant="outlined" className="!px-4 !py-2 text-[13px]" disabled>
            Not configured
          </Button>
        }
      />
    );
  }
  return <SolanaRowInner descriptor={descriptor} />;
}

function SolanaRowInner({ descriptor }: { descriptor: IntegrationDescriptor }) {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const address = wallets?.[0]?.address ?? null;
  const connected = authenticated && !!address;

  useEffect(() => {
    const enabled = new Set(getPrefs().enabledIntegrations);
    if (connected) enabled.add("solana");
    else enabled.delete("solana");
    setPrefs({ enabledIntegrations: [...enabled] });
    emit("connections");
  }, [connected]);

  const right = !ready ? (
    <Spinner />
  ) : connected ? (
    <Button variant="outlined" className="!px-4 !py-2 text-[13px]" onClick={() => logout()}>
      Disconnect
    </Button>
  ) : (
    <Button className="!px-4 !py-2 text-[13px]" onClick={() => login()}>
      Connect
    </Button>
  );

  return (
    <Shell
      descriptor={descriptor}
      connected={connected}
      subtitle={connected && address ? `Wallet ${short(address)}` : descriptor.tagline}
      right={right}
    />
  );
}
