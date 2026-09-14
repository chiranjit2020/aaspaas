"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Leaflet touches `document` at import time, so it can never be part of a
 * server-rendered bundle — `ssr: false` is load-bearing here, which is why
 * this thin wrapper (importable from a Server Component like the
 * place-detail page) exists separately from PlaceMiniMapInner.
 */
export const PlaceMiniMap = dynamic(
  () => import("./place-mini-map-inner").then((m) => m.PlaceMiniMapInner),
  { ssr: false, loading: () => <Skeleton className="h-[220px] w-full rounded-xl" /> },
);
