"use client";

/**
 * Shared one-time Leaflet setup, imported only from inside the "*-inner.tsx"
 * map components that are themselves only ever reached through a
 * next/dynamic({ ssr: false }) boundary — this file touches `document` at
 * import time (via leaflet's own CSS/Icon internals) and would throw during
 * SSR if imported anywhere else.
 *
 * Leaflet's default marker icon resolves its image URLs assuming a classic,
 * non-bundled script-tag deployment, which breaks under any bundler
 * (Next/Webpack/Turbopack included) — the icon just silently fails to load.
 * The standard fix: serve the three marker PNGs ourselves from /public and
 * point L.Marker's default icon at them explicitly, once.
 */
import "leaflet/dist/leaflet.css";
import L from "leaflet";

let patched = false;

export function ensureLeafletMarkerIconPatched(): void {
  if (patched) return;
  patched = true;
  L.Marker.prototype.options.icon = L.icon({
    iconUrl: "/leaflet/marker-icon.png",
    iconRetinaUrl: "/leaflet/marker-icon-2x.png",
    shadowUrl: "/leaflet/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
}

/** Respect the user's motion preference for pan/zoom/marker animation. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
