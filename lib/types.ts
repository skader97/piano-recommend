// Shared domain types for piano-recommend.

export type Era =
  | "Baroque"
  | "Classical"
  | "Romantic"
  | "Impressionist"
  | "Modern"
  | "Contemporary"
  | "Other";

export const ERAS: Era[] = [
  "Baroque",
  "Classical",
  "Romantic",
  "Impressionist",
  "Modern",
  "Contemporary",
  "Other",
];

// Where a piece sits in your life right now.
export type PieceStatus = "playing" | "learning" | "want";

// Henle difficulty: the piano-world standard, 1 (easiest) – 9 (hardest).
export type Henle = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface Piece {
  id: string;
  rawInput: string; // exactly what you typed, e.g. "Chopin Nocturne Op.9 No.2"
  title: string; // normalized, e.g. "Nocturne in E-flat major, Op. 9 No. 2"
  composer: string;
  era: Era;
  form: string; // e.g. "Nocturne", "Two-part Invention", "Sonata"
  henle: Henle | null; // null if Claude can't confidently place it
  status: PieceStatus;
  yearLearned: number | null; // year you learned/started it; null if unset
  dateAdded: string; // ISO date
}

// Generated learning content for a single piece (cached so we don't re-call the API).
export interface DeepDive {
  composer: string; // a tight snapshot, not a full bio
  pieceStory: string; // when/why written, what's notable
  formExplainer: string; // "what is a nocturne?" — teach the genre
  theoryTidbits: string[]; // 2–4 specific things to notice while playing
  listenFor: string; // one thing to listen for in a great recording
  generatedAt: string; // ISO timestamp
}

export interface Preferences {
  defaultStretch: Stretch;
}

// How much harder than your current level you want to push.
export type Stretch = "same" | "step-up" | "reach";

// One piece touched in a session. pieceId is null when the mentioned piece
// isn't in the repertoire (or was later deleted); title always carries a label.
export interface SessionPiece {
  pieceId: string | null;
  title: string;
}

// A logged practice session — structured from a voice/typed reflection.
export interface PracticeSession {
  id: string;
  date: string; // ISO date the practice happened (defaults to now)
  durationMin: number | null; // minutes practiced, if known
  pieces: SessionPiece[]; // pieces worked on (→ session_pieces rows)
  focus: string[]; // what was worked on
  struggles: string[]; // pain points / trouble spots
  summary: string; // one-line recap
  reflection: string; // the raw voice/typed reflection
  dateAdded: string; // ISO timestamp the log was created
}

// What Claude extracts from a practice reflection.
export interface StructuredSession {
  durationMin: number | null;
  pieces: SessionPiece[];
  focus: string[];
  struggles: string[];
  summary: string;
}

// The coach's structured feedback over recent sessions.
export interface Coaching {
  headline: string;
  observations: string[];
  suggestions: string[];
  nextGoal: string;
}

// Mode for the recommender.
export type RecommendMode = "similar" | "lucky";

export interface Recommendation {
  title: string;
  composer: string;
  era: Era;
  form: string; // so it can be added straight to the repertoire
  henle: Henle | null;
  why: string; // why this fits you specifically
  newChallenge: string; // the new skill/idea it introduces
}
