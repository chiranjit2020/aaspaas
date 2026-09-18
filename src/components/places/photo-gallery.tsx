import Image from "next/image";
import type { PhotoSummary } from "@/lib/places/getApprovedPhotos";

/** Nothing rendered when there are no approved photos yet — no empty-state placeholder box. */
export function PhotoGallery({ photos }: { photos: PhotoSummary[] }) {
  if (photos.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {photos.map((photo) => (
        <div key={photo.id} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
          <Image
            src={photo.url}
            alt=""
            fill
            sizes="(min-width: 640px) 25vw, 33vw"
            className="object-cover"
          />
        </div>
      ))}
    </div>
  );
}
