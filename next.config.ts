import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  // WebLLM ships heavy WASM/WebGPU assets and pulls model shards at runtime;
  // keep it out of the server bundle and let it load client-side only.
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false };
    // Privy references optional connectors we don't use (Stripe on-ramp,
    // Farcaster mini-app). Stub them to empty modules so bundling stays clean.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@stripe/crypto": false,
      "@farcaster/mini-app-solana": false,
    };
    return config;
  },
  async headers() {
    // WebGPU + cross-origin model shard fetches behave best with permissive
    // COOP/COEP off (web-llm fetches from HF/CDN which lack CORP headers).
    return [];
  },
};

export default nextConfig;
