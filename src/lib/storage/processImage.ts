import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";

/**
 * §2's XSS/upload row: "content-sniffed (not extension-checked), re-encoded,
 * EXIF stripped, size-capped before Cloudinary." All four happen here, in
 * order, before anything reaches the network.
 */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // raw upload cap, checked before decoding
const MAX_OUTPUT_DIMENSION = 1600; // long edge, px
const OUTPUT_QUALITY = 82;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export class InvalidImageError extends Error {}

/**
 * Sniffs the real file type from bytes (never trusts the client's declared
 * MIME type or filename extension), re-encodes to JPEG via sharp, and
 * returns the processed buffer. Re-encoding through sharp without calling
 * `.withMetadata()` strips all embedded EXIF/GPS metadata as a side effect
 * — that's deliberate, not an oversight, so don't add `.withMetadata()`
 * here without re-reading why.
 */
export async function processUploadedImage(buffer: Buffer): Promise<Buffer> {
  if (buffer.byteLength === 0) {
    throw new InvalidImageError("Empty file.");
  }
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new InvalidImageError(
      `File too large (max ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB).`,
    );
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
    throw new InvalidImageError("File isn't a recognized JPEG, PNG or WebP image.");
  }

  try {
    return await sharp(buffer)
      .rotate() // apply EXIF orientation before it's stripped
      .resize({
        width: MAX_OUTPUT_DIMENSION,
        height: MAX_OUTPUT_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: OUTPUT_QUALITY })
      .toBuffer();
  } catch {
    throw new InvalidImageError("Couldn't process that image — it may be corrupt.");
  }
}
