import { NextResponse, type NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { getCurrentUser } from "@/lib/auth/session";
import { getPlacesCollection } from "@/lib/db/models/place";
import { getPlacePhotosCollection } from "@/lib/db/models/placePhoto";
import { checkRateLimit } from "@/lib/rateLimit";
import { PHOTO_UPLOAD_DAILY_LIMIT, MAX_PHOTOS_PER_PLACE, ONE_DAY_MS } from "@/lib/rateLimit/tiers";
import { processUploadedImage, InvalidImageError, MAX_UPLOAD_BYTES } from "@/lib/storage/processImage";
import { uploadPlacePhoto } from "@/lib/storage/upload";

/**
 * POST /api/places/[id]/photos — upload a photo for a place. Same policy as
 * every other place-facing submission on this branch (commit d14e8cd):
 * lands `moderationStatus: "pending"`, only visible publicly once a
 * moderator approves it via /moderation's Photos tab.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser(request);
  if (!session) {
    return NextResponse.json({ error: "You must be logged in to upload a photo." }, { status: 401 });
  }
  if (!session.emailVerified) {
    return NextResponse.json({ error: "Verify your email before uploading a photo." }, { status: 403 });
  }

  const rate = await checkRateLimit({
    key: `photo:${session.sub}`,
    limit: PHOTO_UPLOAD_DAILY_LIMIT,
    windowMs: ONE_DAY_MS,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Daily photo upload limit reached (${PHOTO_UPLOAD_DAILY_LIMIT}/day). Try again tomorrow.` },
      { status: 429 },
    );
  }

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid place id" }, { status: 400 });
  }

  const places = await getPlacesCollection();
  const place = await places.findOne({ _id: new ObjectId(id), status: "published" });
  if (!place) {
    return NextResponse.json({ error: "Place not found" }, { status: 404 });
  }

  const photos = await getPlacePhotosCollection();
  const existingCount = await photos.countDocuments({
    placeId: place._id,
    moderationStatus: { $in: ["pending", "approved"] },
  });
  if (existingCount >= MAX_PHOTOS_PER_PLACE) {
    return NextResponse.json(
      { error: "This place already has the maximum number of photos." },
      { status: 409 },
    );
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' in form data." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB).` },
      { status: 400 },
    );
  }

  const rawBuffer = Buffer.from(await file.arrayBuffer());
  let processed: Buffer;
  try {
    processed = await processUploadedImage(rawBuffer);
  } catch (err) {
    const message = err instanceof InvalidImageError ? err.message : "Couldn't process that image.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { url } = await uploadPlacePhoto(processed, place._id.toHexString());

  const now = new Date();
  const userId = new ObjectId(session.sub);
  const photoDoc = {
    _id: new ObjectId(),
    placeId: place._id,
    url,
    uploadedBy: userId,
    uploadedAt: now,
    moderationStatus: "pending" as const,
  };
  await photos.insertOne(photoDoc);

  return NextResponse.json(
    { id: photoDoc._id.toHexString(), status: photoDoc.moderationStatus },
    { status: 201 },
  );
}
