// Persistence backed by Neon Postgres (relational). Tables: pieces, deep_dives,
// practice_sessions, session_pieces (join), preferences. Persists on Vercel and
// is shared between local + deployed, so data syncs everywhere.
import { neon } from "@neondatabase/serverless";
import { randomUUID } from "crypto";
import type {
  DeepDive,
  Era,
  Henle,
  Piece,
  PieceStatus,
  PracticeSession,
  Preferences,
  SessionPiece,
  Stretch,
} from "./types";

function db() {
  // The Neon/Vercel integration sets both names; accept either.
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

type Sql = ReturnType<typeof db>;

let schemaReady = false;
async function ensureSchema(sql: Sql) {
  if (schemaReady) return;
  await sql`CREATE TABLE IF NOT EXISTS pieces (
    id uuid PRIMARY KEY,
    raw_input text NOT NULL,
    title text NOT NULL,
    composer text NOT NULL,
    era text NOT NULL,
    form text NOT NULL,
    henle smallint,
    status text NOT NULL,
    year_learned smallint,
    date_added timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS deep_dives (
    piece_id uuid PRIMARY KEY REFERENCES pieces(id) ON DELETE CASCADE,
    composer text NOT NULL,
    piece_story text NOT NULL,
    form_explainer text NOT NULL,
    theory_tidbits jsonb NOT NULL,
    listen_for text NOT NULL,
    generated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS practice_sessions (
    id uuid PRIMARY KEY,
    happened_at timestamptz NOT NULL DEFAULT now(),
    duration_min int,
    focus jsonb NOT NULL DEFAULT '[]',
    struggles jsonb NOT NULL DEFAULT '[]',
    summary text NOT NULL DEFAULT '',
    reflection text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS session_pieces (
    session_id uuid NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
    piece_id uuid REFERENCES pieces(id) ON DELETE SET NULL,
    piece_title text NOT NULL
  )`;
  await sql`CREATE TABLE IF NOT EXISTS preferences (
    id boolean PRIMARY KEY DEFAULT true,
    default_stretch text NOT NULL DEFAULT 'step-up',
    CHECK (id)
  )`;
  schemaReady = true;
}

const iso = (v: unknown): string => new Date(v as string).toISOString();

// --- Pieces ---------------------------------------------------------------

interface PieceRow {
  id: string;
  raw_input: string;
  title: string;
  composer: string;
  era: string;
  form: string;
  henle: number | null;
  status: string;
  year_learned: number | null;
  date_added: string;
}

function toPiece(r: PieceRow): Piece {
  return {
    id: r.id,
    rawInput: r.raw_input,
    title: r.title,
    composer: r.composer,
    era: r.era as Era,
    form: r.form,
    henle: (r.henle as Henle) ?? null,
    status: r.status as PieceStatus,
    yearLearned: r.year_learned ?? null,
    dateAdded: iso(r.date_added),
  };
}

export async function getPieces(): Promise<Piece[]> {
  const sql = db();
  await ensureSchema(sql);
  const rows = (await sql`
    SELECT * FROM pieces ORDER BY date_added DESC
  `) as PieceRow[];
  return rows.map(toPiece);
}

export async function getPiece(id: string): Promise<Piece | undefined> {
  const sql = db();
  await ensureSchema(sql);
  const rows = (await sql`SELECT * FROM pieces WHERE id = ${id}`) as PieceRow[];
  return rows[0] ? toPiece(rows[0]) : undefined;
}

export async function addPiece(
  fields: Omit<Piece, "id" | "dateAdded">,
): Promise<Piece> {
  const sql = db();
  await ensureSchema(sql);
  const piece: Piece = {
    ...fields,
    id: randomUUID(),
    dateAdded: new Date().toISOString(),
  };
  await sql`
    INSERT INTO pieces (id, raw_input, title, composer, era, form, henle, status, year_learned, date_added)
    VALUES (${piece.id}, ${piece.rawInput}, ${piece.title}, ${piece.composer},
            ${piece.era}, ${piece.form}, ${piece.henle}, ${piece.status},
            ${piece.yearLearned}, ${piece.dateAdded})
  `;
  return piece;
}

export async function updatePiece(
  id: string,
  patch: Partial<Omit<Piece, "id">>,
): Promise<Piece | undefined> {
  const existing = await getPiece(id);
  if (!existing) return undefined;
  const m = { ...existing, ...patch };
  const sql = db();
  await sql`
    UPDATE pieces SET
      raw_input = ${m.rawInput}, title = ${m.title}, composer = ${m.composer},
      era = ${m.era}, form = ${m.form}, henle = ${m.henle},
      status = ${m.status}, year_learned = ${m.yearLearned}
    WHERE id = ${id}
  `;
  return m;
}

export async function deletePiece(id: string): Promise<void> {
  const sql = db();
  await ensureSchema(sql);
  // deep_dives cascade; session_pieces.piece_id is set null by the FK.
  await sql`DELETE FROM pieces WHERE id = ${id}`;
}

// --- Deep dives -----------------------------------------------------------

export async function getDeepDive(
  pieceId: string,
): Promise<DeepDive | undefined> {
  const sql = db();
  await ensureSchema(sql);
  const rows = (await sql`
    SELECT * FROM deep_dives WHERE piece_id = ${pieceId}
  `) as Array<{
    composer: string;
    piece_story: string;
    form_explainer: string;
    theory_tidbits: string[];
    listen_for: string;
    generated_at: string;
  }>;
  const r = rows[0];
  if (!r) return undefined;
  return {
    composer: r.composer,
    pieceStory: r.piece_story,
    formExplainer: r.form_explainer,
    theoryTidbits: r.theory_tidbits,
    listenFor: r.listen_for,
    generatedAt: iso(r.generated_at),
  };
}

export async function setDeepDive(
  pieceId: string,
  dive: DeepDive,
): Promise<void> {
  const sql = db();
  await ensureSchema(sql);
  await sql`
    INSERT INTO deep_dives (piece_id, composer, piece_story, form_explainer, theory_tidbits, listen_for, generated_at)
    VALUES (${pieceId}, ${dive.composer}, ${dive.pieceStory}, ${dive.formExplainer},
            ${JSON.stringify(dive.theoryTidbits)}::jsonb, ${dive.listenFor}, ${dive.generatedAt})
    ON CONFLICT (piece_id) DO UPDATE SET
      composer = EXCLUDED.composer, piece_story = EXCLUDED.piece_story,
      form_explainer = EXCLUDED.form_explainer, theory_tidbits = EXCLUDED.theory_tidbits,
      listen_for = EXCLUDED.listen_for, generated_at = EXCLUDED.generated_at
  `;
}

// --- Practice sessions ----------------------------------------------------

export async function getSessions(): Promise<PracticeSession[]> {
  const sql = db();
  await ensureSchema(sql);
  const rows = (await sql`
    SELECT * FROM practice_sessions ORDER BY happened_at DESC
  `) as Array<{
    id: string;
    happened_at: string;
    duration_min: number | null;
    focus: string[];
    struggles: string[];
    summary: string;
    reflection: string;
    created_at: string;
  }>;
  const links = (await sql`
    SELECT session_id, piece_id, piece_title FROM session_pieces
  `) as Array<{ session_id: string; piece_id: string | null; piece_title: string }>;

  const bySession = new Map<string, SessionPiece[]>();
  for (const l of links) {
    const arr = bySession.get(l.session_id) ?? [];
    arr.push({ pieceId: l.piece_id, title: l.piece_title });
    bySession.set(l.session_id, arr);
  }

  return rows.map((r) => ({
    id: r.id,
    date: iso(r.happened_at),
    durationMin: r.duration_min ?? null,
    pieces: bySession.get(r.id) ?? [],
    focus: r.focus,
    struggles: r.struggles,
    summary: r.summary,
    reflection: r.reflection,
    dateAdded: iso(r.created_at),
  }));
}

export async function addSession(
  fields: Omit<PracticeSession, "id" | "dateAdded">,
): Promise<PracticeSession> {
  const sql = db();
  await ensureSchema(sql);
  const session: PracticeSession = {
    ...fields,
    id: randomUUID(),
    dateAdded: new Date().toISOString(),
  };
  await sql`
    INSERT INTO practice_sessions (id, happened_at, duration_min, focus, struggles, summary, reflection, created_at)
    VALUES (${session.id}, ${session.date}, ${session.durationMin},
            ${JSON.stringify(session.focus)}::jsonb, ${JSON.stringify(session.struggles)}::jsonb,
            ${session.summary}, ${session.reflection}, ${session.dateAdded})
  `;
  for (const p of session.pieces) {
    await sql`
      INSERT INTO session_pieces (session_id, piece_id, piece_title)
      VALUES (${session.id}, ${p.pieceId}, ${p.title})
    `;
  }
  return session;
}

export async function deleteSession(id: string): Promise<void> {
  const sql = db();
  await ensureSchema(sql);
  await sql`DELETE FROM practice_sessions WHERE id = ${id}`; // join rows cascade
}

// --- Preferences ----------------------------------------------------------

export async function getPreferences(): Promise<Preferences> {
  const sql = db();
  await ensureSchema(sql);
  const rows = (await sql`
    SELECT default_stretch FROM preferences WHERE id = true
  `) as Array<{ default_stretch: string }>;
  return { defaultStretch: (rows[0]?.default_stretch as Stretch) ?? "step-up" };
}

export async function setPreferences(
  patch: Partial<Preferences>,
): Promise<Preferences> {
  const current = await getPreferences();
  const next = { ...current, ...patch };
  const sql = db();
  await sql`
    INSERT INTO preferences (id, default_stretch) VALUES (true, ${next.defaultStretch})
    ON CONFLICT (id) DO UPDATE SET default_stretch = EXCLUDED.default_stretch
  `;
  return next;
}
