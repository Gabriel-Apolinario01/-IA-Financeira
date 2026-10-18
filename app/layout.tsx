import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IA Financeira — seu dinheiro, com mais clareza",
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
