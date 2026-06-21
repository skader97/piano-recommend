// Tiny JSON-file persistence. Single-user MVP: read-modify-write the whole file.
// Lives server-side only (uses fs). The file is gitignored — it's your personal data.
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  DataStore,
  DeepDive,
  Piece,
  Preferences,
} from "./types";

const DATA_PATH = path.join(process.cwd(), "data.json");

const EMPTY: DataStore = {
  pieces: [],
  deepDives: {},
  preferences: { defaultStretch: "step-up" },
};

async function readStore(): Promise<DataStore> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<DataStore>;
    // Be forgiving about a partially-shaped file: backfill fields added later.
    return {
      pieces: (parsed.pieces ?? []).map((p) => ({
        ...p,
        yearLearned: p.yearLearned ?? null,
      })),
      deepDives: parsed.deepDives ?? {},
      preferences: parsed.preferences ?? EMPTY.preferences,
    };
  } catch {
    // No file yet (or unreadable) — start empty.
    return structuredClone(EMPTY);
  }
}

async function writeStore(data: DataStore): Promise<void> {
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), "utf8");
}

// --- Pieces ---------------------------------------------------------------

export async function getPieces(): Promise<Piece[]> {
  const { pieces } = await readStore();
  // Newest first.
  return [...pieces].sort((a, b) => b.dateAdded.localeCompare(a.dateAdded));
}

export async function getPiece(id: string): Promise<Piece | undefined> {
  const { pieces } = await readStore();
  return pieces.find((p) => p.id === id);
}

// Add a normalized piece. Caller supplies everything except id/dateAdded.
export async function addPiece(
  fields: Omit<Piece, "id" | "dateAdded">,
): Promise<Piece> {
  const data = await readStore();
  const piece: Piece = {
    ...fields,
    id: randomUUID(),
    dateAdded: new Date().toISOString(),
  };
  data.pieces.push(piece);
  await writeStore(data);
  return piece;
}

export async function updatePiece(
  id: string,
  patch: Partial<Omit<Piece, "id">>,
): Promise<Piece | undefined> {
  const data = await readStore();
  const piece = data.pieces.find((p) => p.id === id);
  if (!piece) return undefined;
  Object.assign(piece, patch);
  await writeStore(data);
  return piece;
}

export async function deletePiece(id: string): Promise<void> {
  const data = await readStore();
  data.pieces = data.pieces.filter((p) => p.id !== id);
  delete data.deepDives[id]; // drop its cached deep-dive too
  await writeStore(data);
}

// --- Deep dives (cached learning content) ---------------------------------

export async function getDeepDive(
  pieceId: string,
): Promise<DeepDive | undefined> {
  const { deepDives } = await readStore();
  return deepDives[pieceId];
}

export async function setDeepDive(
  pieceId: string,
  dive: DeepDive,
): Promise<void> {
  const data = await readStore();
  data.deepDives[pieceId] = dive;
  await writeStore(data);
}

// --- Preferences ----------------------------------------------------------

export async function getPreferences(): Promise<Preferences> {
  const { preferences } = await readStore();
  return preferences;
}

export async function setPreferences(
  patch: Partial<Preferences>,
): Promise<Preferences> {
  const data = await readStore();
  data.preferences = { ...data.preferences, ...patch };
  await writeStore(data);
  return data.preferences;
}
