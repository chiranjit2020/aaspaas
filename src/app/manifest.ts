import type { MetadataRoute } from "next";

// PWA manifest — installable "app" icon uses the mascot (see public/icons/,
// generated from public/brand/mascot.png). Auto-linked by Next's app-dir
// convention, no <link rel="manifest"> needed in layout.tsx.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AasPaas — Discover what's around you",
    short_name: "AasPaas",
    description:
      "A community-powered directory of local shops, services and places — added, verified and corrected by the people who actually use them.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
