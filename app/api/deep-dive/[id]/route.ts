import { NextResponse } from "next/server";
import { getDeepDive, getPiece, setDeepDive } from "@/lib/store";
import { generateDeepDive } from "@/lib/anthropic";
import type { DeepDive } from "@/lib/types";

// Returns the cached deep-dive if we have one, otherwise generates, caches,
// and returns it. Pass ?refresh=1 to force regeneration.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";

  if (!refresh) {
    const cached = await getDeepDive(id);
    if (cached) return NextResponse.json({ deepDive: cached, cached: true });
  }

  const piece = await getPiece(id);
  if (!piece) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    const generated = await generateDeepDive(piece);
    const deepDive: DeepDive = {
      ...generated,
      generatedAt: new Date().toISOString(),
    };
    await setDeepDive(id, deepDive);
    return NextResponse.json({ deepDive, cached: false });
  } catch (err) {
    console.error("deep-dive failed", err);
    return NextResponse.json(
      { error: "Couldn't generate a deep dive right now." },
      { status: 502 },
    );
  }
}
