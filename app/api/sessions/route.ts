import { NextResponse } from "next/server";
import { addSession, getSessions } from "@/lib/store";

export async function GET() {
  const sessions = await getSessions();
  return NextResponse.json({ sessions });
}

// Logging is instant: we store the raw reflection only — no LLM call. The
// coach reads these raw reflections on demand when you ask for coaching.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const reflection: string = (body.reflection ?? "").trim();

  if (!reflection) {
    return NextResponse.json(
      { error: "Tell me how the session went." },
      { status: 400 },
    );
  }

  const session = await addSession({
    date: new Date().toISOString(),
    durationMin: null,
    pieces: [],
    focus: [],
    struggles: [],
    summary: "",
    reflection,
  });
  return NextResponse.json({ session });
}
