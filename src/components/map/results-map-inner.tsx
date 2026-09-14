"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatDistance } from "@/lib/places/formatDistance";
import type { PlaceSummary } from "@/types/domain";
import {
  ensureLeafletMarkerIconPatched,
  prefersReducedMotion,
  OSM_TILE_URL,
  OSM_ATTRIBUTION,
} from "./leaflet-setup";

export interface ResultsMapInnerProps {
  places: PlaceSummary[];
  userCoords?: { lat: number; lng: number } | null;
  className?: string;
}

// Fallback center/zoom when there's nothing to fit bounds to yet — AasPaas's
// launch region (Habra and the surrounding North 24 Parganas localities the
// seed data covers), not an arbitrary null-island default.
const FALLBACK_CENTER: [number, number] = [22.85, 88.66];
const FALLBACK_ZOOM = 12;

function userLocationIcon(): L.DivIcon {
  // className: "" strips Leaflet's default div-icon box/border so only the
  // inline-styled dot below renders.
  return L.divIcon({
    className: "",
    html: '<span class="block size-3.5 rounded-full border-2 border-white bg-[var(--color-location)] shadow-md" />',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

/** Keeps the map framed on whatever's currently plotted — re-fits whenever the result set or the user's own pin changes. */
function FitBounds({
  places,
  userCoords,
}: {
  places: PlaceSummary[];
  userCoords?: { lat: number; lng: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    const points: [number, number][] = places.map((p) => [p.location.lat, p.location.lng]);
    if (userCoords) points.push([userCoords.lat, userCoords.lng]);
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 15);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [32, 32] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, userCoords]);
  return null;
}

/** Multi-marker results map for the search page's map view. Never rendered server-side — see ./results-map.tsx. */
export function ResultsMapInner({ places, userCoords, className }: ResultsMapInnerProps) {
  useEffect(() => {
    ensureLeafletMarkerIconPatched();
  }, []);

  const reducedMotion = prefersReducedMotion();

  return (
    <MapContainer
      center={FALLBACK_CENTER}
      zoom={FALLBACK_ZOOM}
      zoomAnimation={!reducedMotion}
      fadeAnimation={!reducedMotion}
      markerZoomAnimation={!reducedMotion}
      className={cn("h-[420px] w-full rounded-xl border border-border", className)}
    >
      <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
      <FitBounds places={places} userCoords={userCoords} />
      {userCoords && (
        <Marker position={[userCoords.lat, userCoords.lng]} icon={userLocationIcon()}>
          <Popup>You are here</Popup>
        </Marker>
      )}
      {places.map((place) => (
        <Marker key={place.id} position={[place.location.lat, place.location.lng]}>
          <Popup>
            <div className="space-y-1">
              <p className="font-semibold">{place.name}</p>
              <p className="text-xs text-muted-foreground">{place.category.name}</p>
              {typeof place.distanceMeters === "number" && (
                <p className="text-xs text-muted-foreground">{formatDistance(place.distanceMeters)}</p>
              )}
              <Link href={`/places/${place.slug}`} className="text-xs font-medium text-location hover:underline">
                View place
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
