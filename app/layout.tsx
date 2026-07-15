import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/chrome/theme";
import { SolanaProvider } from "@/components/chrome/solana-provider";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["opsz", "SOFT"],
  weight: "variable",
  style: ["normal", "italic"],
  display: "swap",
});

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["300", "400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Xome, an AI agent that actually does things",
    template: "%s · Xome",
  },
  description:
    "50+ models, 10+ integrations, any MCP server, your own skills. Run models in your browser or bring your own Claude / GPT / Gemini key. Connects Gmail, Calendar, Slack, Notion, GitHub, a Solana wallet, and your files. Every write asks first.",
  applicationName: "Xome",
  appleWebApp: { capable: true, title: "Xome", statusBarStyle: "default" },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a1c" },
  ],
};

// Applies persisted theme + accent before first paint to avoid a flash.
const themeBootstrap = `(function(){try{
  var p=JSON.parse(localStorage.getItem('xome.prefs')||'{}');
  var t=p.theme||'system';
  var dark=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
  if(dark)document.documentElement.classList.add('dark');
  document.documentElement.setAttribute('data-accent',p.accent||'indigo');
}catch(e){document.documentElement.setAttribute('data-accent','indigo');}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className={`${fraunces.variable} ${geist.variable} ${mono.variable}`}>
        <ThemeProvider>
          <SolanaProvider>{children}</SolanaProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
