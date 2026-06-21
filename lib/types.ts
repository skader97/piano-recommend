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

export interface DataStore {
  pieces: Piece[];
  deepDives: Record<string, DeepDive>; // keyed by piece id
  preferences: Preferences;
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
