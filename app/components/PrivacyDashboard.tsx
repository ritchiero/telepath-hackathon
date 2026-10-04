"use client";

/*
 * Telepath · /privacy — "Your mind, your rules."
 * Drafta light skin: airy surfaces, soft cards, big friendly type.
 * Self-contained: React + fetch() only. Talks to /api/beliefs.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Belief {
  id: string;
  content: string;
  confidence: number;
  source_agent: string | null;
  corroborated_by: string[] | null;
  created_at: string;
}

type AgentId = "muse" | "grok" | "dot" | "fo";

const AGENTS: { id: AgentId; name: string; color: string; tagline: string }[] = [
  { id: "muse", name: "Muse", color: "#fbbf24", tagline: "Careful and structured" },
  { id: "grok", name: "Grok", color: "#4d8dff", tagline: "Direct and irreverent" },
  { id: "dot", name: "Dot", color: "#4ade80", tagline: "Pragmatic and operational" },
  { id: "fo", name: "Fo", color: "#a78bfa", tagline: "Curious and creative" },
];

const agentOf = (id: string | null) => AGENTS.find((a) => a.id === id);
const agentColor = (id: string | null) => agentOf(id)?.color ?? "#a1a1aa";
const agentName = (id: string | null) => agentOf(id)?.name ?? id ?? "Unknown";
const pct = (n: number) => Math.round(Math.max(0, Math.min(1, Number(n) || 0)) * 100);
const fmtDate = (ts: string) =>
  new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/* jev acts without asking above this confidence (see PredictResult.act). */
const ACT_THRESHOLD = 0.8;

export default function PrivacyDashboard() {
  const [beliefs, setBeliefs] = useState<Belief[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | AgentId>("all");

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  const [wipeStep, setWipeStep] = useState<0 | 1 | 2>(0);
  const [wipe, setWipe] = useState<{ done: number; total: number } | null>(null);

  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/beliefs", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      setBeliefs(Array.isArray(data) ? data : []);
      setError(null);
    } catch {
      setError("The mind is not responding right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const notify = (msg: string) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(msg);
    flashTimer.current = setTimeout(() => setFlash(null), 2800);
  };

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const startEdit = (b: Belief) => {
    setConfirmDelete(null);
    setEditing(b.id);
    setDraft(b.content);
  };

  const saveCorrection = async (id: string) => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/beliefs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correction: draft.trim(), by: "owner" }),
      });
      setEditing(null);
      notify("Belief corrected — confidence reset to 95%");
      setHighlight(id);
      setTimeout(() => setHighlight((h) => (h === id ? null : h)), 1800);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setDeleting(id);
    try {
      await fetch(`/api/beliefs/${id}`, { method: "DELETE" });
      notify("Belief deleted — the agents forgot it");
      await load();
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  const emptyMind = async () => {
    const all = [...beliefs];
    setBusy(true);
    setWipe({ done: 0, total: all.length });
    try {
      for (let i = 0; i < all.length; i++) {
        await fetch(`/api/beliefs/${all[i].id}`, { method: "DELETE" });
        setWipe({ done: i + 1, total: all.length });
      }
      notify("Mind wiped clean");
      await load();
    } finally {
      setBusy(false);
      setWipe(null);
      setWipeStep(0);
    }
  };

  const stats = useMemo(() => {
    const n = beliefs.length;
    const avg = n === 0 ? 0 : Math.round((beliefs.reduce((s, b) => s + (Number(b.confidence) || 0), 0) / n) * 100);
    const perAgent: Record<string, number> = {};
    for (const b of beliefs) if (b.source_agent) perAgent[b.source_agent] = (perAgent[b.source_agent] || 0) + 1;
    const contributors = Object.keys(perAgent).length;
    const corroborated = beliefs.filter((b) => (b.corroborated_by ?? []).length > 0).length;
    return { n, avg, perAgent, contributors, corroborated };
  }, [beliefs]);

  const visible = filter === "all" ? beliefs : beliefs.filter((b) => b.source_agent === filter);

  return (
    <div className="tp-light relative min-h-screen">
      <style>{CSS}</style>
      <Backdrop />
      <TopNav active="privacy" />

      <main className="mx-auto max-w-[1200px] px-5 pb-28 md:px-10">
        {/* hero */}
        <section className="grid items-center gap-12 pt-14 md:pt-20 lg:grid-cols-[1.15fr_1fr]">
          <div className="tp-rise">
            <span className="tp-kicker">
              <LockIcon size={16} />
              Privacy center
            </span>
            <h1 className="tp-display mt-7">
              Your mind,
              <br />
              <span style={{ color: "var(--tp-faint)" }}>your rules.</span>
            </h1>
            <p className="mt-6 max-w-[520px] text-[19px] leading-[1.6]" style={{ color: "var(--tp-muted)" }}>
              See everything your agents know about you. Fix what changed. Delete what you decide.
            </p>
            <div className="mt-8 flex items-center gap-4">
              <AgentStack />
              <p className="text-[16px]" style={{ color: "var(--tp-muted)" }}>
                One mind, shared by <strong style={{ color: "var(--tp-ink)" }}>Muse, Grok, Dot and Fo</strong>
              </p>
            </div>
          </div>
          <MindOrbit perAgent={stats.perAgent} />
        </section>

        {/* stats header */}
        <section className="mt-16 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
          <StatCard label="Beliefs" value={loading ? "—" : String(stats.n)} delay={0}>
            <span>stored in your mind</span>
          </StatCard>
          <StatCard label="Avg confidence" value={loading ? "—" : `${stats.avg}%`} delay={60}>
            <div className="tp-track mt-1" style={{ height: 8 }}>
              <div
                className="tp-meter"
                style={{
                  width: `${stats.avg}%`,
                  background: "linear-gradient(90deg, #fbbf24, #fb7185 45%, #a78bfa 75%, #4d8dff)",
                }}
              />
            </div>
          </StatCard>
          <StatCard label="Contributors" value={loading ? "—" : `${stats.contributors}`} suffix="/ 4" delay={120}>
            <div className="flex items-center gap-1.5">
              {AGENTS.map((a) => {
                const on = !!stats.perAgent[a.id];
                return (
                  <span
                    key={a.id}
                    title={a.name}
                    className="h-3 w-3 rounded-full transition"
                    style={{
                      background: on ? a.color : "#e4e4e9",
                      boxShadow: on ? `0 0 0 3px ${a.color}26` : "none",
                    }}
                  />
                );
              })}
            </div>
          </StatCard>
          <StatCard label="Corroborated" value={loading ? "—" : String(stats.corroborated)} delay={180}>
            <span>confirmed by another agent</span>
          </StatCard>
        </section>

        {/* toolbar */}
        <section className="mt-16 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h2 className="tp-h2">What your mind remembers</h2>
            <p className="mt-1.5 text-[16px]" style={{ color: "var(--tp-muted)" }}>
              {loading
                ? "Reading the mind…"
                : `${visible.length} ${visible.length === 1 ? "belief" : "beliefs"}${
                    filter === "all" ? "" : ` from ${agentName(filter)}`
                  }`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="tp-segment" role="tablist" aria-label="Filter by agent">
              <button role="tab" aria-selected={filter === "all"} data-on={filter === "all"} onClick={() => setFilter("all")}>
                All
              </button>
              {AGENTS.map((a) => (
                <button
                  key={a.id}
                  role="tab"
                  aria-selected={filter === a.id}
                  data-on={filter === a.id}
                  onClick={() => setFilter(a.id)}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: a.color }} />
                  {a.name}
                </button>
              ))}
            </div>
            <button onClick={refresh} className="tp-btn tp-btn-secondary tp-btn-icon" aria-label="Refresh" title="Refresh">
              <RefreshIcon size={18} spinning={refreshing} />
            </button>
            <button
              onClick={() => setWipeStep(1)}
              disabled={busy || beliefs.length === 0}
              className="tp-btn tp-btn-danger-soft"
            >
              <TrashIcon size={17} />
              Empty mind
            </button>
          </div>
        </section>

        {/* beliefs */}
        <section className="mt-7">
          {loading ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : error && beliefs.length === 0 ? (
            <div className="tp-card flex flex-col items-center px-8 py-16 text-center">
              <IconBubble>
                <AlertIcon size={22} />
              </IconBubble>
              <p className="tp-h3 mt-5">{error}</p>
              <p className="mt-2 text-[16px]" style={{ color: "var(--tp-muted)" }}>
                Check that the app server is running, then try again.
              </p>
              <button onClick={refresh} className="tp-btn tp-btn-primary mt-7">
                Try again
              </button>
            </div>
          ) : visible.length === 0 ? (
            <EmptyState filtered={filter !== "all"} onClear={() => setFilter("all")} />
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {visible.map((b, i) => (
                <BeliefCard
                  key={b.id}
                  b={b}
                  index={i}
                  editing={editing === b.id}
                  draft={draft}
                  setDraft={setDraft}
                  busy={busy}
                  confirming={confirmDelete === b.id}
                  deleting={deleting === b.id}
                  highlighted={highlight === b.id}
                  onEdit={() => startEdit(b)}
                  onCancelEdit={() => setEditing(null)}
                  onSave={() => saveCorrection(b.id)}
                  onAskDelete={() => {
                    setEditing(null);
                    setConfirmDelete(b.id);
                  }}
                  onCancelDelete={() => setConfirmDelete(null)}
                  onDelete={() => remove(b.id)}
                />
              ))}
            </div>
          )}
        </section>

        <footer className="mt-16 flex justify-center">
          <span className="tp-kicker" style={{ fontWeight: 500 }}>
            <ShieldIcon size={16} />
            Row-level security: only you can read your mind. Every correction and deletion is logged as an event.
          </span>
        </footer>
      </main>

      {wipeStep !== 0 && (
        <EmptyMindDialog
          step={wipeStep}
          count={beliefs.length}
          contributors={stats.contributors}
          progress={wipe}
          onCancel={() => !wipe && setWipeStep(0)}
          onNext={() => setWipeStep(2)}
          onConfirm={emptyMind}
        />
      )}

      {flash && (
        <div className="tp-toast" role="status" aria-live="polite">
          <span className="grid h-6 w-6 place-items-center rounded-full" style={{ background: "#22c55e" }}>
            <CheckIcon size={14} />
          </span>
          {flash}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

function BeliefCard(props: {
  b: Belief;
  index: number;
  editing: boolean;
  draft: string;
  setDraft: (s: string) => void;
  busy: boolean;
  confirming: boolean;
  deleting: boolean;
  highlighted: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const { b } = props;
  const c = agentColor(b.source_agent);
  const p = pct(b.confidence);
  const corroborators = b.corroborated_by ?? [];
  const acts = (Number(b.confidence) || 0) > ACT_THRESHOLD;

  return (
    <article
      className={`tp-card tp-card-hover tp-rise flex flex-col p-6 md:p-7 ${props.highlighted ? "tp-flash" : ""}`}
      style={{ animationDelay: `${Math.min(props.index, 8) * 45}ms` }}
    >
      <header className="flex items-center justify-between gap-3">
        <SourceBadge id={b.source_agent} />
        <time className="text-[14px] tabular-nums" style={{ color: "var(--tp-faint)" }} dateTime={b.created_at}>
          {fmtDate(b.created_at)}
        </time>
      </header>

      <p className="mt-5 text-[20px] font-semibold leading-[1.45] tracking-[-0.012em]" style={{ color: "var(--tp-ink)" }}>
        {b.content}
      </p>

      <div className="mt-6">
        <div className="mb-2.5 flex items-baseline justify-between">
          <span className="text-[15px] font-medium" style={{ color: "var(--tp-muted)" }}>
            Confidence
          </span>
          <span className="text-[18px] font-bold tabular-nums" style={{ color: "var(--tp-ink)" }}>
            {p}%
          </span>
        </div>
        <div className="tp-track">
          <div
            className="tp-meter"
            style={{ width: `${p}%`, background: `linear-gradient(90deg, ${c}59, ${c})` }}
          >
            <span className="tp-knob" />
          </div>
        </div>
        <p className="mt-2.5 flex items-center gap-1.5 text-[14px]" style={{ color: "var(--tp-faint)" }}>
          <BoltIcon size={13} />
          {acts ? "jev acts on this without asking" : "jev asks before acting on this"}
        </p>
      </div>

      <div className="mt-5 flex min-h-[34px] flex-wrap items-center gap-2">
        {corroborators.length > 0 ? (
          <>
            <span className="mr-1 text-[14px] font-medium" style={{ color: "var(--tp-muted)" }}>
              Corroborated by
            </span>
            {corroborators.map((x) => (
              <span key={x} className="tp-chip">
                <span className="h-2 w-2 rounded-full" style={{ background: agentColor(x) }} />
                {agentName(x)}
              </span>
            ))}
          </>
        ) : (
          <span className="text-[14px]" style={{ color: "var(--tp-faint)" }}>
            Only {agentName(b.source_agent)} has seen this so far
          </span>
        )}
      </div>

      <div className="mt-auto pt-6">
        <div className="tp-divider mb-5" />
        {props.editing ? (
          <div className="tp-rise space-y-3">
            <label className="block text-[15px] font-semibold" htmlFor={`fix-${b.id}`}>
              What&apos;s true now?
            </label>
            <textarea
              id={`fix-${b.id}`}
              value={props.draft}
              onChange={(e) => props.setDraft(e.target.value)}
              onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) props.onSave();
                if (e.key === "Escape") props.onCancelEdit();
              }}
              rows={3}
              autoFocus
              className="tp-field resize-none"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="hidden text-[14px] sm:block" style={{ color: "var(--tp-faint)" }}>
                ⌘ Enter to save · Esc to cancel
              </span>
              <div className="ml-auto flex gap-2.5">
                <button onClick={props.onCancelEdit} className="tp-btn tp-btn-ghost">
                  Cancel
                </button>
                <button onClick={props.onSave} disabled={props.busy || !props.draft.trim()} className="tp-btn tp-btn-primary">
                  {props.busy ? "Saving…" : "Save correction"}
                </button>
              </div>
            </div>
          </div>
        ) : props.confirming ? (
          <div className="tp-rise flex flex-wrap items-center justify-between gap-3 rounded-[18px] px-4 py-3" style={{ background: "var(--tp-danger-soft)" }}>
            <span className="text-[16px] font-medium" style={{ color: "var(--tp-danger-ink)" }}>
              Delete this belief? The agents will forget it.
            </span>
            <div className="ml-auto flex gap-2">
              <button onClick={props.onCancelDelete} className="tp-btn tp-btn-secondary tp-btn-sm">
                Cancel
              </button>
              <button onClick={props.onDelete} disabled={props.deleting} className="tp-btn tp-btn-danger tp-btn-sm">
                {props.deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <button onClick={props.onEdit} className="tp-btn tp-btn-secondary flex-1">
              <PencilIcon size={16} />
              Correct
            </button>
            <button onClick={props.onAskDelete} className="tp-btn tp-btn-ghost tp-btn-ghost-danger flex-1">
              <TrashIcon size={16} />
              Delete
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function SourceBadge({ id }: { id: string | null }) {
  const c = agentColor(id);
  return (
    <span className="tp-pill" style={{ background: `${c}1c`, border: `1px solid ${c}47`, color: "var(--tp-ink-2)" }}>
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: c, boxShadow: `0 0 0 3px ${c}33` }} />
      {agentName(id)}
    </span>
  );
}

function StatCard(props: { label: string; value: string; suffix?: string; delay: number; children?: React.ReactNode }) {
  return (
    <div className="tp-card tp-rise flex flex-col gap-3 p-5 md:p-6" style={{ animationDelay: `${props.delay}ms` }}>
      <span className="text-[15px] font-medium" style={{ color: "var(--tp-muted)" }}>
        {props.label}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-[40px] font-extrabold leading-none tracking-[-0.035em] tabular-nums md:text-[46px]">
          {props.value}
        </span>
        {props.suffix && (
          <span className="text-[18px] font-semibold" style={{ color: "var(--tp-faint)" }}>
            {props.suffix}
          </span>
        )}
      </span>
      <div className="text-[14px]" style={{ color: "var(--tp-faint)" }}>
        {props.children}
      </div>
    </div>
  );
}

function AgentStack() {
  return (
    <div className="flex -space-x-2.5">
      {AGENTS.map((a) => (
        <span
          key={a.id}
          className="grid h-10 w-10 place-items-center rounded-full text-[15px] font-bold"
          style={{ background: a.color, color: "#111114", boxShadow: "0 0 0 3px #f7f7f9, 0 4px 10px -2px rgba(16,16,24,.15)" }}
          title={a.name}
        >
          {a.name[0]}
        </span>
      ))}
    </div>
  );
}

/* Decorative hero: the four agents orbiting one shared mind. */
function MindOrbit({ perAgent }: { perAgent: Record<string, number> }) {
  const spots = [
    { left: "2%", top: "10%", delay: "0s" },
    { right: "0%", top: "0%", delay: "-1.2s" },
    { left: "6%", bottom: "6%", delay: "-2.4s" },
    { right: "4%", bottom: "14%", delay: "-3.6s" },
  ] as const;
  return (
    <div className="relative mx-auto hidden h-[380px] w-full max-w-[480px] lg:block" aria-hidden>
      <div className="absolute left-1/2 top-1/2 h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full border" style={{ borderColor: "var(--tp-hairline)" }} />
      <div className="absolute left-1/2 top-1/2 h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed" style={{ borderColor: "#e2e2e8" }} />
      <div
        className="absolute left-1/2 top-1/2 h-[180px] w-[180px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(77,141,255,.16), rgba(167,139,250,.08) 45%, transparent 70%)" }}
      />
      <div
        className="absolute left-1/2 top-1/2 grid h-[92px] w-[92px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[28px]"
        style={{
          background: "linear-gradient(180deg, #2a2a31, #0f0f14)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.14), 0 24px 48px -12px rgba(16,16,24,.45), 0 0 0 8px rgba(255,255,255,.7)",
        }}
      >
        <BoltIcon size={40} color="#ffffff" filled />
      </div>
      {AGENTS.map((a, i) => {
        const n = perAgent[a.id] || 0;
        const { delay, ...pos } = spots[i];
        return (
          <div key={a.id} className="tp-float absolute" style={{ ...pos, animationDelay: delay }}>
            <div className="tp-card flex items-center gap-3 py-2.5 pl-2.5 pr-5" style={{ borderRadius: 20, boxShadow: "var(--tp-shadow-md)" }}>
              <span className="grid h-10 w-10 place-items-center rounded-[13px] text-[16px] font-bold" style={{ background: `${a.color}26`, color: "#111114" }}>
                <span className="h-3 w-3 rounded-full" style={{ background: a.color, boxShadow: `0 0 0 4px ${a.color}33` }} />
              </span>
              <span className="leading-tight">
                <span className="block text-[16px] font-bold">{a.name}</span>
                <span className="block text-[14px]" style={{ color: "var(--tp-muted)" }}>
                  {n} {n === 1 ? "belief" : "beliefs"}
                </span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="tp-card tp-rise flex flex-col items-center px-8 py-20 text-center">
      <div className="relative grid h-24 w-24 place-items-center">
        <div className="absolute inset-0 rounded-full border border-dashed" style={{ borderColor: "#d9d9df" }} />
        {AGENTS.map((a, i) => {
          const angle = (i / AGENTS.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <span
              key={a.id}
              className="absolute h-3 w-3 rounded-full"
              style={{ background: a.color, left: `calc(50% + ${Math.cos(angle) * 48}px - 6px)`, top: `calc(50% + ${Math.sin(angle) * 48}px - 6px)` }}
            />
          );
        })}
        <span className="grid h-12 w-12 place-items-center rounded-[16px] bg-white" style={{ boxShadow: "var(--tp-shadow-md)" }}>
          <BoltIcon size={22} />
        </span>
      </div>
      <p className="tp-h2 mt-7">{filtered ? "Nothing from this agent yet." : "A blank mind."}</p>
      <p className="mt-2 max-w-[420px] text-[17px] leading-relaxed" style={{ color: "var(--tp-muted)" }}>
        {filtered
          ? "This agent hasn't contributed anything you can see."
          : "Contribute beliefs from the stage or onboarding and they will appear here."}
      </p>
      <div className="mt-8 flex gap-3">
        {filtered ? (
          <button onClick={onClear} className="tp-btn tp-btn-primary">
            Show all agents
          </button>
        ) : (
          <>
            <a href="/onboarding" className="tp-btn tp-btn-primary">
              Start onboarding
            </a>
            <a href="/" className="tp-btn tp-btn-secondary">
              Go to stage
            </a>
          </>
        )}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="tp-card p-7">
      <div className="flex justify-between">
        <div className="tp-skeleton h-8 w-24 rounded-full" />
        <div className="tp-skeleton h-5 w-20 rounded-full" />
      </div>
      <div className="tp-skeleton mt-6 h-6 w-[90%] rounded-lg" />
      <div className="tp-skeleton mt-3 h-6 w-[60%] rounded-lg" />
      <div className="tp-skeleton mt-8 h-2.5 w-full rounded-full" />
      <div className="mt-8 flex gap-3">
        <div className="tp-skeleton h-11 flex-1 rounded-full" />
        <div className="tp-skeleton h-11 flex-1 rounded-full" />
      </div>
    </div>
  );
}

function EmptyMindDialog(props: {
  step: 1 | 2;
  count: number;
  contributors: number;
  progress: { done: number; total: number } | null;
  onCancel: () => void;
  onNext: () => void;
  onConfirm: () => void;
}) {
  const { step, count, progress } = props;
  const { onCancel } = props;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="tp-backdrop absolute inset-0" onClick={onCancel} />
      <div role="dialog" aria-modal="true" aria-labelledby="tp-wipe-title" className="tp-card tp-modal relative w-full max-w-[540px] overflow-hidden" style={{ boxShadow: "var(--tp-shadow-lg)" }}>
        <div className="flex items-start gap-4 px-7 pb-6 pt-7">
          <IconBubble danger={step === 2}>{step === 1 ? <TrashIcon size={20} /> : <AlertIcon size={20} />}</IconBubble>
          <div className="flex-1">
            <h3 id="tp-wipe-title" className="tp-h3">
              {step === 1 ? "Empty your mind?" : "Last chance — wipe the entire mind?"}
            </h3>
            <p className="mt-1.5 text-[16px] leading-relaxed" style={{ color: "var(--tp-muted)" }}>
              {step === 1
                ? `This deletes all ${count} ${count === 1 ? "belief" : "beliefs"}. Muse, Grok, Dot and Fo will forget everything they learned about you.`
                : "This cannot be undone. Your agents will start from a blank mind."}
            </p>
          </div>
          {!progress && (
            <button onClick={onCancel} className="tp-btn tp-btn-ghost tp-btn-icon -mr-2 -mt-1" aria-label="Close">
              <XIcon size={18} />
            </button>
          )}
        </div>

        {progress && (
          <div className="px-7 pb-6">
            <div className="mb-2 flex justify-between text-[15px]" style={{ color: "var(--tp-muted)" }}>
              <span>Forgetting…</span>
              <span className="tabular-nums">
                {progress.done} of {progress.total}
              </span>
            </div>
            <div className="tp-track">
              <div
                className="tp-meter"
                style={{
                  width: `${progress.total ? (progress.done / progress.total) * 100 : 100}%`,
                  background: "linear-gradient(90deg, #fca5a5, #e5484d)",
                }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t px-7 py-5" style={{ borderColor: "var(--tp-hairline)", background: "#fbfbfc" }}>
          <span className="text-[15px]" style={{ color: "var(--tp-muted)" }}>
            Step <strong style={{ color: "var(--tp-ink)" }}>{step}</strong> of 2 · {props.contributors} {props.contributors === 1 ? "contributor" : "contributors"}
          </span>
          <div className="flex gap-2.5">
            <button onClick={onCancel} disabled={!!progress} className="tp-btn tp-btn-secondary">
              Cancel
            </button>
            {step === 1 ? (
              <button onClick={props.onNext} className="tp-btn tp-btn-primary">
                Continue
              </button>
            ) : (
              <button onClick={props.onConfirm} disabled={!!progress} className="tp-btn tp-btn-danger">
                {progress ? "Emptying…" : "Yes, empty mind"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function IconBubble({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <span
      className="grid h-12 w-12 shrink-0 place-items-center rounded-full border bg-white"
      style={{
        borderColor: danger ? "#fbd5d5" : "var(--tp-hairline)",
        color: danger ? "var(--tp-danger-ink)" : "var(--tp-ink-2)",
        boxShadow: "var(--tp-shadow-xs)",
      }}
    >
      {children}
    </span>
  );
}

function TopNav({ active }: { active: "stage" | "onboarding" | "privacy" }) {
  const links = [
    { id: "stage", href: "/", label: "Stage" },
    { id: "onboarding", href: "/onboarding", label: "Onboarding" },
    { id: "privacy", href: "/privacy", label: "Privacy" },
  ] as const;
  return (
    <header className="tp-nav sticky top-0 z-40">
      <div className="mx-auto flex h-[72px] max-w-[1200px] items-center justify-between gap-4 px-5 md:px-10">
        <a href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Telepath">
          <span className="grid h-9 w-9 place-items-center rounded-[11px]" style={{ background: "linear-gradient(180deg,#2a2a31,#0f0f14)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.14), 0 4px 10px -2px rgba(16,16,24,.3)" }}>
            <BoltIcon size={17} color="#fff" filled />
          </span>
          <span className="hidden text-[18px] font-bold tracking-[-0.02em] sm:inline">Telepath</span>
        </a>
        <nav className="tp-segment" aria-label="Primary">
          {links.map((l) => (
            <a key={l.id} href={l.href} data-on={active === l.id} aria-current={active === l.id ? "page" : undefined}>
              {l.label}
            </a>
          ))}
        </nav>
        <span className="tp-pill hidden md:inline-flex" style={{ background: "#fff", border: "1px solid var(--tp-hairline)", color: "var(--tp-ink-2)" }}>
          <span className="h-2 w-2 rounded-full" style={{ background: "#22c55e", boxShadow: "0 0 0 3px rgba(34,197,94,.18)" }} />
          Private by default
        </span>
      </div>
    </header>
  );
}

/* Covers the dark stage background from the root layout. */
function Backdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden style={{ background: "var(--tp-canvas)" }}>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(700px 380px at 8% -4%, rgba(251,191,36,.10), transparent 65%), radial-gradient(760px 420px at 92% 2%, rgba(77,141,255,.10), transparent 65%), radial-gradient(900px 520px at 50% 108%, rgba(167,139,250,.08), transparent 65%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgba(15,15,20,.07) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse at 50% 20%, black 20%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 20%, black 20%, transparent 70%)",
        }}
      />
    </div>
  );
}

/* ───────────────────────── icons ───────────────────────── */

type IconProps = { size?: number; color?: string };
const stroke = (size = 18, color = "currentColor") => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: color,
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

function BoltIcon({ size = 18, color = "currentColor", filled }: IconProps & { filled?: boolean }) {
  return (
    <svg {...stroke(size, color)} fill={filled ? color : "none"} strokeWidth={filled ? 0 : 1.8}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}
function LockIcon(p: IconProps) {
  return (
    <svg {...stroke(p.size, p.color)}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="3" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </svg>
  );
}
function ShieldIcon(p: IconProps) {
  return (
    <svg {...stroke(p.size, p.color)}>
      <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
function PencilIcon(p: IconProps) {
  return (
    <svg {...stroke(p.size, p.color)}>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}
function TrashIcon(p: IconProps) {
  return (
    <svg {...stroke(p.size, p.color)}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}
function RefreshIcon({ size, color, spinning }: IconProps & { spinning?: boolean }) {
  return (
    <svg {...stroke(size, color)} className={spinning ? "tp-spin" : undefined}>
      <path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4" />
    </svg>
  );
}
function CheckIcon(p: IconProps) {
  return (
    <svg {...stroke(p.size, p.color ?? "#fff")} strokeWidth={3}>
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}
function XIcon(p: IconProps) {
  return (
    <svg {...stroke(p.size, p.color)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
function AlertIcon(p: IconProps) {
  return (
    <svg {...stroke(p.size, p.color)}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  );
}

/* ───────────────────────── Drafta tokens ───────────────────────── */

const CSS = `
html:has(.tp-light), body:has(.tp-light) { background: #f7f7f9; color-scheme: light; }
html:has(.tp-light) ::-webkit-scrollbar-thumb { background: #d6d6dc; }

.tp-light {
  --tp-canvas: #f7f7f9;
  --tp-surface: #ffffff;
  --tp-sunken: #f3f3f6;
  --tp-hairline: #ececef;
  --tp-hairline-strong: #e2e2e7;
  --tp-ink: #0f0f14;
  --tp-ink-2: #3f3f46;
  --tp-muted: #6b7280;
  --tp-faint: #a1a1aa;
  --tp-action: #111114;
  --tp-action-hover: #2a2a30;
  --tp-focus: #4d8dff;
  --tp-danger: #e5484d;
  --tp-danger-ink: #c4262c;
  --tp-danger-soft: #fff2f2;
  --tp-r-card: 28px;
  --tp-r-inner: 20px;
  --tp-r-control: 16px;
  --tp-shadow-xs: 0 1px 2px rgba(16,16,24,.05);
  --tp-shadow-sm: 0 1px 2px rgba(16,16,24,.04), 0 4px 12px -4px rgba(16,16,24,.06);
  --tp-shadow-md: 0 1px 2px rgba(16,16,24,.04), 0 14px 34px -14px rgba(16,16,24,.16);
  --tp-shadow-lg: 0 2px 6px rgba(16,16,24,.05), 0 36px 72px -24px rgba(16,16,24,.28);
  --tp-ease: cubic-bezier(.22,1,.36,1);
  color: var(--tp-ink);
  font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.tp-display { font-size: clamp(52px, 7.4vw, 92px); font-weight: 800; line-height: .95; letter-spacing: -0.045em; }
.tp-h2 { font-size: clamp(26px, 3vw, 32px); font-weight: 700; line-height: 1.15; letter-spacing: -0.025em; }
.tp-h3 { font-size: 22px; font-weight: 700; line-height: 1.25; letter-spacing: -0.018em; }

.tp-nav { background: rgba(247,247,249,.72); backdrop-filter: saturate(180%) blur(18px); -webkit-backdrop-filter: saturate(180%) blur(18px); border-bottom: 1px solid rgba(236,236,239,.8); }

.tp-card {
  background: var(--tp-surface);
  border: 1px solid var(--tp-hairline);
  border-radius: var(--tp-r-card);
  box-shadow: var(--tp-shadow-sm);
  transition: transform .35s var(--tp-ease), box-shadow .35s var(--tp-ease), border-color .35s;
}
.tp-card-hover:hover { transform: translateY(-3px); box-shadow: var(--tp-shadow-md); border-color: #e4e4e9; }

.tp-kicker {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 16px 8px 13px; border-radius: 999px;
  background: #fff; border: 1px solid var(--tp-hairline);
  box-shadow: var(--tp-shadow-sm), inset 0 -1px 0 rgba(16,16,24,.03);
  font-size: 15px; font-weight: 600; color: var(--tp-ink-2);
}
.tp-pill { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 14px 0 11px; border-radius: 999px; font-size: 15px; font-weight: 600; white-space: nowrap; }
.tp-chip { display: inline-flex; align-items: center; gap: 7px; height: 30px; padding: 0 12px 0 10px; border-radius: 999px; background: #fff; border: 1px solid var(--tp-hairline-strong); font-size: 14px; font-weight: 600; color: var(--tp-ink-2); box-shadow: var(--tp-shadow-xs); }
.tp-divider { height: 1px; background: var(--tp-hairline); }

.tp-segment { display: inline-flex; align-items: center; gap: 2px; padding: 4px; border-radius: 999px; background: #ededf1; box-shadow: inset 0 1px 2px rgba(16,16,24,.05); }
.tp-segment > * {
  display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px; border-radius: 999px;
  font-size: 15px; font-weight: 600; color: var(--tp-muted); white-space: nowrap;
  transition: background .2s, color .2s, box-shadow .2s;
}
.tp-segment > *:hover { color: var(--tp-ink); }
.tp-segment > [data-on="true"] { background: #fff; color: var(--tp-ink); box-shadow: 0 1px 2px rgba(16,16,24,.08), 0 2px 6px -2px rgba(16,16,24,.08); }
@media (max-width: 640px) {
  .tp-segment { max-width: 100%; overflow-x: auto; scrollbar-width: none; }
  .tp-segment::-webkit-scrollbar { display: none; }
  .tp-segment > * { height: 34px; padding: 0 11px; font-size: 14px; }
}

.tp-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 46px; padding: 0 20px; border-radius: 999px;
  font-size: 16px; font-weight: 600; letter-spacing: -0.005em; white-space: nowrap;
  transition: background .2s, border-color .2s, color .2s, box-shadow .2s, transform .15s;
  cursor: pointer; border: 1px solid transparent;
}
.tp-btn:active:not(:disabled) { transform: scale(.98); }
.tp-btn:focus-visible { outline: none; box-shadow: 0 0 0 4px rgba(77,141,255,.28); }
.tp-btn:disabled { opacity: .45; cursor: not-allowed; }
.tp-btn-sm { height: 38px; padding: 0 15px; font-size: 15px; }
.tp-btn-icon { width: 46px; padding: 0; }
.tp-btn-primary { background: var(--tp-action); color: #fff; box-shadow: 0 1px 2px rgba(16,16,24,.25), inset 0 1px 0 rgba(255,255,255,.14); }
.tp-btn-primary:hover:not(:disabled) { background: var(--tp-action-hover); }
.tp-btn-secondary { background: #fff; color: var(--tp-ink); border-color: var(--tp-hairline-strong); box-shadow: var(--tp-shadow-xs); }
.tp-btn-secondary:hover:not(:disabled) { background: #fafafb; border-color: #d4d4da; }
.tp-btn-ghost { background: transparent; color: var(--tp-ink-2); }
.tp-btn-ghost:hover:not(:disabled) { background: var(--tp-sunken); }
.tp-btn-ghost-danger:hover:not(:disabled) { background: var(--tp-danger-soft); color: var(--tp-danger-ink); }
.tp-btn-danger { background: var(--tp-danger); color: #fff; box-shadow: 0 1px 2px rgba(196,38,44,.3), inset 0 1px 0 rgba(255,255,255,.18); }
.tp-btn-danger:hover:not(:disabled) { background: #d93c41; }
.tp-btn-danger-soft { background: var(--tp-danger-soft); color: var(--tp-danger-ink); border-color: #fbdcdc; }
.tp-btn-danger-soft:hover:not(:disabled) { background: #ffe8e8; }

.tp-field {
  width: 100%; background: var(--tp-sunken); border: 1px solid transparent; border-radius: var(--tp-r-control);
  padding: 14px 16px; font-size: 17px; line-height: 1.5; color: var(--tp-ink); outline: none;
  transition: background .2s, border-color .2s, box-shadow .2s;
}
.tp-field:focus { background: #fff; border-color: var(--tp-focus); box-shadow: 0 0 0 4px rgba(77,141,255,.16); }
.tp-field::placeholder { color: var(--tp-faint); }

.tp-track { position: relative; height: 10px; border-radius: 999px; background: #efeff3; box-shadow: inset 0 1px 2px rgba(16,16,24,.06); }
.tp-meter { position: relative; height: 100%; border-radius: 999px; min-width: 10px; transition: width .9s var(--tp-ease); animation: tp-fill 1s var(--tp-ease) both; }
.tp-knob { position: absolute; right: -2px; top: 50%; width: 16px; height: 16px; transform: translateY(-50%); border-radius: 999px; background: #fff; box-shadow: 0 1px 3px rgba(16,16,24,.25), 0 0 0 1px rgba(16,16,24,.04); }

.tp-skeleton { background: linear-gradient(90deg, #f1f1f4 0%, #f8f8fa 50%, #f1f1f4 100%); background-size: 200% 100%; animation: tp-shimmer 1.4s ease-in-out infinite; }
.tp-backdrop { background: rgba(15,15,20,.28); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); animation: tp-fade .2s ease both; }
.tp-modal { animation: tp-modal .35s var(--tp-ease) both; }
.tp-toast {
  position: fixed; left: 50%; bottom: 32px; z-index: 60; transform: translateX(-50%);
  display: inline-flex; align-items: center; gap: 12px; padding: 12px 22px 12px 12px; border-radius: 999px;
  background: #111114; color: #fff; font-size: 16px; font-weight: 600;
  box-shadow: 0 20px 44px -12px rgba(16,16,24,.45), inset 0 1px 0 rgba(255,255,255,.1);
  animation: tp-toast .45s var(--tp-ease) both;
}
.tp-rise { animation: tp-rise .6s var(--tp-ease) backwards; }
.tp-flash { animation: tp-flash 1.8s var(--tp-ease) both; border-color: #bbf7d0; }
.tp-float { animation: tp-float 6s ease-in-out infinite; }
.tp-spin { animation: tp-spin .8s linear infinite; }

@keyframes tp-fill { from { width: 0; } }
@keyframes tp-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
@keyframes tp-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes tp-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes tp-modal { from { opacity: 0; transform: translateY(16px) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes tp-toast { from { opacity: 0; transform: translate(-50%, 18px) scale(.96); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
@keyframes tp-flash { 0% { box-shadow: 0 0 0 0 rgba(34,197,94,0); } 25% { box-shadow: 0 0 0 6px rgba(34,197,94,.18), var(--tp-shadow-md); } 100% { box-shadow: var(--tp-shadow-sm); } }
@keyframes tp-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes tp-spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .tp-rise, .tp-float, .tp-skeleton, .tp-meter, .tp-modal, .tp-toast, .tp-flash { animation: none !important; }
}
`;
