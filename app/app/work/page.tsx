"use client";

import { useCallback, useEffect, useState } from "react";
import "../console/tokens.css";
import "./work.css";

interface Belief {
  id: string;
  content: string;
  confidence: number;
  source_agent: string | null;
  corroborated_by?: string[];
  created_at: string;
}

const AGENT_META: Record<string, { name: string; color: string; avatar: string }> = {
  muse: { name: "Muse", color: "#CDBCF7", avatar: "/avatars/muse.png" },
  grok: { name: "Grok", color: "#D6E6FF", avatar: "/avatars/grok.png" },
  dot: { name: "Dot", color: "#C8F2E6", avatar: "/avatars/dot.png" },
  fo: { name: "Fo", color: "#F0FAC9", avatar: "/avatars/fo.png" },
};

function agentLabel(id: string | null): string {
  if (!id) return "unknown";
  return AGENT_META[id]?.name || id;
}

// Avatar with fallback: character image if known, else colored initial
function AgentAvatar({ agentId, size = 22 }: { agentId: string | null; size?: number }) {
  const meta = agentId ? AGENT_META[agentId] : undefined;
  if (meta?.avatar) {
    return (
      <img
        src={meta.avatar}
        alt={meta.name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  // fallback: colored circle with initial
  const label = agentLabel(agentId);
  const initial = label.charAt(0).toUpperCase();
  // deterministic color from name
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) % 360;
  return (
    <span
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        background: `hsl(${h}, 45%, 55%)`,
        color: "#fff", fontSize: size * 0.45, fontWeight: 700,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {initial}
    </span>
  );
}

// Galaxy-style knowledge graph: clean radial, luminous nodes, subtle connections
function MindGraph({ beliefs }: { beliefs: Belief[] }) {
  const W = 400, H = 400, CX = W / 2, CY = H / 2;
  const [hover, setHover] = useState<{ x: number; y: number; belief: Belief } | null>(null);

  const rand = (i: number) => {
    const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  // Sort by confidence: brightest in center
  const sorted = [...beliefs].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  interface Node { x: number; y: number; r: number; color: string; op: number; glow: boolean; belief: Belief }
  const nodes: Node[] = [];

  // Golden-angle spiral: guarantees even, beautiful distribution — never clumps
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const maxR = 175;

  sorted.forEach((b, i) => {
    const conf = b.confidence || 0.5;
    const frac = (i + 1) / sorted.length;
    // sqrt for uniform density, start outside the core
    const rad = 28 + Math.sqrt(frac) * (maxR - 28);
    const ang = i * GOLDEN;
    const x = CX + Math.cos(ang) * rad;
    const y = CY + Math.sin(ang) * rad;
    const color = AGENT_META[b.source_agent || ""]?.color || "#8A97AD";
    nodes.push({
      x, y,
      r: 2.2 + conf * 3.2,
      color,
      op: 0.55 + conf * 0.45,
      glow: conf > 0.9,
      belief: b,
    });
  });

  // Subtle links: connect each node to 1-2 nearest neighbors (constellation feel)
  const links: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < nodes.length; i += 3) {
    const a = nodes[i];
    // find nearest neighbor by index proximity in spiral (adjacent = nearby in space)
    const b = nodes[i + 1];
    if (a && b) links.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }

  return (
    <div style={{ position: "relative", width: "100%" }}>
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", maxHeight: 400, background: "radial-gradient(ellipse at center, #0B1D3A 0%, #060F1F 70%)", borderRadius: 12 }}>
      <defs>
        <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* faint connection lines */}
      {links.map((l, i) => (
        <line key={`l-${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#D6E6FF" strokeWidth={0.5} opacity={0.12} />
      ))}

      {/* soft halos for bright nodes */}
      {nodes.filter(n => n.glow).map((n, i) => (
        <circle key={`h-${i}`} cx={n.x} cy={n.y} r={n.r * 3} fill={n.color} opacity={0.15} />
      ))}

      {/* nodes with glow filter on bright ones */}
      {nodes.map((n, i) => (
        <circle
          key={`n-${i}`}
          cx={n.x} cy={n.y} r={n.r + (hover?.belief.id === n.belief.id ? 3 : 0)}
          fill={n.color} opacity={hover?.belief.id === n.belief.id ? 1 : n.op}
          filter={n.glow ? "url(#glow)" : undefined}
          style={{ cursor: "pointer" }}
          onMouseEnter={() => setHover({ x: n.x, y: n.y, belief: n.belief })}
          onMouseLeave={() => setHover(null)}
        />
      ))}

      {/* tiny background stars */}
      {Array.from({ length: 40 }).map((_, i) => (
        <circle
          key={`s-${i}`}
          cx={rand(i + 9000) * W} cy={rand(i + 9500) * H}
          r={0.8} fill="#FFFFFF" opacity={0.15 + rand(i + 9800) * 0.2}
        />
      ))}
    </svg>

    {/* minimal hover tooltip */}
    {hover && (
      <div
        style={{
          position: "absolute",
          left: `${(hover.x / W) * 100}%`,
          top: `${(hover.y / H) * 100}%`,
          transform: "translate(-50%, calc(-100% - 12px))",
          background: "rgba(11, 29, 58, 0.95)",
          border: "1px solid #1C3357",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12,
          maxWidth: 220,
          pointerEvents: "none",
          zIndex: 10,
          boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ color: "#fff", lineHeight: 1.4, marginBottom: 4 }}>
          “{hover.belief.content.length > 90 ? hover.belief.content.slice(0, 90) + "…" : hover.belief.content}”
        </div>
        <div style={{ color: "#8A97AD", fontSize: 11 }}>
          {agentLabel(hover.belief.source_agent)} · {Math.round((hover.belief.confidence || 0) * 100)}%
        </div>
      </div>
    )}
    </div>
  );
}

export default function WorkPage() {
  const [beliefs, setBeliefs] = useState<Belief[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [propagatedId, setPropagatedId] = useState<string | null>(null);
  const [jevQuery, setJevQuery] = useState("");
  const [jevBusy, setJevBusy] = useState(false);
  const [jevAnswer, setJevAnswer] = useState<string | null>(null);
  const [graphOpen, setGraphOpen] = useState(false);

  const loadBeliefs = useCallback(async () => {
    try {
      const res = await fetch("/api/beliefs", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Belief[];
      setBeliefs(Array.isArray(data) ? data : []);
    } catch {
      /* keep old */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBeliefs();
    const id = setInterval(loadBeliefs, 8000);
    return () => clearInterval(id);
  }, [loadBeliefs]);

  // agent counts derived from beliefs
  const counts: Record<string, number> = {};
  for (const b of beliefs) {
    const k = b.source_agent || "unknown";
    counts[k] = (counts[k] || 0) + 1;
  }
  const agentIds = ["muse", "grok", "dot", "fo"];

  const startEdit = (b: Belief) => {
    setPropagatedId(null);
    setEditingId(b.id);
    setDraft(b.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft("");
  };

  const saveCorrection = async (id: string) => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/beliefs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correction: text, by: "owner" }),
      });
      if (!res.ok) throw new Error("correction failed");
      setEditingId(null);
      setDraft("");
      setPropagatedId(id);
      setTimeout(() => setPropagatedId((p) => (p === id ? null : p)), 4000);
      await loadBeliefs();
    } catch {
      /* keep editing open on failure */
    } finally {
      setBusy(false);
    }
  };

  const runPredict = async () => {
    const q = jevQuery.trim();
    if (!q || jevBusy) return;
    setJevBusy(true);
    setJevAnswer(null);
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (!res.ok) throw new Error("predict failed");
      const r = (await res.json()) as {
        intent: string;
        confidence: number;
        latencyMs: number;
      };
      setJevAnswer(
        `${r.intent} — ${Math.round((r.confidence || 0) * 100)}% · ${Math.round(
          r.latencyMs || 0
        )}ms`
      );
    } catch {
      setJevAnswer("jev couldn't answer that one.");
    } finally {
      setJevBusy(false);
    }
  };

  return (
    <div className="tp-console tp-work">
      {/* Hero with Telepath AI character */}
      <div className="tw-hero">
        <div className="tw-demo-badge">DEMO</div>
        <img src="/telepath-hero.png" alt="Telepath AI" className="tw-hero-img" />
        <div className="tw-hero-text">
          <h1>Telepath</h1>
          <p className="tw-hero-tagline">One shared mind for all your AI agents.</p>
          <p className="tw-hero-desc">
            Muse, Grok, Dot, and Fo read from and write to the same memory.
            Correct one belief, and every agent knows instantly.
            Ask Jev anything — the mind answers from what all agents have learned.
          </p>
          <div className="tw-hero-stats">
            <span><b>{beliefs.length}</b> beliefs</span>
            <span><b>4</b> agents</span>
            <span><b>1</b> mind</span>
          </div>
        </div>
      </div>

      {/* JEV bar */}
      <div className="tw-jev">
        <span className="tw-jev-logo">⚡ JEV</span>
        <input
          className="tw-jev-input"
          placeholder="Ask jev... e.g. what format does he prefer for reports?"
          value={jevQuery}
          onChange={(e) => setJevQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runPredict();
          }}
        />
        <button className="tw-btn-lima" onClick={runPredict} disabled={jevBusy}>
          {jevBusy ? "…" : "PREDICT"}
        </button>
      </div>
      {jevAnswer && <div className="tw-jev-answer">{jevAnswer}</div>}

      {/* Engine strip */}
      <div className="tw-engine">
        <span className="tw-engine-label">Engine</span>
        <div className="tw-flow">
          <span className="tw-fnode">
            <span className="tw-pulse" /> Agents
          </span>
          <span className="tw-farrow">→</span>
          <span className="tw-fnode">
            <span className="tw-pulse" /> MCP
          </span>
          <span className="tw-farrow">→</span>
          <span className="tw-fnode">
            <span className="tw-pulse" /> Supabase
          </span>
        </div>
        <span className="tw-latency">41ms</span>
      </div>

      {/* Three columns */}
      <div className="tw-cols">
        {/* Agents */}
        <div className="tw-panel">
          <h5>Agents</h5>
          {agentIds.map((aid) => (
            <div className="tw-arow" key={aid}>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="tw-pulse" />
                <AgentAvatar agentId={aid} size={36} />
                {AGENT_META[aid].name}
              </span>
              <span className="tw-count">{counts[aid] || 0}</span>
            </div>
          ))}
          <div className="tw-note">
            Every agent reads and writes to the same mind.
          </div>
        </div>

        {/* Mind — graph is the hero, count is discreet, click to expand */}
        <div className="tw-panel tw-mind">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h5 style={{ margin: 0 }}>Shared mind</h5>
            <span style={{ fontSize: 13, color: "#8A97AD" }}>
              <b style={{ color: "#fff", fontSize: 18 }}>{beliefs.length}</b> beliefs
            </span>
          </div>
          <div
            className="tw-viz tw-viz-large"
            onClick={() => setGraphOpen(true)}
            style={{ cursor: "zoom-in" }}
            title="Click to expand"
          >
            {loading ? <span>loading…</span> : <MindGraph beliefs={beliefs} />}
            <div className="tw-expand-hint">⤢ click to expand</div>
          </div>
          <div className="tw-viz-legend">center = core beliefs · size = confidence · hover for details</div>
          <div className="tw-stable">
            <span className="tw-pulse" /> STABLE
          </div>
        </div>

        {/* Beliefs with inline correction */}
        <div className="tw-panel">
          <h5>Beliefs — what the mind knows</h5>
          <div className="tw-beliefs">
            {loading && (
              <div className="tw-empty">Loading the mind…</div>
            )}
            {!loading &&
              beliefs.slice(0, 60).map((b) => (
                <div
                  className={
                    "tw-belief" +
                    (propagatedId === b.id ? " tw-propagated" : "")
                  }
                  key={b.id}
                >
                  {editingId === b.id ? (
                    <div className="tw-edit">
                      <input
                        className="tw-edit-input"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveCorrection(b.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        autoFocus
                      />
                      <div className="tw-edit-actions">
                        <button
                          className="tw-btn-lima tw-btn-sm"
                          onClick={() => saveCorrection(b.id)}
                          disabled={busy}
                        >
                          {busy ? "…" : "SAVE → PROPAGATE"}
                        </button>
                        <button
                          className="tw-btn-ghost"
                          onClick={cancelEdit}
                          disabled={busy}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="tw-belief-text">“{b.content}”</div>
                      <div className="tw-belief-meta">
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <AgentAvatar agentId={b.source_agent} size={22} />
                          {agentLabel(b.source_agent)} ·{" "}
                          {Math.round((b.confidence || 0) * 100)}%
                          {b.corroborated_by &&
                            b.corroborated_by.length > 0 && (
                              <span className="tw-corr">
                                {" "}
                                +{b.corroborated_by.length} agree
                              </span>
                            )}
                        </span>
                        <button
                          className="tw-btn-correct"
                          onClick={() => startEdit(b)}
                        >
                          CORRECT
                        </button>
                      </div>
                      {propagatedId === b.id && (
                        <div className="tw-propagated-msg">
                          ✓ Propagated to 4 agents
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="tw-footer">
        Telepath · Supabase Select 2026 · Corrections travel at the speed of
        light
      </div>

      {/* Expand modal */}
      {graphOpen && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(4, 8, 18, 0.92)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 32, cursor: "zoom-out",
          }}
          onClick={() => setGraphOpen(false)}
        >
          <div
            style={{ width: "min(90vmin, 800px)", position: "relative" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ color: "#8A97AD", fontSize: 14 }}>
                Shared mind · <b style={{ color: "#fff" }}>{beliefs.length}</b> beliefs
              </span>
              <button
                onClick={() => setGraphOpen(false)}
                style={{ background: "none", border: "1px solid #1C3357", color: "#fff", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}
              >
                ✕ Close
              </button>
            </div>
            <MindGraph beliefs={beliefs} />
          </div>
        </div>
      )}
    </div>
  );
}
