import type { Metadata } from "next";
import type { ReactNode } from "react";
import { APP_NAME, APP_SHORT_NAME } from "@/config/app";
import "./globals.css";

// favicon.ico, icon.svg y apple-icon.png de esta carpeta generan sus propias
// etiquetas (convención de archivos de Next.js); ver docs/marca.md.
export const metadata: Metadata = {
  title: APP_NAME,
  description: "Monitoreo intensivo de la práctica independiente con historial e informes.",
  applicationName: APP_NAME,
  appleWebApp: { title: APP_SHORT_NAME },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
