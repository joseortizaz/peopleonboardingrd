import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "People Onboarding RD — Gestión de RR.HH. para empresas dominicanas",
  description:
    "Suite de gestión humana para empresas dominicanas y firmas de outsourcing de RR.HH.: reclutamiento, nómina, asistencia, beneficios, desempeño y documentos, con las reglas laborales de República Dominicana integradas.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
