import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import NextTopLoader from "nextjs-toploader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://social0.app";
const title = "Social0 – Schedule & post to all social accounts in one place";
const description =
  "One post, eight platforms, zero hassle. Plan, schedule and publish to LinkedIn, X, Instagram, Threads, and more from one dashboard. Start free today—no credit card required.";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title,
  description,
  alternates: { canonical: baseUrl },
  openGraph: {
    type: "website",
    url: baseUrl,
    siteName: "Social0",
    title,
    description,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Social0 – Schedule and post to all your social accounts from one place",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
  icons: {
    icon: "/logo-circular.png",
    apple: "/logo-dark.png",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${baseUrl}/#organization`,
      name: "Social0",
      url: baseUrl,
      logo: { "@type": "ImageObject", url: `${baseUrl}/logo-dark.png` },
    },
    {
      "@type": "WebSite",
      "@id": `${baseUrl}/#website`,
      url: baseUrl,
      name: "Social0",
      description,
      publisher: { "@id": `${baseUrl}/#organization` },
      inLanguage: "en",
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/logo-circular.png" />
        <link rel="apple-touch-icon" href="/logo-dark.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <NextTopLoader
            color="#10b981"
            height={4}
            showSpinner={false}
            shadow={false}
          />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
