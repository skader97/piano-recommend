import { NextResponse } from "next/server";
import { deletePiece, updatePiece } from "@/lib/store";
import type { Piece, PieceStatus } from "@/lib/types";

const STATUSES: PieceStatus[] = ["playing", "learning", "want"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const patch: Partial<Pick<Piece, "status" | "yearLearned">> = {};

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    patch.status = body.status;
  }

  if ("yearLearned" in body) {
    const y = body.yearLearned;
    if (y !== null && (typeof y !== "number" || y < 1000 || y > 9999)) {
      return NextResponse.json({ error: "invalid year" }, { status: 400 });
    }
    patch.yearLearned = y;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const piece = await updatePiece(id, patch);
  if (!piece) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ piece });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await deletePiece(id);
  return NextResponse.json({ ok: true });
}
