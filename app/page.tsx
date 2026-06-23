"use client";

import { useEffect, useRef, useState } from "react";
import { ERAS } from "@/lib/types";
import type {
  DeepDive,
  Piece,
  PieceStatus,
  Recommendation,
  RecommendationDetail,
  RecommendMode,
  Stretch,
} from "@/lib/types";

const STATUS_LABELS: Record<PieceStatus, string> = {
  playing: "Playing",
  learning: "Learning",
  want: "Want to learn",
};

const STRETCH_LABELS: Record<Stretch, string> = {
  same: "Same level",
  "step-up": "One step up",
  reach: "Reach",
};

// Shared field styling (defined in globals.css), so every input/select matches.
const FIELD = "field px-3 py-2";

function henleLabel(henle: number | null): string {
  return henle ? `Henle ${henle}` : "Henle —";
}

function surname(composer: string): string {
  const parts = composer.trim().split(/\s+/);
  return parts[parts.length - 1] || composer;
}

// A thin dot separator for meta rows.
function Dot() {
  return <span className="px-1.5 text-henle/40">·</span>;
}

// A YouTube search for the piece — reliable (top hits are real recordings) and
// needs no API key, unlike asking the model for a specific (hallucinated) video.
function youtubeUrl(title: string, composer: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `${composer} ${title}`,
  )}`;
}

function ListenLink({
  title,
  composer,
  className = "",
}: {
  title: string;
  composer: string;
  className?: string;
}) {
  return (
    <a
      href={youtubeUrl(title, composer)}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-sm font-medium text-henle transition-colors hover:text-henle-dark ${className}`}
    >
      <span aria-hidden>▶</span> Listen
    </a>
  );
}

export default function Home() {
  const [tab, setTab] = useState<"repertoire" | "recommend">("repertoire");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
      <header className="mb-9">
        {/* Header styled like a Henle Urtext edition cover. */}
        <div className="relative mx-auto max-w-sm bg-henle-light px-6 py-6 text-center shadow-sm ring-1 ring-henle/15">
          {/* Double-rule frame, like the printed cover border. */}
          <span className="pointer-events-none absolute inset-1.5 border border-henle/50" />
          <span className="pointer-events-none absolute inset-[7px] border border-henle/20" />
          <p className="relative text-[10px] font-medium uppercase tracking-[0.4em] text-henle/70">
            Piano
          </p>
          <h1 className="relative font-serif text-5xl leading-none tracking-tight text-henle">
            Urtext
          </h1>
          <div className="relative mx-auto mt-2 h-px w-16 bg-henle/40" />
          <p className="relative mt-2 text-[10px] font-medium uppercase tracking-[0.35em] text-henle/70">
            Repertoire Edition
          </p>
        </div>
        <p className="mx-auto mt-4 max-w-md text-center text-sm text-muted">
          Remember your repertoire, study what you play, and discover what to
          learn next.
        </p>
      </header>

      {/* Segmented control — sits on its own paper strip. */}
      <nav className="mb-8 flex justify-center">
        <div className="inline-flex gap-1 rounded-full border border-line bg-paper p-1 shadow-sm">
          <TabButton active={tab === "repertoire"} onClick={() => setTab("repertoire")}>
            My Repertoire
          </TabButton>
          <TabButton active={tab === "recommend"} onClick={() => setTab("recommend")}>
            What to learn next
          </TabButton>
        </div>
      </nav>

      {tab === "repertoire" ? <Repertoire /> : <Recommend />}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-henle text-white shadow-sm"
          : "text-muted hover:bg-henle-light hover:text-henle"
      }`}
    >
      {children}
    </button>
  );
}

// --- Repertoire surface ---------------------------------------------------

type SortKey = "added" | "status" | "composer" | "difficulty" | "year";

const SORT_LABELS: Record<SortKey, string> = {
  added: "Recently added",
  status: "Status",
  composer: "Composer",
  difficulty: "Difficulty",
  year: "Year learned",
};

function Repertoire() {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<PieceStatus>("playing");
  const [year, setYear] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("added");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pieces")
      .then((r) => r.json())
      .then((d) => setPieces(d.pieces ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function addPiece(e: React.FormEvent) {
    e.preventDefault();
    const rawInput = input.trim();
    if (!rawInput || adding) return;
    setAdding(true);
    setError(null);
    try {
      const yearLearned = year.trim() ? Number(year.trim()) : null;
      const res = await fetch("/api/pieces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput, status, yearLearned }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add");
      // Server returns one or more pieces in input order; show newest first.
      const added: Piece[] = data.pieces ?? (data.piece ? [data.piece] : []);
      setPieces((prev) => [...[...added].reverse(), ...prev]);
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  }

  async function changeStatus(id: string, next: PieceStatus) {
    setPieces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: next } : p)),
    );
    await fetch(`/api/pieces/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
  }

  async function changeYear(id: string, yearLearned: number | null) {
    setPieces((prev) =>
      prev.map((p) => (p.id === id ? { ...p, yearLearned } : p)),
    );
    await fetch(`/api/pieces/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yearLearned }),
    });
  }

  async function remove(id: string) {
    setPieces((prev) => prev.filter((p) => p.id !== id));
    await fetch(`/api/pieces/${id}`, { method: "DELETE" });
  }

  const groups = groupAndSort(pieces, sortBy);

  return (
    <div>
      <form onSubmit={addPiece} className="mb-6">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. Chopin Ballades 1–4, or Nocturne Op. 9 No. 2"
            className={`${FIELD} flex-1`}
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as PieceStatus)}
            className={`${FIELD} text-muted`}
          >
            {(Object.keys(STATUS_LABELS) as PieceStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            inputMode="numeric"
            placeholder="Year"
            aria-label="Year learned (optional)"
            className={`${FIELD} w-20 text-muted`}
          />
          <button
            type="submit"
            disabled={adding || !input.trim()}
            className="rounded-lg bg-henle px-4 py-2 font-medium text-white shadow-sm transition-colors hover:bg-henle-dark disabled:opacity-50"
          >
            {adding ? "Identifying…" : "Add"}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          Add several at once — &ldquo;Chopin nocturnes in D-flat and E
          major,&rdquo; &ldquo;Ballades 1–4,&rdquo; &ldquo;sonata movements
          1/3.&rdquo; Composer, era, form, and difficulty get filled in for you.
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </form>

      {!loading && pieces.length > 0 && <RepertoireStats pieces={pieces} />}

      {loading ? (
        <p className="text-muted">Loading your repertoire…</p>
      ) : pieces.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong bg-paper p-6 text-center text-muted">
          No pieces yet. Add the first thing you&apos;re playing above.
        </p>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-end gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">
              Sort
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="field px-2 py-1 text-sm text-muted"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-6">
            {groups.map((g) => (
              <div key={g.label ?? "all"}>
                {g.label && (
                  <h3 className="mb-2 flex items-center gap-3 font-serif text-sm uppercase tracking-[0.15em] text-henle">
                    {g.label}
                    <span className="h-px flex-1 bg-line-strong" />
                  </h3>
                )}
                <ul className="space-y-3">
                  {g.items.map((p) => (
                    <PieceCard
                      key={p.id}
                      piece={p}
                      onStatus={changeStatus}
                      onYear={changeYear}
                      onRemove={remove}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type PieceGroup = { label: string | null; items: Piece[] };

// Order/group the repertoire for display. "added" keeps the newest-first order
// the API already returns; the others group under headers.
function groupAndSort(pieces: Piece[], sortBy: SortKey): PieceGroup[] {
  if (sortBy === "added") {
    return [{ label: null, items: pieces }];
  }
  if (sortBy === "difficulty") {
    const items = [...pieces].sort((a, b) => (b.henle ?? -1) - (a.henle ?? -1));
    return [{ label: null, items }];
  }
  if (sortBy === "status") {
    const order: PieceStatus[] = ["playing", "want", "learning"];
    return order
      .map((s) => ({
        label: STATUS_LABELS[s],
        items: pieces
          .filter((p) => p.status === s)
          .sort((a, b) => a.composer.localeCompare(b.composer)),
      }))
      .filter((g) => g.items.length > 0);
  }
  if (sortBy === "composer") {
    const map = new Map<string, Piece[]>();
    for (const p of pieces) {
      const arr = map.get(p.composer) ?? [];
      arr.push(p);
      map.set(p.composer, arr);
    }
    return [...map.entries()]
      .sort((a, b) => surname(a[0]).localeCompare(surname(b[0])))
      .map(([composer, items]) => ({
        label: composer,
        items: items.sort((a, b) => a.title.localeCompare(b.title)),
      }));
  }
  // year learned — newest year first, unknowns last
  const map = new Map<string, Piece[]>();
  for (const p of pieces) {
    const key = p.yearLearned ? String(p.yearLearned) : "Year unknown";
    const arr = map.get(key) ?? [];
    arr.push(p);
    map.set(key, arr);
  }
  return [...map.entries()]
    .sort((a, b) => {
      const ay = a[0] === "Year unknown" ? -Infinity : Number(a[0]);
      const by = b[0] === "Year unknown" ? -Infinity : Number(b[0]);
      return by - ay;
    })
    .map(([label, items]) => ({ label, items }));
}

function RepertoireStats({ pieces }: { pieces: Piece[] }) {
  const total = pieces.length;

  const statusCounts: Record<PieceStatus, number> = {
    playing: 0,
    learning: 0,
    want: 0,
  };
  pieces.forEach((p) => (statusCounts[p.status] += 1));

  const henles = pieces
    .map((p) => p.henle)
    .filter((n): n is NonNullable<typeof n> => n !== null);
  const avgHenle = henles.length
    ? Math.round((henles.reduce((a, b) => a + b, 0) / henles.length) * 10) / 10
    : null;
  const minH = henles.length ? Math.min(...henles) : null;
  const maxH = henles.length ? Math.max(...henles) : null;

  const eraCounts = ERAS.map((era) => ({
    era,
    n: pieces.filter((p) => p.era === era).length,
  })).filter((e) => e.n > 0);
  const maxEra = Math.max(...eraCounts.map((e) => e.n), 1);

  const composerCounts = Object.entries(
    pieces.reduce<Record<string, number>>((m, p) => {
      m[p.composer] = (m[p.composer] ?? 0) + 1;
      return m;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <section className="mb-6 rounded-xl border border-henle/20 bg-henle-light/60 p-5">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-henle">
        Repertoire at a glance
      </h2>

      <div className="mb-5 grid grid-cols-4 gap-2 text-center">
        <Stat n={total} label="Pieces" big />
        <Stat n={statusCounts.playing} label="Playing" />
        <Stat n={statusCounts.learning} label="Learning" />
        <Stat n={statusCounts.want} label="Want" />
      </div>

      <div className="grid gap-5 border-t border-henle/15 pt-4 sm:grid-cols-3">
        {/* Difficulty */}
        <div>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Difficulty (Henle)
          </h3>
          {avgHenle !== null ? (
            <p className="text-sm text-ink">
              <span className="font-serif text-2xl text-henle">{avgHenle}</span>{" "}
              avg
              <span className="ml-2 text-xs text-muted">
                range {minH}–{maxH}
              </span>
            </p>
          ) : (
            <p className="text-sm text-muted">—</p>
          )}
        </div>

        {/* Eras */}
        <div>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            By era
          </h3>
          <ul className="space-y-1">
            {eraCounts.map(({ era, n }) => (
              <li key={era} className="flex items-center gap-2 text-xs">
                <span className="w-20 shrink-0 truncate text-ink/80">
                  {era}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-henle/10">
                  <span
                    className="block h-full rounded-full bg-henle"
                    style={{ width: `${(n / maxEra) * 100}%` }}
                  />
                </span>
                <span className="w-4 text-right text-muted">{n}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Top composers */}
        <div>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Top composers
          </h3>
          {composerCounts.length ? (
            <ul className="space-y-0.5 text-sm text-ink">
              {composerCounts.map(([name, n]) => (
                <li key={name} className="flex justify-between gap-2">
                  <span className="truncate">{name}</span>
                  <span className="shrink-0 text-muted">{n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">—</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Stat({
  n,
  label,
  big,
}: {
  n: number;
  label: string;
  big?: boolean;
}) {
  return (
    <div>
      <div
        className={`font-serif text-henle ${big ? "text-3xl" : "text-2xl"}`}
      >
        {n}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-muted">
        {label}
      </div>
    </div>
  );
}

// A small henle badge used for status / difficulty chips.
function Chip({
  children,
  tone = "soft",
}: {
  children: React.ReactNode;
  tone?: "soft" | "solid";
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
        tone === "solid"
          ? "bg-henle text-white"
          : "bg-henle-light text-henle ring-1 ring-henle/15"
      }`}
    >
      {children}
    </span>
  );
}

function PieceCard({
  piece,
  onStatus,
  onYear,
  onRemove,
}: {
  piece: Piece;
  onStatus: (id: string, s: PieceStatus) => void;
  onYear: (id: string, y: number | null) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <li className="paper-card spine p-4 pl-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <Chip>{STATUS_LABELS[piece.status]}</Chip>
            <Chip>{henleLabel(piece.henle)}</Chip>
          </div>
          <h3 className="font-serif text-lg leading-snug text-ink">
            {piece.title}
          </h3>
          <p className="text-sm font-medium text-henle/80">{piece.composer}</p>
          <p className="mt-1 flex flex-wrap items-center text-xs text-muted">
            {piece.era}
            <Dot />
            {piece.form}
            {piece.yearLearned ? (
              <>
                <Dot />
                Learned {piece.yearLearned}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <select
            value={piece.status}
            onChange={(e) => onStatus(piece.id, e.target.value as PieceStatus)}
            className="field px-2 py-1 text-xs text-muted"
          >
            {(Object.keys(STATUS_LABELS) as PieceStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <YearField
            value={piece.yearLearned}
            onCommit={(y) => onYear(piece.id, y)}
          />
          <button
            onClick={() => onRemove(piece.id)}
            aria-label="Remove piece"
            className="rounded px-2 py-1 text-xs text-muted transition-colors hover:text-red-600"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 border-t border-line pt-3">
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-sm font-medium text-henle transition-colors hover:text-henle-dark"
        >
          {open ? "Hide" : "Learn about this piece"}
        </button>
        <ListenLink title={piece.title} composer={piece.composer} />
      </div>

      {open && <DeepDivePanel pieceId={piece.id} />}
    </li>
  );
}

function YearField({
  value,
  onCommit,
}: {
  value: number | null;
  onCommit: (y: number | null) => void;
}) {
  const [v, setV] = useState(value ? String(value) : "");

  useEffect(() => {
    setV(value ? String(value) : "");
  }, [value]);

  function commit() {
    const t = v.trim();
    if (!t) {
      if (value !== null) onCommit(null);
      return;
    }
    const n = Number(t);
    if (Number.isInteger(n) && n >= 1000 && n <= 9999) {
      if (n !== value) onCommit(n);
    } else {
      setV(value ? String(value) : ""); // revert invalid input
    }
  }

  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      inputMode="numeric"
      placeholder="Year"
      aria-label="Year learned"
      className="field w-16 px-2 py-1 text-xs text-muted"
    />
  );
}

function DeepDivePanel({ pieceId }: { pieceId: string }) {
  const [dive, setDive] = useState<DeepDive | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(refresh = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/deep-dive/${pieceId}${refresh ? "?refresh=1" : ""}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setDive(data.deepDive);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceId]);

  if (loading) {
    return <p className="mt-3 text-sm text-muted">Reading up on it…</p>;
  }
  if (error) {
    return (
      <div className="mt-3 text-sm">
        <p className="text-red-600">{error}</p>
        <button onClick={() => load()} className="mt-1 text-henle underline">
          Try again
        </button>
      </div>
    );
  }
  if (!dive) return null;

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-line bg-henle-light/40 p-4 text-sm text-ink">
      <Section title="The composer">{dive.composer}</Section>
      <Section title="This piece">{dive.pieceStory}</Section>
      <Section title="The form">{dive.formExplainer}</Section>
      <Section title="What to notice">
        <ul className="list-disc space-y-1 pl-5 marker:text-henle/50">
          {dive.theoryTidbits.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </Section>
      <Section title="Listen for">{dive.listenFor}</Section>
      <button
        onClick={() => load(true)}
        className="text-xs text-muted transition-colors hover:text-henle"
      >
        ↻ Regenerate
      </button>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-henle">
        {title}
      </h4>
      <div className="leading-relaxed text-ink/90">{children}</div>
    </div>
  );
}

// --- Recommend surface: the slot machine ---------------------------------

const REEL_GLYPHS = ["♪", "♩", "♫", "♬", "♭", "♯", "𝄞", "𝄢"];

function Recommend() {
  const [stretch, setStretch] = useState<Stretch>("step-up");
  const [mode, setMode] = useState<RecommendMode>("similar");
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [landed, setLanded] = useState<[boolean, boolean, boolean]>([
    false,
    false,
    false,
  ]);
  const [pulled, setPulled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => timers.current.forEach(clearTimeout);
  }, []);

  async function spin() {
    if (spinning) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setSpinning(true);
    setError(null);
    setRecs([]);
    setLanded([false, false, false]);
    setPulled(true);
    timers.current.push(setTimeout(() => setPulled(false), 550));

    try {
      const fetchP = fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, stretch }),
      }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Failed");
        return (d.recommendations ?? []) as Recommendation[];
      });
      // Let the reels spin for at least a beat even if the API is fast.
      const minSpin = new Promise((res) => setTimeout(res, 900));
      const [data] = await Promise.all([fetchP, minSpin]);

      const three = data.slice(0, 3);
      setRecs(three);
      // Land the reels one at a time, left to right.
      three.forEach((_, i) => {
        timers.current.push(
          setTimeout(
            () =>
              setLanded((l) => {
                const n = [...l] as [boolean, boolean, boolean];
                n[i] = true;
                return n;
              }),
            400 * (i + 1),
          ),
        );
      });
      timers.current.push(
        setTimeout(() => setSpinning(false), 400 * 3 + 300),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setSpinning(false);
    }
  }

  return (
    <div>
      {/* Controls */}
      <div className="mb-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Mode
          </span>
          <div className="flex overflow-hidden rounded-full border border-henle">
            <ModePill active={mode === "similar"} onClick={() => setMode("similar")}>
              Like what I play
            </ModePill>
            <ModePill active={mode === "lucky"} onClick={() => setMode("lucky")}>
              🎲 Surprise me
            </ModePill>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Push
          </span>
          <div className="flex gap-1">
            {(Object.keys(STRETCH_LABELS) as Stretch[]).map((s) => (
              <button
                key={s}
                onClick={() => setStretch(s)}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  stretch === s
                    ? "border-henle bg-henle-light text-henle"
                    : "border-line-strong text-muted hover:border-henle/40 hover:text-henle"
                }`}
              >
                {STRETCH_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* The cabinet */}
      <div className="rounded-2xl border-4 border-henle bg-gradient-to-b from-henle-mid to-henle p-4 shadow-lg ring-1 ring-henle-dark/30">
        <div className="mb-3 text-center">
          <span className="font-serif text-sm uppercase tracking-[0.3em] text-white/80">
            Repertoire Machine
          </span>
        </div>

        <div className="flex items-stretch gap-3">
          {/* Reels */}
          <div className="grid flex-1 grid-cols-3 gap-2 rounded-lg bg-henle-dark/40 p-2">
            {[0, 1, 2].map((i) => (
              <Reel
                key={i}
                spinning={spinning && !landed[i]}
                rec={landed[i] ? recs[i] : undefined}
              />
            ))}
          </div>

          {/* Lever */}
          <button
            onClick={spin}
            disabled={spinning}
            aria-label="Spin"
            className="flex w-10 flex-col items-center justify-end disabled:cursor-not-allowed"
          >
            <span
              className={`flex flex-col items-center ${pulled ? "lever-pull" : ""}`}
              style={{ transformOrigin: "bottom center" }}
            >
              <span className="h-7 w-7 rounded-full bg-red-500 shadow-md ring-2 ring-red-300" />
              <span className="h-16 w-2 rounded-full bg-stone-300" />
            </span>
            <span className="mt-1 h-3 w-6 rounded-sm bg-stone-700" />
          </button>
        </div>

        <button
          onClick={spin}
          disabled={spinning}
          className="mt-4 w-full rounded-lg bg-white py-2.5 font-serif text-lg font-bold uppercase tracking-widest text-henle shadow transition-transform hover:scale-[1.01] disabled:opacity-60"
        >
          {spinning ? "Spinning…" : "Spin"}
        </button>
      </div>

      {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}

      {/* The detailed payouts */}
      {recs.length > 0 && landed[recs.length - 1] && (
        <div className="mt-5 space-y-3">
          {mode === "lucky" && (
            <p className="text-center text-sm italic text-muted">
              Outside your usual comfort zone — on purpose.
            </p>
          )}
          {recs.map((r, i) => (
            <RecCard key={i} rec={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function RecCard({ rec }: { rec: Recommendation }) {
  const [state, setState] = useState<"idle" | "adding" | "added">("idle");
  const [detail, setDetail] = useState<RecommendationDetail | null>(null);
  const [detailState, setDetailState] = useState<"idle" | "loading" | "error">(
    "idle",
  );

  async function getMoreInfo() {
    if (detail) {
      setDetail(null); // toggle closed
      return;
    }
    setDetailState("loading");
    try {
      const res = await fetch("/api/recommend/detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rec }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setDetail(data.detail);
      setDetailState("idle");
    } catch {
      setDetailState("error");
    }
  }

  async function addToWant() {
    if (state !== "idle") return;
    setState("adding");
    try {
      const res = await fetch("/api/pieces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "want",
          piece: {
            title: rec.title,
            composer: rec.composer,
            era: rec.era,
            form: rec.form,
            henle: rec.henle,
          },
        }),
      });
      if (!res.ok) throw new Error();
      setState("added");
    } catch {
      setState("idle");
    }
  }

  return (
    <div className="paper-card spine p-4 pl-5">
      <div className="mb-1 flex items-center gap-2">
        <Chip>{rec.era}</Chip>
        <Chip>{henleLabel(rec.henle)}</Chip>
      </div>
      <h3 className="font-serif text-lg text-ink">{rec.title}</h3>
      <p className="text-sm font-medium text-henle/80">{rec.composer}</p>
      <p className="mt-3 text-sm text-ink">
        <span className="font-semibold text-henle">Why this: </span>
        {rec.why}
      </p>
      <p className="mt-2 text-sm text-ink">
        <span className="font-semibold text-henle">New challenge: </span>
        {rec.newChallenge}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-line pt-3">
        <ListenLink title={rec.title} composer={rec.composer} />
        <button
          onClick={getMoreInfo}
          disabled={detailState === "loading"}
          className="text-sm font-medium text-henle transition-colors hover:text-henle-dark"
        >
          {detailState === "loading"
            ? "Loading…"
            : detail
              ? "Hide info"
              : "Get more info"}
        </button>
        <button
          onClick={addToWant}
          disabled={state !== "idle"}
          className={`text-sm font-medium transition-colors ${
            state === "added"
              ? "text-muted"
              : "text-henle hover:text-henle-dark"
          }`}
        >
          {state === "added"
            ? "✓ In want-to-learn"
            : state === "adding"
              ? "Adding…"
              : "+ Add to want-to-learn"}
        </button>
      </div>

      {detailState === "error" && (
        <p className="mt-2 text-sm text-red-600">Couldn&apos;t load more info.</p>
      )}
      {detail && (
        <div className="mt-3 space-y-3 rounded-lg border border-line bg-henle-light/40 p-4 text-sm text-ink">
          <Section title="Why it fits you">{detail.fit}</Section>
          <Section title="The challenge">{detail.challenge}</Section>
          <Section title="How to approach it">{detail.approach}</Section>
        </div>
      )}
    </div>
  );
}

function ModePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs font-medium transition-colors ${
        active ? "bg-henle text-white" : "bg-paper text-henle hover:bg-henle-light"
      }`}
    >
      {children}
    </button>
  );
}

function Reel({
  spinning,
  rec,
}: {
  spinning: boolean;
  rec?: Recommendation;
}) {
  return (
    <div className="relative h-28 overflow-hidden rounded-md border-2 border-henle bg-paper">
      {spinning ? (
        <div className="reel-strip flex flex-col">
          {[...REEL_GLYPHS, ...REEL_GLYPHS].map((g, i) => (
            <span
              key={i}
              className="flex h-28 shrink-0 items-center justify-center text-4xl text-henle/70"
            >
              {g}
            </span>
          ))}
        </div>
      ) : rec ? (
        <div className="flex h-full flex-col items-center justify-center px-2 text-center">
          <span className="font-serif text-lg leading-tight text-henle">
            {surname(rec.composer)}
          </span>
          <span className="mt-1 rounded-full bg-henle-light px-2 py-0.5 text-[10px] font-medium text-henle ring-1 ring-henle/15">
            {henleLabel(rec.henle)}
          </span>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-4xl text-henle/15">
          ♪
        </div>
      )}
      {/* center payline */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-henle/10" />
    </div>
  );
}
