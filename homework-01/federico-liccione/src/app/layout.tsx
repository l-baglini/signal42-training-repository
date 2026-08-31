import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: '#18181b',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: "ProtestApp — Mappa di scioperi e manifestazioni in Italia",
  description: "Mappa interattiva di scioperi, cortei, manifestazioni e presidi in Italia. Filtra per regione, tipo e data. Ricevi notifiche email per il tuo territorio.",
  openGraph: {
    title: "ProtestApp ✊",
    description: "Mappa interattiva di scioperi, cortei e manifestazioni in Italia. Aggiornata quotidianamente da fonti istituzionali e canali della società civile.",
    url: "https://protestapp.vercel.app",
    siteName: "ProtestApp",
    locale: "it_IT",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "ProtestApp ✊",
    description: "Mappa interattiva di scioperi, cortei e manifestazioni in Italia.",
  },
  metadataBase: new URL("https://protestapp.vercel.app"),
  appleWebApp: {
    capable: true,
    title: 'ProtestApp',
    statusBarStyle: 'black-translucent',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`${inter.variable} h-full antialiased`}>
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          crossOrigin=""
        />
      </head>
      <body className="h-full flex flex-col bg-gray-50 text-gray-900">
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
