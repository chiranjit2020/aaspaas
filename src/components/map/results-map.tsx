"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Leaflet touches `document` at import time, so it can never be part of a
 * server-rendered bundle — `ssr: false` is load-bearing here, which is why
 * this thin wrapper exists separately from ResultsMapInner.
 */
export const ResultsMap = dynamic(
  () => import("./results-map-inner").then((m) => m.ResultsMapInner),
  { ssr: false, loading: () => <Skeleton className="h-[420px] w-full rounded-xl" /> },
);
