import type { Metadata, Viewport } from "next";
import { Figtree, Newsreader } from "next/font/google";
import Link from "next/link";
import { RegisterSW } from "@/components/register-sw";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

const sans = Figtree({ subsets: ["latin"], variable: "--font-figtree" });
const serif = Newsreader({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-newsreader" });

export const metadata: Metadata = {
  title: { default: "FieldWorks", template: "%s · FieldWorks" },
  description: "Project and operations workspace for farms, engineering teams, classes, students, and practices.",
  applicationName: "FieldWorks",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#16324f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <RegisterSW />
        <a className="skip-link" href="#main">Skip to content</a>
        <div className="min-h-screen">{children}</div>
        <footer className="border-t border-line px-4 py-8 text-center text-sm">
          <p className="font-bold">
            <Link className="text-field underline underline-offset-2" href="https://codyza.com" target="_blank" rel="noopener noreferrer">
              Powered by Codyza
            </Link>
          </p>
          <p className="mt-2 text-ink/70">Each workspace keeps its own records. Charts sum what was stored.</p>
        </footer>
      </body>
    </html>
  );
}
