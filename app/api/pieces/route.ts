import { NextResponse } from "next/server";
import { addPiece, getPieces } from "@/lib/store";
import { normalizePieces } from "@/lib/anthropic";
import type { Era, Henle, PieceStatus } from "@/lib/types";

export async function GET() {
  const pieces = await getPieces();
  return NextResponse.json({ pieces });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const rawInput: string = (body.rawInput ?? "").trim();
  const status: PieceStatus = body.status ?? "playing";
  const yearLearned: number | null =
    typeof body.yearLearned === "number" ? body.yearLearned : null;

  // Direct add of an already-structured piece (e.g. a recommendation) — no
  // need to re-identify it with Claude.
  if (body.piece && typeof body.piece === "object") {
    const f = body.piece;
    if (!f.title || !f.composer) {
      return NextResponse.json(
        { error: "piece needs a title and composer" },
        { status: 400 },
      );
    }
    const piece = await addPiece({
      rawInput: `${f.composer} ${f.title}`,
      status,
      yearLearned,
      title: String(f.title),
      composer: String(f.composer),
      era: (f.era ?? "Other") as Era,
      form: String(f.form ?? ""),
      henle: (f.henle ?? null) as Henle | null,
    });
    return NextResponse.json({ pieces: [piece] }, { status: 201 });
  }

  if (!rawInput) {
    return NextResponse.json({ error: "rawInput is required" }, { status: 400 });
  }

  try {
    const parsed = await normalizePieces(rawInput);
    if (parsed.length === 0) {
      return NextResponse.json(
        { error: "Couldn't identify any pieces there. Try adding the composer." },
        { status: 502 },
      );
    }
    // Add in order; newest-first sorting happens on read.
    const pieces = [];
    for (const fields of parsed) {
      pieces.push(await addPiece({ rawInput, status, yearLearned, ...fields }));
    }
    return NextResponse.json({ pieces }, { status: 201 });
  } catch (err) {
    console.error("normalize/add failed", err);
    return NextResponse.json(
      { error: "Couldn't identify those pieces. Try adding the composer." },
      { status: 502 },
    );
  }
}
