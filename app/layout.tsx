import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PRESSROOM — 나의 뉴스 데스크",
  description: "다양한 언론사의 온라인 1면과 사설, 공통 보도 순위를 한 곳에서 읽는 나만의 뉴스 데스크.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
