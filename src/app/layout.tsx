import type { Metadata } from "next";
import { Figtree, Fraunces } from "next/font/google";
import "./globals.css";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BrightNest Lab",
  description: "Portal Lab — cursanți",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ro"
      className={`${figtree.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="flex h-full flex-col overflow-hidden font-sans">
        {children}
      </body>
    </html>
  );
}
