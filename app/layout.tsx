import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.CF_PAGES_URL ??
  "https://daily-score.pages.dev";
const description =
  "一款数据只存于 iPhone 本机、支持离线使用和 iCloud Drive 备份的每日评分打卡应用。";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "每日评分",
    template: "%s · 每日评分",
  },
  description,
  applicationName: "每日评分",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "每日评分",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "每日评分",
    description: "把每一天，变得可见。本机保存、离线可用、支持 iCloud 备份。",
    type: "website",
    locale: "zh_CN",
    images: [
      {
        url: "/og.png",
        width: 1672,
        height: 941,
        alt: "每日评分——把每一天，变得可见",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "每日评分",
    description: "把每一天，变得可见。",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f3ed" },
    { media: "(prefers-color-scheme: dark)", color: "#101a1a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
