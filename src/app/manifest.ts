import type { MetadataRoute } from "next";
import { APP_NAME, APP_SHORT_NAME } from "@/config/app";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: "Monitoreo intensivo de la práctica independiente.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f6fa",
    theme_color: "#17375e",
    orientation: "any",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/brand/icono-app.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
