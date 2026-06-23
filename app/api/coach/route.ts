import { NextResponse } from "next/server";
import { getSessions } from "@/lib/store";
import { generateCoaching } from "@/lib/anthropic";

export async function POST() {
  const sessions = await getSessions();
  if (sessions.length === 0) {
    return NextResponse.json(
      { error: "Log a session or two first so I have something to go on." },
      { status: 400 },
    );
  }

  try {
    const coaching = await generateCoaching(sessions);
    return NextResponse.json({ coaching });
  } catch (err) {
    console.error("coaching failed", err);
    return NextResponse.json(
      { error: "Couldn't generate coaching right now." },
      { status: 502 },
    );
  }
}
