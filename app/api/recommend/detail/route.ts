import { NextResponse } from "next/server";
import { getPieces } from "@/lib/store";
import { recommendationDetail } from "@/lib/anthropic";
import type { Recommendation } from "@/lib/types";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const rec: Recommendation | undefined = body.rec;

  if (!rec || !rec.title || !rec.composer) {
    return NextResponse.json({ error: "rec is required" }, { status: 400 });
  }

  try {
    const pieces = await getPieces();
    const detail = await recommendationDetail(rec, pieces);
    return NextResponse.json({ detail });
  } catch (err) {
    console.error("recommend detail failed", err);
    return NextResponse.json(
      { error: "Couldn't load more info right now." },
      { status: 502 },
    );
  }
}
