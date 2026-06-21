import { NextResponse } from "next/server";
import { getPieces } from "@/lib/store";
import { recommend } from "@/lib/anthropic";
import type { RecommendMode, Stretch } from "@/lib/types";

const MODES: RecommendMode[] = ["similar", "lucky"];
const STRETCHES: Stretch[] = ["same", "step-up", "reach"];

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const mode: RecommendMode = MODES.includes(body.mode) ? body.mode : "similar";
  const stretch: Stretch = STRETCHES.includes(body.stretch)
    ? body.stretch
    : "step-up";

  const pieces = await getPieces();
  if (pieces.length === 0) {
    return NextResponse.json(
      { error: "Add a few pieces first so I have something to go on." },
      { status: 400 },
    );
  }

  try {
    const recommendations = await recommend(pieces, mode, stretch);
    return NextResponse.json({ recommendations });
  } catch (err) {
    console.error("recommend failed", err);
    return NextResponse.json(
      { error: "Couldn't generate recommendations right now." },
      { status: 502 },
    );
  }
}
