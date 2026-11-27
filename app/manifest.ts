import type { MetadataRoute } from "next";

// PWA: установка на экран «Домой» нужна и для push на iPhone (iOS 16.4+).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Status",
    short_name: "Status",
    description: "LitRPG-прокачка реальной жизни",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b0b14",
    theme_color: "#0b0b14",
    lang: "ru",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
