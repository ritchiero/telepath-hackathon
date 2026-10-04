"use client";

/*
 * Telepath · /onboarding — connector flow
 * "I want to use Telepath → connect my Supabase → connect my agents."
 * Drafta light skin. 3 steps: database → agents → alive.
 * Self-contained: React + fetch() only.
 *
 * Honesty notes:
 * - Supabase keys are validated locally and stored in localStorage ONLY.
 *   They are never sent anywhere. OAuth login is post-demo.
 * - The MCP endpoint (https://telepath-nu.vercel.app/api/mcp) is the
 *   planned integration point; configs below are ready to paste.
 */

import { useEffect, useMemo, useState } from "react";

/* ── polished copy (claude-opus-4-5) ─────────────────────────────── */
const COPY = {
  kicker: "3-step setup",
  h1: "Connect Telepath",
  sub: "Your agents, one shared memory — running on your own infrastructure.",
  s1title: "Connect your database",
  s1sub: "Your memory lives in your Supabase, not on our servers. We never see your data.",
  s1note: "Paste your project URL and anon key. They stay in your browser. OAuth login coming soon.",
  urlPh: "https://xyzcompany.supabase.co",
  keyPh: "sb_publishable_… or eyJhbGciOi…",
  btnConnect: "Connect Supabase",
  btnReconnect: "Reconnect",
  connected: "Connected",
  sqlTitle: "Create tables",
  sqlDesc: "Telepath needs four tables: beliefs, events, predictions, agent_states. Run this once in your Supabase SQL editor.",
  sqlDone: "Tables ready",
  btnCopy: "Copy",
  copied: "Copied",
  s2title: "Connect your agents",
  s2sub: "Give each agent this instruction. They'll read and write your shared memory through Telepath.",
  cfgTitle: "MCP server config",
  instrTitle: "What to tell your agent",
  s3title: "Your memory is live",
  s3sub: "Everything is connected. Ask one agent something, correct it, and watch another agent know it.",
  btnStage: "Open the stage",
  foot: "Your keys never leave this browser.",
  beliefs: "beliefs in your mind",
};

type Step = 1 | 2 | 3;

const MCP_URL = "https://telepath-nu.vercel.app/api/mcp";

const CLIENTS = [
  {
    id: "claude-code",
    name: "Claude Code",
    file: "~/.claude.json",
    config: `{
  "mcpServers": {
    "telepath": {
      "url": "${MCP_URL}",
      "headers": {
        "Authorization": "Bearer YOUR_SUPABASE_ANON_KEY"
      }
    }
  }
}`,
  },
  {
    id: "cursor",
    name: "Cursor",
    file: "~/.cursor/mcp.json",
    config: `{
  "mcpServers": {
    "telepath": {
      "url": "${MCP_URL}",
      "headers": {
        "Authorization": "Bearer YOUR_SUPABASE_ANON_KEY"
      }
    }
  }
}`,
  },
  {
    id: "windsurf",
    name: "Windsurf",
    file: "mcp_config.json",
    config: `{
  "mcpServers": {
    "telepath": {
      "serverUrl": "${MCP_URL}",
      "headers": {
        "Authorization": "Bearer YOUR_SUPABASE_ANON_KEY"
      }
    }
  }
}`,
  },
] as const;

const AGENT_INSTRUCTION = `Use the Telepath tools (recall, contribute, correct) to read and write shared memory about me. Before answering, recall what the memory knows. When you learn something new about me, contribute it.`;

const TOOLS = [
  { name: "recall", desc: "Search the shared mind for what it knows about a topic." },
  { name: "contribute", desc: "Add something new the agent learned about the user." },
  { name: "correct", desc: "Fix a belief. The user is ground truth." },
];

const SQL_MIGRATION = `-- Telepath · tables (run once in Supabase SQL editor)
create extension if not exists vector;

create table if not exists public.beliefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  embedding vector(1536),
  confidence double precision not null default 0.5,
  source_agent text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  agent text not null,
  predicted_intent text not null,
  confidence double precision not null,
  correct boolean,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  agent text not null,
  capabilities text[] not null default '{}',
  tokens_remaining integer not null default 0,
  tokens_max integer not null default 0,
  last_heartbeat timestamptz not null default now(),
  primary key (user_id, agent)
);

alter table public.beliefs enable row level security;
alter table public.events enable row level security;
alter table public.predictions enable row level security;
alter table public.agent_states enable row level security;`;

function isValidSupabaseUrl(v: string): boolean {
  const t = v.trim();
  if (!t) return false;
  try {
    const u = new URL(t);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".supabase.co");
  } catch {
    return false;
  }
}

function isValidAnonKey(v: string): boolean {
  const t = v.trim();
  return t.length >= 20;
}

export default function Onboarding() {
  const [step, setStep] = useState<Step>(1);
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [connectedUrl, setConnectedUrl] = useState<string | null>(null);
  const [urlError, setUrlError] = useState("");
  const [client, setClient] = useState<string>("claude-code");
  const [copied, setCopied] = useState<string | null>(null);
  const [instrCopied, setInstrCopied] = useState(false);
  const [sqlOpen, setSqlOpen] = useState(false);
  const [beliefCount, setBeliefCount] = useState<number | null>(null);
  const [flash, setFlash] = useState<number | null>(null);

  /* restore local connection (keys never leave the browser) */
  useEffect(() => {
    try {
      const saved = localStorage.getItem("telepath-supabase-url");
      if (saved && isValidSupabaseUrl(saved)) setConnectedUrl(saved);
    } catch {
      /* noop */
    }
    fetch("/api/beliefs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setBeliefCount(Array.isArray(d) ? d.length : 0))
      .catch(() => setBeliefCount(0));
  }, []);

  function doFlash(n: number) {
    setFlash(n);
    setTimeout(() => setFlash(null), 700);
  }

  function connect() {
    setUrlError("");
    const u = url.trim();
    const k = anonKey.trim();
    if (!isValidSupabaseUrl(u)) {
      setUrlError("That doesn't look like a Supabase project URL.");
      return;
    }
    if (!isValidAnonKey(k)) {
      setUrlError("The anon key looks too short — check for a copy-paste slip.");
      return;
    }
    try {
      localStorage.setItem("telepath-supabase-url", u);
      localStorage.setItem("telepath-supabase-anon", k);
    } catch {
      /* private mode etc. — still show connected for the session */
    }
    setConnectedUrl(u);
    doFlash(1);
  }

  function disconnect() {
    try {
      localStorage.removeItem("telepath-supabase-url");
      localStorage.removeItem("telepath-supabase-anon");
    } catch {
      /* noop */
    }
    setConnectedUrl(null);
    setUrl("");
    setAnonKey("");
  }

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(id);
    if (id === "instruction") setInstrCopied(true);
    setTimeout(() => setCopied(null), 1600);
  }

  const step1done = connectedUrl !== null;
  const step2done = instrCopied;
  const step3done = step1done && step2done;
  const doneN = [step1done, step2done, step3done].filter(Boolean).length;

  const steps = useMemo(
    () => [
      { n: 1 as Step, title: COPY.s1title, short: "Database", ok: step1done },
      { n: 2 as Step, title: COPY.s2title, short: "Agents", ok: step2done },
      { n: 3 as Step, title: COPY.s3title, short: "Alive", ok: step3done },
    ],
    [step1done, step2done, step3done]
  );

  const activeClient = CLIENTS.find((c) => c.id === client) || CLIENTS[0];

  return (
    <div className="tp-light relative min-h-screen">
      <style>{CSS}</style>
      <Backdrop />
      <TopNav />

      <main className="mx-auto max-w-[1040px] px-5 pb-28 md:px-10">
        {/* intro */}
        <section className="tp-rise flex flex-col items-center pt-14 text-center md:pt-20">
          <span className="tp-kicker">
            <SparkIcon size={16} />
            {COPY.kicker}
          </span>
          <h1 className="tp-display mt-7">
            {COPY.h1.split(" ")[0]}{" "}
            <span style={{ color: "var(--tp-faint)" }}>{COPY.h1.split(" ").slice(1).join(" ")}</span>
          </h1>
          <p className="mt-5 max-w-[560px] text-[19px] leading-[1.6]" style={{ color: "var(--tp-muted)" }}>
            {COPY.sub}
          </p>
        </section>

        {/* progress */}
        <section className="mx-auto mt-12 max-w-[760px]">
          <div className="flex gap-2">
            {steps.map((s) => (
              <div key={s.n} className="tp-seg">
                <div
                  className="tp-seg-fill"
                  style={{ width: s.ok ? "100%" : step === s.n ? "35%" : "0%" }}
                />
              </div>
            ))}
          </div>
          <p className="mt-3 text-[15px] font-semibold">
            <span className="tp-gradient-text">{doneN} of 3 done</span>
            <span style={{ color: "var(--tp-faint)" }}>
              {" "}
              · {doneN === 3 ? "your memory is live ✦" : "keep going"}
            </span>
          </p>

          <ol className="mt-6 grid gap-2 sm:grid-cols-3" aria-label="Steps">
            {steps.map((s) => (
              <li key={s.n}>
                <button
                  onClick={() => setStep(s.n)}
                  className={`tp-step ${flash === s.n ? "tp-pop" : ""}`}
                  data-on={step === s.n}
                  data-ok={s.ok}
                  aria-current={step === s.n ? "step" : undefined}
                >
                  <span className="tp-step-num">{s.ok ? <CheckIcon size={14} /> : s.n}</span>
                  <span className="truncate" title={s.title}>
                    {s.short}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        {/* step card */}
        <section
          className="tp-card mx-auto mt-6 max-w-[960px] overflow-hidden"
          style={{ borderRadius: 32, boxShadow: "var(--tp-shadow-md)" }}
        >
          {step === 1 && (
            <div key="s1" className={`tp-rise p-6 md:p-10 ${flash === 1 ? "tp-pop" : ""}`}>
              <StepHeader n={1} title={COPY.s1title} sub={COPY.s1sub} />

              {connectedUrl ? (
                <div className="tp-connected mt-8">
                  <span className="tp-dot-live" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-semibold">{COPY.connected}</p>
                    <p className="truncate text-[14px]" style={{ color: "var(--tp-muted)" }}>
                      {connectedUrl}
                    </p>
                  </div>
                  <button className="tp-btn tp-btn-sm tp-btn-ghost" onClick={disconnect}>
                    {COPY.btnReconnect}
                  </button>
                  <button
                    className="tp-btn tp-btn-sm tp-btn-primary"
                    onClick={() => {
                      setStep(2);
                      doFlash(2);
                    }}
                  >
                    Continue <ArrowIcon size={15} />
                  </button>
                </div>
              ) : (
                <div className="mt-8 grid gap-4">
                  <label className="block">
                    <span className="tp-label">Project URL</span>
                    <input
                      className="tp-field mt-2 font-mono"
                      type="url"
                      inputMode="url"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={COPY.urlPh}
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="tp-label">Anon key</span>
                    <input
                      className="tp-field mt-2 font-mono"
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={COPY.keyPh}
                      value={anonKey}
                      onChange={(e) => setAnonKey(e.target.value)}
                    />
                  </label>
                  {urlError && (
                    <p className="text-[15px] font-medium" style={{ color: "var(--tp-danger-ink)" }}>
                      {urlError}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <button className="tp-btn tp-btn-primary" onClick={connect}>
                      <DbIcon size={17} /> {COPY.btnConnect}
                    </button>
                    <span className="tp-locknote">
                      <LockIcon size={14} /> {COPY.s1note}
                    </span>
                  </div>
                </div>
              )}

              {/* table setup */}
              <div className="mt-10 border-t pt-8" style={{ borderColor: "var(--tp-hairline)" }}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-[19px] font-bold tracking-[-0.01em]">{COPY.sqlTitle}</h3>
                    <p className="mt-1 max-w-[520px] text-[15px] leading-[1.55]" style={{ color: "var(--tp-muted)" }}>
                      {COPY.sqlDesc}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="tp-btn tp-btn-sm tp-btn-secondary"
                      onClick={() => setSqlOpen((v) => !v)}
                      aria-expanded={sqlOpen}
                    >
                      {sqlOpen ? "Hide SQL" : "Show SQL"}
                    </button>
                    <button className="tp-btn tp-btn-sm tp-btn-secondary" onClick={() => copy(SQL_MIGRATION, "sql")}>
                      {copied === "sql" ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                      {copied === "sql" ? COPY.copied : COPY.btnCopy}
                    </button>
                  </div>
                </div>
                {sqlOpen && (
                  <pre className="tp-code mt-4 overflow-x-auto p-5 text-[13px] leading-[1.6]">
                    {SQL_MIGRATION}
                  </pre>
                )}
                <p className="mt-4 inline-flex items-center gap-2 text-[14px] font-semibold" style={{ color: "var(--tp-muted)" }}>
                  <span className="tp-dot-idle" /> {COPY.sqlDone} — run once, then forget it
                </p>
              </div>

              <StepFooter
                left={
                  <span className="tp-footnote">
                    <LockIcon size={14} /> {COPY.foot}
                  </span>
                }
              >
                {step1done && (
                  <button className="tp-btn tp-btn-secondary" onClick={() => setStep(2)}>
                    Next: agents <ArrowIcon size={15} />
                  </button>
                )}
              </StepFooter>
            </div>
          )}

          {step === 2 && (
            <div key="s2" className={`tp-rise p-6 md:p-10 ${flash === 2 ? "tp-pop" : ""}`}>
              <StepHeader n={2} title={COPY.s2title} sub={COPY.s2sub} />

              {/* client tabs */}
              <div className="tp-segment mt-8" role="tablist" aria-label="Agent client">
                {CLIENTS.map((c) => (
                  <button
                    key={c.id}
                    role="tab"
                    aria-selected={client === c.id}
                    data-on={client === c.id}
                    onClick={() => setClient(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>

              {/* MCP config */}
              <div className="mt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-[17px] font-bold tracking-[-0.01em]">
                    {COPY.cfgTitle} <span className="tp-filehint">{activeClient.file}</span>
                  </h3>
                  <button
                    className="tp-btn tp-btn-sm tp-btn-secondary"
                    onClick={() => copy(activeClient.config, "config")}
                  >
                    {copied === "config" ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                    {copied === "config" ? COPY.copied : COPY.btnCopy}
                  </button>
                </div>
                <pre className="tp-code mt-3 overflow-x-auto p-5 text-[13.5px] leading-[1.65]">
                  {activeClient.config}
                </pre>
                <div className="mt-4 flex flex-wrap gap-2">
                  {TOOLS.map((t) => (
                    <span key={t.name} className="tp-chip" title={t.desc}>
                      <code className="font-mono font-bold">{t.name}</code>
                    </span>
                  ))}
                  <span className="self-center text-[14px]" style={{ color: "var(--tp-faint)" }}>
                    three tools, that's the whole surface
                  </span>
                </div>
              </div>

              {/* plain-english instruction */}
              <div className="mt-8 border-t pt-8" style={{ borderColor: "var(--tp-hairline)" }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-[17px] font-bold tracking-[-0.01em]">{COPY.instrTitle}</h3>
                  <button
                    className="tp-btn tp-btn-sm tp-btn-primary"
                    onClick={() => copy(AGENT_INSTRUCTION, "instruction")}
                  >
                    {copied === "instruction" ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                    {copied === "instruction" ? COPY.copied : COPY.btnCopy}
                  </button>
                </div>
                <div className="tp-quote mt-3">
                  <p className="text-[16px] leading-[1.6]">{AGENT_INSTRUCTION}</p>
                </div>
                <p className="mt-3 text-[14px]" style={{ color: "var(--tp-muted)" }}>
                  Paste it once per agent. From then on they share one memory.
                </p>
              </div>

              <StepFooter
                left={
                  <button className="tp-btn tp-btn-ghost tp-btn-sm" onClick={() => setStep(1)}>
                    ← Back
                  </button>
                }
              >
                <button
                  className="tp-btn tp-btn-primary"
                  disabled={!step2done && false}
                  onClick={() => {
                    setStep(3);
                    doFlash(3);
                  }}
                >
                  {step2done ? "Continue" : "Skip for now"} <ArrowIcon size={15} />
                </button>
              </StepFooter>
            </div>
          )}

          {step === 3 && (
            <div key="s3" className={`tp-rise p-6 text-center md:p-10 ${flash === 3 ? "tp-pop" : ""}`}>
              <div className="mx-auto max-w-[560px]">
                <span className="tp-kicker">
                  <SparkIcon size={16} /> Step 3
                </span>
                <h2 className="tp-h2 mt-6">{COPY.s3title}</h2>
                <p className="mx-auto mt-4 max-w-[440px] text-[17px] leading-[1.6]" style={{ color: "var(--tp-muted)" }}>
                  {COPY.s3sub}
                </p>

                <div className="tp-alivecard mt-8">
                  <p className="tp-big tp-gradient-text">
                    {beliefCount === null ? "…" : beliefCount}
                  </p>
                  <p className="mt-2 text-[15px] font-semibold" style={{ color: "var(--tp-muted)" }}>
                    {COPY.beliefs}
                  </p>
                </div>

                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <a href="/" className="tp-btn tp-btn-primary" style={{ textDecoration: "none" }}>
                    {COPY.btnStage} <ArrowIcon size={16} />
                  </a>
                  <a href="/privacy" className="tp-btn tp-btn-secondary" style={{ textDecoration: "none" }}>
                    Review memory
                  </a>
                </div>

                {!step3done && (
                  <p className="mx-auto mt-6 max-w-[420px] text-[14px]" style={{ color: "var(--tp-faint)" }}>
                    Tip: connect your database (step 1) and copy the agent instruction (step 2) to
                    finish setup.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>

        <p className="mt-10 text-center text-[14px]" style={{ color: "var(--tp-faint)" }}>
          <LockIcon size={13} /> {COPY.foot}
        </p>
      </main>
    </div>
  );
}

/* ── pieces ─────────────────────────────────────────────────────── */

function StepHeader({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div>
      <span className="tp-kicker">
        <SparkIcon size={15} /> Step {n}
      </span>
      <h2 className="tp-h2 mt-5">{title}</h2>
      <p className="mt-3 max-w-[600px] text-[17px] leading-[1.6]" style={{ color: "var(--tp-muted)" }}>
        {sub}
      </p>
    </div>
  );
}

function StepFooter({ left, children }: { left: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t pt-6" style={{ borderColor: "var(--tp-hairline)" }}>
      <div>{left}</div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

function TopNav() {
  return (
    <header className="tp-nav sticky top-0 z-20">
      <div className="mx-auto flex h-[60px] max-w-[1040px] items-center justify-between px-5 md:px-10">
        <a href="/" className="text-[17px] font-extrabold tracking-[-0.02em]" style={{ textDecoration: "none", color: "inherit" }}>
          Telepath
        </a>
        <a href="/" className="text-[15px] font-semibold" style={{ color: "var(--tp-muted)", textDecoration: "none" }}>
          Skip setup
        </a>
      </div>
    </header>
  );
}

function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgba(16,16,24,.10) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage: "radial-gradient(ellipse 90% 60% at 50% 0%, black 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 60% at 50% 0%, black 30%, transparent 75%)",
        }}
      />
    </div>
  );
}

/* ── icons (inline svg) ─────────────────────────────────────────── */

interface IconProps {
  size?: number;
}

function SparkIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2v6m0 8v6M2 12h6m8 0h6" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
      <circle cx={12} cy={12} r={3.2} fill="currentColor" />
    </svg>
  );
}

function CheckIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 12.5l5 5L20 6.5" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 12h15m-6-7l7 7-7 7" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x={8} y={8} width={12} height={12} rx={2.5} stroke="currentColor" strokeWidth={2} />
      <path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4H6.5A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}

function LockIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x={4.5} y={10} width={15} height={10} rx={2.5} stroke="currentColor" strokeWidth={2} />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}

function DbIcon({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <ellipse cx={12} cy={5.5} rx={7.5} ry={2.8} stroke="currentColor" strokeWidth={2} />
      <path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13" stroke="currentColor" strokeWidth={2} />
      <path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}

/* ── styles (Drafta light tokens, extended for connector flow) ──── */

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
  --tp-ease: cubic-bezier(.22,1,.36,1);
  color: var(--tp-ink);
  font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.tp-display { font-size: clamp(46px, 6.6vw, 84px); font-weight: 800; line-height: .98; letter-spacing: -0.045em; }
.tp-h2 { font-size: clamp(26px, 3vw, 34px); font-weight: 700; line-height: 1.15; letter-spacing: -0.025em; }

.tp-nav { background: rgba(247,247,249,.72); backdrop-filter: saturate(180%) blur(18px); -webkit-backdrop-filter: saturate(180%) blur(18px); border-bottom: 1px solid rgba(236,236,239,.8); }

.tp-card {
  background: var(--tp-surface);
  border: 1px solid var(--tp-hairline);
  border-radius: 28px;
  box-shadow: 0 1px 2px rgba(16,16,24,.04), 0 4px 12px -4px rgba(16,16,24,.06);
}

.tp-kicker {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 16px 8px 13px; border-radius: 999px;
  background: #fff; border: 1px solid var(--tp-hairline);
  box-shadow: 0 1px 2px rgba(16,16,24,.04), 0 4px 12px -4px rgba(16,16,24,.06), inset 0 -1px 0 rgba(16,16,24,.03);
  font-size: 15px; font-weight: 600; color: var(--tp-ink-2);
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
.tp-btn-sm { height: 38px; padding: 0 16px; font-size: 15px; }
.tp-btn-primary { background: var(--tp-action); color: #fff; box-shadow: 0 1px 2px rgba(16,16,24,.25), inset 0 1px 0 rgba(255,255,255,.14); }
.tp-btn-primary:hover:not(:disabled) { background: var(--tp-action-hover); }
.tp-btn-secondary { background: #fff; color: var(--tp-ink); border-color: var(--tp-hairline-strong); box-shadow: 0 1px 2px rgba(16,16,24,.04); }
.tp-btn-secondary:hover:not(:disabled) { background: #fafafb; border-color: #d4d4da; }
.tp-btn-ghost { background: transparent; color: var(--tp-ink-2); }
.tp-btn-ghost:hover:not(:disabled) { background: rgba(16,16,24,.05); }

.tp-field {
  width: 100%; background: var(--tp-sunken); border: 1px solid transparent; border-radius: 16px;
  padding: 14px 16px; font-size: 16px; line-height: 1.55; color: var(--tp-ink); outline: none;
  transition: background .2s, border-color .2s, box-shadow .2s;
}
.tp-field:focus { background: #fff; border-color: var(--tp-focus); box-shadow: 0 0 0 4px rgba(77,141,255,.16); }
.tp-field::placeholder { color: var(--tp-faint); }

.tp-label { display: block; font-size: 14px; font-weight: 700; letter-spacing: .01em; color: var(--tp-ink-2); }

.tp-locknote {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 14px; font-weight: 500; color: var(--tp-muted); max-width: 420px; line-height: 1.5;
}
.tp-footnote { display: inline-flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 500; color: var(--tp-faint); }

.tp-seg { flex: 1; height: 8px; border-radius: 999px; background: #e9e9ee; overflow: hidden; }
.tp-seg-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #fbbf24, #fb7185 45%, #a78bfa 75%, #4d8dff); transition: width .7s var(--tp-ease); }
.tp-gradient-text { background: linear-gradient(90deg, #f59e0b, #ec4899 50%, #8b5cf6); -webkit-background-clip: text; background-clip: text; color: transparent; }
.tp-big { font-size: clamp(44px, 6vw, 64px); font-weight: 800; line-height: 1; letter-spacing: -0.04em; }

.tp-step {
  display: flex; align-items: center; gap: 10px; width: 100%; height: 48px; padding: 0 16px 0 8px; border-radius: 999px;
  background: rgba(255,255,255,.6); border: 1px solid var(--tp-hairline); color: var(--tp-muted);
  font-size: 15px; font-weight: 600; text-align: left; transition: background .2s, color .2s, box-shadow .2s, border-color .2s;
  cursor: pointer;
}
.tp-step:hover { border-color: var(--tp-hairline-strong); color: var(--tp-ink); }
.tp-step[data-on="true"] { background: #fff; color: var(--tp-ink); box-shadow: 0 1px 2px rgba(16,16,24,.06); border-color: var(--tp-hairline-strong); }
.tp-step-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 999px; flex: none;
  background: var(--tp-sunken); font-size: 14px; font-weight: 700; color: var(--tp-muted);
}
.tp-step[data-ok="true"] .tp-step-num { background: #0f0f14; color: #fff; }

.tp-segment { display: inline-flex; align-items: center; gap: 2px; padding: 4px; border-radius: 999px; background: #ededf1; box-shadow: inset 0 1px 2px rgba(16,16,24,.05); }
.tp-segment > * {
  display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px; border-radius: 999px;
  font-size: 15px; font-weight: 600; color: var(--tp-muted); white-space: nowrap; cursor: pointer; border: none; background: transparent;
  transition: background .2s, color .2s, box-shadow .2s;
}
.tp-segment > *:hover { color: var(--tp-ink); }
.tp-segment > [data-on="true"] { background: #fff; color: var(--tp-ink); box-shadow: 0 1px 2px rgba(16,16,24,.08), 0 2px 6px -2px rgba(16,16,24,.08); }

.tp-code {
  background: #0f0f14; color: #e8e8ec; border-radius: 20px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
}
.tp-quote {
  background: var(--tp-sunken); border: 1px solid var(--tp-hairline);
  border-radius: 20px; padding: 20px 22px;
}
.tp-chip { display: inline-flex; align-items: center; gap: 7px; height: 30px; padding: 0 12px; border-radius: 999px; background: #fff; border: 1px solid var(--tp-hairline-strong); font-size: 14px; font-weight: 600; color: var(--tp-ink-2); box-shadow: 0 1px 2px rgba(16,16,24,.04); }
.tp-filehint { font-size: 13px; font-weight: 600; color: var(--tp-faint); font-family: ui-monospace, Menlo, Consolas, monospace; }

.tp-connected {
  display: flex; align-items: center; gap: 14px;
  background: #f4fbf4; border: 1px solid #d9ecd9; border-radius: 20px; padding: 16px 18px;
}
.tp-dot-live { width: 10px; height: 10px; border-radius: 999px; background: #22c55e; flex: none; box-shadow: 0 0 0 4px rgba(34,197,94,.18); }
.tp-dot-idle { width: 8px; height: 8px; border-radius: 999px; background: #d4d4da; flex: none; }

.tp-alivecard {
  background: var(--tp-sunken); border: 1px solid var(--tp-hairline);
  border-radius: 24px; padding: 30px 24px;
}

.tp-rise { animation: tp-rise .55s var(--tp-ease) backwards; }
.tp-pop { animation: tp-pop .6s var(--tp-ease); }
@keyframes tp-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes tp-pop { 0% { transform: scale(.985); } 40% { transform: scale(1.015); } 100% { transform: scale(1); } }

@media (prefers-reduced-motion: reduce) {
  .tp-rise, .tp-pop { animation: none !important; }
}
`;
