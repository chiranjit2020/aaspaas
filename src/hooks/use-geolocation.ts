"use client";

import { useCallback, useState } from "react";

/**
 * Shared browser-geolocation hook for anything that needs "where is the
 * user right now" as a one-shot lookup (as opposed to add-place-form.tsx's
 * inline useCurrentLocation, which formats coordinates into form-field
 * strings and manages its own manual-entry fallback — different enough
 * concerns to leave that one as-is rather than force both onto one hook).
 *
 * Same UX conventions as that form: enableHighAccuracy + a 10s timeout, and
 * a permission-denied-specific message vs. a generic failure message.
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

export type GeolocationErrorReason = "unsupported" | "permission_denied" | "unavailable";

export interface GeolocationErrorInfo {
  reason: GeolocationErrorReason;
  message: string;
}

export interface UseGeolocationResult {
  coords: Coordinates | null;
  locating: boolean;
  error: GeolocationErrorInfo | null;
  /** Kicks off a fresh browser location request. */
  locate: () => void;
  /** Clears coords/error — e.g. to turn a "near me" toggle back off. */
  reset: () => void;
}

export function useGeolocation(): UseGeolocationResult {
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<GeolocationErrorInfo | null>(null);

  const locate = useCallback(() => {
    setError(null);
    if (!("geolocation" in navigator)) {
      setError({ reason: "unsupported", message: "Your browser doesn't support location." });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? { reason: "permission_denied", message: "Location access was denied." }
            : { reason: "unavailable", message: "Couldn't get your location." },
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  const reset = useCallback(() => {
    setCoords(null);
    setError(null);
  }, []);

  return { coords, locating, error, locate, reset };
}
