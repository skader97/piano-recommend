// All Claude calls for piano-recommend live here. Three jobs:
//   normalizePiece  — free text → structured fields
//   generateDeepDive — a piece → cached learning content
//   recommend       — repertoire + mode + stretch → ranked picks
//
// Uses the Anthropic SDK with claude-opus-4-8 and structured JSON outputs
// (output_config.format) so responses come back schema-valid — no brittle parsing.
import Anthropic from "@anthropic-ai/sdk";
import type {
  DeepDive,
  Era,
  Piece,
  Recommendation,
  RecommendationDetail,
  RecommendMode,
  Stretch,
} from "./types";
import { ERAS } from "./types";

// Fast tier — recommendations/identify/deep-dives prioritize speed here.
const MODEL = "claude-haiku-4-5";

// The SDK reads ANTHROPIC_API_KEY from the environment (.env.local in dev).
const client = new Anthropic();

// Pull the JSON object out of a structured-output response. With
// output_config.format set, the first text block is guaranteed valid JSON.
function parseJson<T>(message: Anthropic.Message): T {
  const block = message.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Claude returned no text block");
  }
  return JSON.parse(block.text) as T;
}

const ERA_ENUM = ERAS as readonly string[];

// A Henle grade (1–9) or null when Claude can't confidently place it.
const henleSchema = {
  anyOf: [
    { type: "integer", enum: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    { type: "null" },
  ],
};

// --- 1. Normalize free text into one OR MORE pieces ---------------------

export interface NormalizedPiece {
  title: string;
  composer: string;
  era: Era;
  form: string;
  henle: Piece["henle"];
}

const NORMALIZE_SCHEMA = {
  type: "object",
  properties: {
    pieces: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          composer: { type: "string" },
          era: { type: "string", enum: ERA_ENUM },
          form: { type: "string" },
          henle: henleSchema,
        },
        required: ["title", "composer", "era", "form", "henle"],
        additionalProperties: false,
      },
    },
  },
  required: ["pieces"],
  additionalProperties: false,
};

export async function normalizePieces(
  rawInput: string,
): Promise<NormalizedPiece[]> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system:
      "You are a classical-piano librarian. The user describes one OR MORE piano " +
      "pieces in a single line; split it into individual pieces and return clean " +
      "structured fields for each.\n" +
      "Splitting examples:\n" +
      "- \"Chopin nocturnes in D-flat and E major\" → two pieces (Op. 27 No. 2; Op. 62 No. 2).\n" +
      "- \"Chopin Ballade no 1,2,3,4\" → four pieces (Ballades 1–4).\n" +
      "- \"sonata movements 1/3\" (with composer/work in context) → two pieces, one per movement.\n" +
      "If the input is clearly a single piece, return an array of one.\n" +
      "For each piece: `title` is the proper catalogued title (e.g. \"Nocturne in " +
      "E-flat major, Op. 9 No. 2\"; include the movement when the user names one). " +
      "`form` is the genre/structure in one or two words (Nocturne, Ballade, Sonata, " +
      "Étude, Prelude...). `henle` is the Henle difficulty 1–9 — your best honest " +
      "estimate, or null only if too ambiguous to place.",
    messages: [{ role: "user", content: rawInput }],
    output_config: {
      format: { type: "json_schema", schema: NORMALIZE_SCHEMA },
    },
  });
  return parseJson<{ pieces: NormalizedPiece[] }>(message).pieces;
}

// --- 2. Deep dive: learning content for a piece -------------------------

const DEEP_DIVE_SCHEMA = {
  type: "object",
  properties: {
    composer: { type: "string" },
    pieceStory: { type: "string" },
    formExplainer: { type: "string" },
    theoryTidbits: { type: "array", items: { type: "string" } },
    listenFor: { type: "string" },
  },
  required: [
    "composer",
    "pieceStory",
    "formExplainer",
    "theoryTidbits",
    "listenFor",
  ],
  additionalProperties: false,
};

export async function generateDeepDive(
  piece: Piece,
): Promise<Omit<DeepDive, "generatedAt">> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system:
      "You help a pianist understand a piece they're playing. Be specific and " +
      "substantive, never padded or fawning. Write for a curious adult amateur.\n" +
      "- composer: a tight snapshot (3–4 sentences) of who they were and what " +
      "matters about their music. Not a full bio.\n" +
      "- pieceStory: when/why this piece was written and what's notable about it.\n" +
      "- formExplainer: teach the genre itself (e.g. what a nocturne IS, where it " +
      "came from) so they learn the form, not just this one piece.\n" +
      "- theoryTidbits: 2–4 concrete things to notice while playing (a harmonic " +
      "turn, a structural moment, a voicing) — specific to THIS piece.\n" +
      "- listenFor: one thing to listen for in a great recording.",
    messages: [
      {
        role: "user",
        content: `Piece: ${piece.title}\nComposer: ${piece.composer}\nForm: ${piece.form}\nEra: ${piece.era}`,
      },
    ],
    output_config: {
      format: { type: "json_schema", schema: DEEP_DIVE_SCHEMA },
    },
  });
  return parseJson(message);
}

// --- 3. Recommendations -------------------------------------------------

const RECOMMEND_SCHEMA = {
  type: "object",
  properties: {
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          composer: { type: "string" },
          era: { type: "string", enum: ERA_ENUM },
          form: { type: "string" },
          henle: henleSchema,
          why: { type: "string" },
          newChallenge: { type: "string" },
        },
        required: [
          "title",
          "composer",
          "era",
          "form",
          "henle",
          "why",
          "newChallenge",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["recommendations"],
  additionalProperties: false,
};

const STRETCH_GUIDANCE: Record<Stretch, string> = {
  same: "Keep recommendations at roughly the same Henle level as their current repertoire.",
  "step-up":
    "Recommend pieces about one Henle grade harder than their current level — a real but achievable stretch.",
  reach:
    "Recommend ambitious pieces two-plus Henle grades harder — aspirational reaches worth working toward.",
};

export async function recommend(
  pieces: Piece[],
  mode: RecommendMode,
  stretch: Stretch,
): Promise<Recommendation[]> {
  const repertoire = pieces.length
    ? pieces
        .map(
          (p) =>
            `- ${p.title} — ${p.composer} (${p.era}, ${p.form}, Henle ${p.henle ?? "?"}, status: ${p.status})`,
        )
        .join("\n")
    : "(no pieces yet)";

  const modeGuidance =
    mode === "lucky"
      ? "FEELING LUCKY MODE: deliberately recommend pieces OUTSIDE their comfort zone — " +
        "different composers, eras, or textures than what they usually play. Still tasteful " +
        "and playable, but the point is pleasant surprise and broadening horizons."
      : "Recommend pieces in the spirit of what they already play and love — similar " +
        "composers, eras, and textures — so each pick feels like a natural next step.";

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system:
      "You are a thoughtful piano teacher recommending new repertoire. Recommend exactly 3 pieces. " +
      "Anchor difficulty to the Henle 1–9 scale. `form` is the genre in one or two words " +
      "(Nocturne, Ballade, Sonata, Étude...). For each: `why` ties it specifically to " +
      "their existing repertoire (name a piece or pattern you're drawing on); `newChallenge` " +
      "names the concrete new skill or idea it introduces. Keep BOTH `why` and `newChallenge` " +
      "to ONE short line each — max ~15 words, no full paragraphs. Specific and honest, no " +
      "generic praise, no padding. Don't recommend pieces already in their repertoire.\n\n" +
      modeGuidance +
      "\n" +
      STRETCH_GUIDANCE[stretch],
    messages: [
      {
        role: "user",
        content: `My current repertoire:\n${repertoire}\n\nRecommend what to learn next.`,
      },
    ],
    output_config: {
      format: { type: "json_schema", schema: RECOMMEND_SCHEMA },
    },
  });
  return parseJson<{ recommendations: Recommendation[] }>(message).recommendations;
}

// --- 4. On-demand detail for a single recommendation --------------------

const DETAIL_SCHEMA = {
  type: "object",
  properties: {
    fit: { type: "string" },
    challenge: { type: "string" },
    approach: { type: "string" },
  },
  required: ["fit", "challenge", "approach"],
  additionalProperties: false,
};

export async function recommendationDetail(
  rec: Recommendation,
  pieces: Piece[],
): Promise<RecommendationDetail> {
  const repertoire = pieces.length
    ? pieces.map((p) => `- ${p.title} — ${p.composer} (Henle ${p.henle ?? "?"})`).join("\n")
    : "(no pieces yet)";

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system:
      "You are a thoughtful piano teacher. The pianist wants a fuller explanation of one " +
      "recommended piece. Give 2–3 substantive sentences for each field, specific and honest:\n" +
      "- fit: why it suits THEM, referencing their actual repertoire.\n" +
      "- challenge: the concrete musical/technical growth it offers.\n" +
      "- approach: practical advice on how to start learning it.",
    messages: [
      {
        role: "user",
        content: `Their repertoire:\n${repertoire}\n\nThe recommended piece: ${rec.title} — ${rec.composer} (Henle ${rec.henle ?? "?"}).\nTell me more.`,
      },
    ],
    output_config: {
      format: { type: "json_schema", schema: DETAIL_SCHEMA },
    },
  });
  return parseJson<RecommendationDetail>(message);
}
