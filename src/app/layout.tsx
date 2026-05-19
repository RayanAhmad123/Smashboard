import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import AnalyticsBeacon from "@/components/AnalyticsBeacon";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://triadsolutions.se"),
  title: {
    default:
      "Smashboard — Turneringssystem för padelhallar | Mexicano & Americano på TV",
    template: "%s · Smashboard",
  },
  description:
    "Smashboard är turneringssystemet för padelhallar. Kör Mexicano, Americano och Lag-Mexicano med live TV-display via HDMI. White-label från 499 kr/mån — utan bindningstid.",
  applicationName: "Smashboard",
  category: "Sports tournament software",
  keywords: [
    "padel",
    "padelturnering",
    "padelturneringar",
    "mexicano padel",
    "americano padel",
    "lag-mexicano",
    "padelhall",
    "padelhallar",
    "turneringssystem padel",
    "padelturnering app",
    "padel scoreboard",
    "padel tv display",
    "white label padel",
    "smashboard",
    "triad solutions",
  ],
  authors: [{ name: "Triad Solutions", url: "https://triadsolutions.se" }],
  creator: "Triad Solutions",
  publisher: "Triad Solutions",
  alternates: {
    canonical: "/",
    languages: {
      "sv-SE": "/",
    },
  },
  openGraph: {
    type: "website",
    locale: "sv_SE",
    url: "https://triadsolutions.se",
    siteName: "Smashboard",
    title:
      "Smashboard — Turneringssystem för padelhallar | Mexicano & Americano live på TV",
    description:
      "Storskärmen som dina spelare stannar för. Mexicano, Americano och Lag-Mexicano med live TV-display — från 499 kr/mån, utan bindningstid.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Smashboard turneringsdisplay på TV — Mexicano live",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Smashboard — Turneringssystem för padelhallar",
    description:
      "Live TV-display för Mexicano, Americano och Lag-Mexicano. White-label från 499 kr/månad. Boka demo.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/icons/logo.svg",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sv"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <GoogleAnalytics />
        <Suspense fallback={null}>
          <AnalyticsBeacon />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
