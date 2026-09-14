"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { cn } from "@/lib/utils";
import {
  ensureLeafletMarkerIconPatched,
  prefersReducedMotion,
  OSM_TILE_URL,
  OSM_ATTRIBUTION,
} from "./leaflet-setup";

export interface PlaceMiniMapInnerProps {
  lat: number;
  lng: number;
  name: string;
  className?: string;
}

/** Single-pin embedded map for the place-detail page. Never rendered server-side — see ./place-mini-map.tsx. */
export function PlaceMiniMapInner({ lat, lng, name, className }: PlaceMiniMapInnerProps) {
  useEffect(() => {
    ensureLeafletMarkerIconPatched();
  }, []);

  const reducedMotion = prefersReducedMotion();

  return (
    <MapContainer
      center={[lat, lng]}
      zoom={16}
      scrollWheelZoom={false}
      zoomAnimation={!reducedMotion}
      fadeAnimation={!reducedMotion}
      markerZoomAnimation={!reducedMotion}
      className={cn("h-[220px] w-full rounded-xl border border-border", className)}
    >
      <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
      <Marker position={[lat, lng]}>
        <Popup>{name}</Popup>
      </Marker>
    </MapContainer>
  );
}
