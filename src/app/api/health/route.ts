import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/connect";

export async function GET() {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return NextResponse.json({ status: "ok", db: "connected" });
  } catch (err) {
    console.error("Health check failed:", err);
    return NextResponse.json({ status: "error", db: "unreachable" }, { status: 503 });
  }
}
