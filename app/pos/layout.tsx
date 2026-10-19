import type { Metadata, Viewport } from "next";

// The till is its own installable app: Add to Home Screen on the tablet opens
// straight to /pos, full-screen, and it keeps working offline.
export const metadata: Metadata = {
  title: "SGA Till",
  description: "Tablet till for SGA sales: catalogue, stock, cash box and stats.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "SGA Till", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#8B1A1A",
};

export default function TillLayout({ children }: { children: React.ReactNode }) {
  return <div className="till">{children}</div>;
}
