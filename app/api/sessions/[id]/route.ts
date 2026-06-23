import { NextResponse } from "next/server";
import { deleteSession } from "@/lib/store";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await deleteSession(id);
  return NextResponse.json({ ok: true });
}
