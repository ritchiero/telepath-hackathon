"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "./tokens.css";
import "./console.css";
import { AGENTS } from "@/lib/agents";

interface Belief {
  id: string;
  content: string;
  confidence: number;
  source_agent: string | null;
  corroborated_by?: string[];
  created_at: string;
}

interface Msg {
  role: "user" | "assistant";
  content: string;
  id: number;
}

let msgId = 0;

const AGENT_COLORS: Record<string, string> = {
  muse: "#CDBCF7",
  grok: "#D6E6FF",
  dot: "#C8F2E6",
  fo: "#F0FAC9",
};

function initials(name: string) {
  return name.slice(0, 1).toUpperCase();
}

export default function ConsolePage() {
  const [beliefs, setBeliefs] = useState<Belief[]>([]);
  const [beliefsLoading, setBeliefsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [agentId, setAgentId] = useState("grok");
  const [threads, setThreads] = useState<Record<string, Msg[]>>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const agent = AGENTS.find((a) => a.id === agentId) || AGENTS[0];
  const messages = threads[agentId] || [];

  // ---- beliefs (real API, refresh on interval + on demand) ----
  const loadBeliefs = useCallback(async () => {
    try {
      const res = await fetch("/api/beliefs", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Belief[];
      setBeliefs(Array.isArray(data) ? data : []);
    } catch {
      /* keep old */
    } finally {
      setBeliefsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBeliefs();
    const id = setInterval(loadBeliefs, 8000);
    return () => clearInterval(id);
  }, [loadBeliefs]);

  const filtered = search.trim()
    ? beliefs.filter((b) => b.content.toLowerCase().includes(search.trim().toLowerCase()))
    : beliefs;

  // ---- chat (real /api/chat, streaming) ----
  const scrollDown = () => {
    requestAnimationFrame(() => {
      const el = boxRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    const uId = ++msgId;
    const aId = ++msgId;
    const next: Msg[] = [
      ...messages,
      { role: "user", content: text, id: uId },
      { role: "assistant", content: "", id: aId },
    ];
    setThreads((t) => ({ ...t, [agentId]: next }));
    scrollDown();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: agentId,
          messages: next
            .filter((m) => m.content)
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok || !res.body) throw new Error("chat failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const snapshot = acc;
        setThreads((t) => ({
          ...t,
          [agentId]: (t[agentId] || []).map((m) =>
            m.id === aId ? { ...m, content: snapshot } : m
          ),
        }));
        scrollDown();
      }
    } catch {
      setThreads((t) => ({
        ...t,
        [agentId]: (t[agentId] || []).map((m) =>
          m.id === aId ? { ...m, content: "Lost connection to the mind. Try again." } : m
        ),
      }));
    } finally {
      setBusy(false);
      scrollDown();
      // refresh beliefs — the agent may have contributed
      setTimeout(loadBeliefs, 1500);
    }
  };

  const avgConf = beliefs.length
    ? Math.round((beliefs.reduce((s, b) => s + b.confidence, 0) / beliefs.length) * 100) + "%"
    : "—";

  return (
    <div className="tp-console">
      {/* header */}
      <header className="tp-header">
        <div>
          <div className="tp-eyebrow">Shared mind</div>
          <div className="tp-wordmark">Telepath</div>
        </div>
        <div className="tp-header-stats">
          <div className="tp-stat">
            <span className="tp-stat-label">Beliefs</span>
            <span className="tp-stat-value">{beliefsLoading ? "—" : beliefs.length}</span>
          </div>
          <div className="tp-stat">
            <span className="tp-stat-label">Confidence</span>
            <span className="tp-stat-value">{beliefsLoading ? "—" : avgConf}</span>
          </div>
          <div className="tp-stat">
            <span className="tp-stat-label">Sync</span>
            <span className="tp-stat-value accent">
              <span className="tp-sync-dot" />
              live
            </span>
          </div>
        </div>
      </header>

      <div className="tp-columns">
        {/* left: agents */}
        <aside className="tp-agents-col">
          <div className="tp-panel">
            <div className="tp-eyebrow" style={{ padding: "4px 8px 8px" }}>
              Agents · one mind, four voices
            </div>
            {AGENTS.map((a) => (
              <button
                key={a.id}
                className={`tp-agent-row${a.id === agentId ? " active" : ""}`}
                onClick={() => setAgentId(a.id)}
              >
                <span
                  className="tp-agent-avatar"
                  style={{ background: AGENT_COLORS[a.id] || "#fff" }}
                >
                  {initials(a.name)}
                </span>
                <span>
                  <div className="tp-agent-name">{a.name}</div>
                  <div className="tp-agent-tag">{a.tagline}</div>
                </span>
                {a.id === agentId && <span className="tp-agent-check">●</span>}
              </button>
            ))}
          </div>
          <div className="tp-panel">
            <div className="tp-eyebrow" style={{ padding: "4px 8px" }}>
              Reflex layer
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, padding: "0 8px" }}>jev</div>
            <p
              style={{
                fontSize: 13.5,
                lineHeight: 1.55,
                color: "var(--tp-text-3)",
                margin: 0,
                padding: "0 8px 8px",
              }}
            >
              Watches the mind, predicts the next request and acts before anyone asks.
            </p>
          </div>
        </aside>

        {/* center: chat */}
        <main className="tp-chat-col">
          <div className="tp-chat-head">
            <span
              className="tp-agent-avatar"
              style={{ background: AGENT_COLORS[agent.id] || "#fff" }}
            >
              {initials(agent.name)}
            </span>
            <div>
              <div className="tp-chat-title">{agent.name}</div>
              <div className="tp-chat-sub">{agent.tagline}</div>
            </div>
            <span className="tp-chat-meta">
              <span className="tp-spark">✦</span>Reads the shared mind ·{" "}
              {beliefs.length} beliefs
            </span>
          </div>
          <div className="tp-messages" ref={boxRef}>
            {messages.length === 0 && (
              <div className="tp-empty-thread">
                <h3>Ask {agent.name} anything.</h3>
                <p>
                  Every answer is grounded in the shared mind — what one agent
                  learns, all four know.
                </p>
              </div>
            )}
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="tp-msg user">
                  {m.content}
                </div>
              ) : (
                <div key={m.id} className="tp-msg agent">
                  <span
                    className="tp-msg-agent"
                    style={{ color: AGENT_COLORS[agent.id] }}
                  >
                    {agent.name}
                  </span>
                  {m.content || (
                    <span className="tp-typing">reading the mind…</span>
                  )}
                </div>
              )
            )}
          </div>
          <div className="tp-composer">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={`Message ${agent.name}…`}
              disabled={busy}
            />
            <button className="tp-btn" onClick={send} disabled={busy || !input.trim()}>
              Send
            </button>
          </div>
        </main>

        {/* right: shared mind */}
        <section className="tp-mind-col">
          <div className="tp-panel">
            <div className="tp-mind-head">
              <span className="tp-eyebrow">Shared mind</span>
              <span className="tp-status-pill">awake</span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--tp-text-4)" }}>
                {beliefs.length} beliefs
              </span>
            </div>
            <input
              className="tp-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search beliefs…"
            />
          </div>
          <div className="tp-panel" style={{ flex: 1, minHeight: 0 }}>
            <div className="tp-beliefs">
              {beliefsLoading &&
                [0, 1, 2, 3].map((i) => <div key={i} className="tp-skel" />)}
              {!beliefsLoading && filtered.length === 0 && (
                <div className="tp-empty-thread">
                  <h3>No beliefs found.</h3>
                  <p>Try a different search, or teach the mind something new.</p>
                </div>
              )}
              {!beliefsLoading &&
                filtered.slice(0, 120).map((b) => (
                  <div key={b.id} className="tp-belief">
                    <p className="tp-belief-text">{b.content}</p>
                    <div className="tp-belief-meta">
                      <span className="tp-conf">
                        {Math.round(b.confidence * 100)}%
                      </span>
                      {b.source_agent && (
                        <span className="tp-src">{b.source_agent}</span>
                      )}
                      {b.corroborated_by && b.corroborated_by.length > 0 && (
                        <span>· corroborated by {b.corroborated_by.join(", ")}</span>
                      )}
                    </div>
                    <div className="tp-conf-bar">
                      <div
                        className="tp-conf-fill"
                        style={{ width: `${Math.round(b.confidence * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              {!beliefsLoading && filtered.length > 120 && (
                <div
                  style={{
                    textAlign: "center",
                    fontSize: 12.5,
                    color: "var(--tp-text-4)",
                    padding: "8px",
                  }}
                >
                  Showing 120 of {filtered.length} — refine your search.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <footer className="tp-footer">
        Telepath · Supabase Select 2026 Hackathon · Corrections travel at the speed of light
      </footer>
    </div>
  );
}
