import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  processUploadedImage,
  InvalidImageError,
  MAX_UPLOAD_BYTES,
} from "@/lib/storage/processImage";

async function makePng(): Promise<Buffer> {
  return sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 200, g: 50, b: 50 } } })
    .png()
    .toBuffer();
}

async function makeJpegWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 200, b: 30 } } })
    .withMetadata({ exif: { IFD0: { Make: "TestCam" } } })
    .jpeg()
    .toBuffer();
}

describe("processUploadedImage", () => {
  it("re-encodes a valid PNG to JPEG", async () => {
    const png = await makePng();
    const out = await processUploadedImage(png);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
  });

  it("strips EXIF metadata on re-encode", async () => {
    const jpegWithExif = await makeJpegWithExif();
    const beforeMeta = await sharp(jpegWithExif).metadata();
    expect(beforeMeta.exif).toBeDefined();

    const out = await processUploadedImage(jpegWithExif);
    const afterMeta = await sharp(out).metadata();
    expect(afterMeta.exif).toBeUndefined();
  });

  it("rejects bytes that aren't a recognized image", async () => {
    await expect(processUploadedImage(Buffer.from("not an image, just text"))).rejects.toThrow(
      InvalidImageError,
    );
  });

  it("rejects an empty buffer", async () => {
    await expect(processUploadedImage(Buffer.alloc(0))).rejects.toThrow(InvalidImageError);
  });

  it("rejects a buffer over the raw size cap before decoding", async () => {
    const oversized = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
    await expect(processUploadedImage(oversized)).rejects.toThrow(InvalidImageError);
  });

  it("caps output dimensions to the long-edge limit", async () => {
    const big = await sharp({
      create: { width: 3000, height: 1000, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const out = await processUploadedImage(big);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBeLessThanOrEqual(1600);
    expect(meta.height).toBeLessThanOrEqual(1600);
  });
});
