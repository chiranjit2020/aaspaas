import { v2 as cloudinary } from "cloudinary";

/**
 * Signed server-side upload only — the API secret lives in this module,
 * never sent to the browser (§2's "Secrets leakage" row). Callers pass an
 * already-processed buffer (see processImage.ts); this module doesn't
 * re-validate content, just uploads it.
 */

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary env vars are not set (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET) — see .env.example.",
    );
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  configured = true;
}

export interface UploadedPhoto {
  url: string;
}

export async function uploadPlacePhoto(buffer: Buffer, placeId: string): Promise<UploadedPhoto> {
  ensureConfigured();
  const result = await cloudinary.uploader.upload(
    `data:image/jpeg;base64,${buffer.toString("base64")}`,
    {
      folder: `aaspaas/places/${placeId}`,
      resource_type: "image",
      unique_filename: true,
      overwrite: false,
    },
  );
  return { url: result.secure_url };
}
