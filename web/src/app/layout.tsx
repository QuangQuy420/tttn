import type { Metadata } from "next";
import { Playfair_Display, Work_Sans } from "next/font/google";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import "./globals.css";

// NFR3: loaded via next/font/google (not a runtime <link> fetch) and exposed as CSS variables so
// globals.css can reference them from any class, not just page-scoped ones.
const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-playfair",
});

const workSans = Work_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-worksans",
});

export const metadata: Metadata = {
  title: "Smart Eyewear",
  description: "Browse eyewear, find your face shape, and try frames on virtually.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${playfairDisplay.variable} ${workSans.variable}`}>
      <body>
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
