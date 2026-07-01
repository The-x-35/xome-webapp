"use client";

import { useEffect } from "react";
import bs58 from "bs58";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { useWallets, useSignAndSendTransaction } from "@privy-io/react-auth/solana";
import { VersionedTransaction, Transaction } from "@solana/web3.js";
import { setSolanaWallet } from "@/lib/integrations/solana/wallet-bridge";

/**
 * Mounts Privy (only when NEXT_PUBLIC_PRIVY_APP_ID is set) and bridges the user's
 * embedded Solana wallet into the module-level wallet-bridge that the agent's
 * Solana tools read. With no app id the app renders untouched — Solana just
 * shows "not configured" in Connections.
 */

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const CHAIN = "solana:mainnet" as const;

function WalletBridge() {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();

  useEffect(() => {
    const wallet = wallets?.[0];
    if (!authenticated || !wallet?.address) {
      setSolanaWallet(null);
      return;
    }
    setSolanaWallet({
      address: wallet.address,
      signAndSend: async (tx: VersionedTransaction | Transaction) => {
        const bytes =
          tx instanceof VersionedTransaction ? tx.serialize() : new Uint8Array(tx.serialize());
        const { signature } = await signAndSendTransaction({ transaction: bytes, wallet, chain: CHAIN });
        return bs58.encode(signature);
      },
    });
  }, [authenticated, wallets, signAndSendTransaction]);

  return null;
}

export function SolanaProvider({ children }: { children: React.ReactNode }) {
  if (!APP_ID) return <>{children}</>;
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        embeddedWallets: {
          solana: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      <WalletBridge />
      {children}
    </PrivyProvider>
  );
}

/** Whether Privy is configured (used by the Connections UI). */
export const isSolanaConfigured = !!APP_ID;
