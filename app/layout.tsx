import type { Metadata } from "next";
import "driver.js/dist/driver.css";
import "./globals.css";
import "./tour.css";

export const metadata: Metadata = {
  title: "IA Financeira Azure — seu dinheiro, com mais clareza",
  description: "Entenda seu orçamento, organize compromissos e planeje suas economias. Uma decisão possível de cada vez.",
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
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
