import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Monitoreo PI",
    short_name: "Monitoreo PI",
    description: "Monitoreo intensivo de la práctica independiente.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f6fa",
    theme_color: "#17375e",
    orientation: "any",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
