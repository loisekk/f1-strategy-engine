import type { Metadata, Viewport } from "next";
import { Saira_Condensed, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const sairaCondensed = Saira_Condensed({
  variable: "--font-saira",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "F1 Strategy Engine — Motorsport Intelligence System",
    template: "%s · F1 Strategy Engine",
  },
  description:
    "An intelligent Formula 1 strategy platform combining machine learning, telemetry analysis and race simulation. Pit-stop prediction trained on 101,371 laps of real race telemetry.",
  keywords: [
    "Formula 1",
    "F1 strategy",
    "pit stop prediction",
    "machine learning",
    "LightGBM",
    "telemetry",
    "race simulation",
  ],
  authors: [{ name: "F1 Strategy Engine" }],
  openGraph: {
    title: "F1 Strategy Engine",
    description:
      "Machine learning, telemetry analysis and race simulation — every second changes the race.",
    siteName: "F1 Strategy Engine",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${sairaCondensed.variable} ${inter.variable} ${plexMono.variable} antialiased`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
