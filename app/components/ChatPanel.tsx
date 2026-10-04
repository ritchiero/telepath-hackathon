"use client";

import { useRef, useState } from "react";
import type { AgentDef } from "@/lib/agents";
import { useMind } from "./MindProvider";

interface Msg {
  role: "user" | "assistant";
  content: string;
  id: number;
}

let msgIdCounter = 0;

const agentTextColors: Record<string, string> = {
  muse: "#b45309",
  grok: "#2563eb",
  dot: "#15803d",
  fo: "#7c3aed",
};

export default function ChatPanel({ agent }: { agent: AgentDef }) {
  const { reportUsage } = useMind();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamingIdx, setStreamingIdx] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const agentTextColor = agentTextColors[agent.id] || agent.color;

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
    const userMsgId = ++msgIdCounter;
    const assistantMsgId = ++msgIdCounter;
    const next: Msg[] = [
      ...messages,
      { role: "user", content: text, id: userMsgId },
      { role: "assistant", content: "", id: assistantMsgId },
    ];
    setMessages(next);
    setStreamingIdx(assistantMsgId);
    reportUsage(agent.id, text.length);
    scrollDown();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: agent.id,
          messages: next.filter((m) => m.content).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, content: acc } : m)));
        scrollDown();
      }
      reportUsage(agent.id, acc.length);
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId ? { ...m, content: "Lost connection to the mind. Try again." } : m
        )
      );
    } finally {
      setBusy(false);
      setStreamingIdx(null);
      scrollDown();
    }
  };

  return (
    <>
      <style>{`
        @keyframes breathing-glow-light {
          0%, 100% { box-shadow: 0 0 8px var(--agent-color), 0 0 3px var(--agent-color); }
          50% { box-shadow: 0 0 14px var(--agent-color), 0 0 6px var(--agent-color); }
        }
        @keyframes shimmer-light {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes fade-settle {
          0% { opacity: 0.7; }
          100% { opacity: 1; }
        }
        @keyframes message-rise {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .breathing-dot-light {
          animation: breathing-glow-light 2s ease-in-out infinite;
        }
        .send-btn-light {
          transition: all 0.2s ease;
        }
        .send-btn-light:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 0 18px var(--agent-color), 0 4px 10px rgba(0,0,0,0.12);
        }
        .streaming-text-light {
          background: linear-gradient(
            90deg,
            #3f3f46 0%,
            #0f0f14 25%,
            #3f3f46 50%,
            #0f0f14 75%,
            #3f3f46 100%
          );
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: shimmer-light 2s linear infinite;
        }
        .message-settled {
          animation: fade-settle 0.3s ease-out forwards;
        }
        .message-rise {
          animation: message-rise 0.3s ease-out forwards;
        }
        .watermark-initial-light {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 12rem;
          font-weight: 900;
          opacity: 0.05;
          pointer-events: none;
          user-select: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .breathing-dot-light,
          .streaming-text-light,
          .message-settled,
          .message-rise {
            animation: none;
          }
          .send-btn-light:hover:not(:disabled) {
            transform: none;
          }
        }
      `}</style>
      <div
        className="flex flex-col rounded-[24px] border bg-white overflow-hidden h-full"
        style={{
          borderColor: "#ececef",
          boxShadow: `0 1px 2px rgba(16,16,24,.04), 0 14px 34px -14px rgba(16,16,24,.16), 0 0 24px ${agent.color}08`,
          "--agent-color": agent.color,
        } as React.CSSProperties}
      >
        <div
          className="relative px-4 py-3 border-b flex items-center gap-3"
          style={{ 
            borderColor: "#ececef",
            background: `linear-gradient(90deg, ${agent.color}14, transparent)` 
          }}
        >
          <div
            className="absolute top-0 left-0 right-0 h-[3px]"
            style={{ background: agent.color }}
          />
          <span
            className="w-3 h-3 rounded-full shrink-0 breathing-dot-light"
            style={{ background: agent.color, "--agent-color": agent.color } as React.CSSProperties}
          />
          <div className="min-w-0">
            <div 
              className="text-lg font-extrabold leading-none tracking-tight" 
              style={{ color: agentTextColor }}
            >
              {agent.name}
            </div>
            <div className="text-[13px] text-[#6b7280] truncate">{agent.tagline}</div>
          </div>
        </div>

        <div ref={boxRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 relative bg-[#f7f7f9]">
          {messages.length === 0 && (
            <>
              <span
                className="watermark-initial-light"
                style={{ color: agent.color }}
              >
                {agent.name.charAt(0)}
              </span>
              <p className="text-base text-[#a1a1aa] leading-relaxed relative z-10">
                Talk to {agent.name}. All four agents read the same mind: what one learns, all know.
              </p>
            </>
          )}
          {messages.map((m) =>
            m.role === "user" ? (
              <div
                key={m.id}
                className="ml-8 rounded-[16px] bg-[#f3f3f6] px-3 py-2 text-base text-[#0f0f14] message-rise"
              >
                {m.content}
              </div>
            ) : (
              <div
                key={m.id}
                className={`mr-4 text-base leading-relaxed message-rise ${
                  streamingIdx === m.id ? "" : "message-settled"
                }`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-2 align-middle"
                  style={{ background: agent.color }}
                />
                <span
                  className={streamingIdx === m.id ? "streaming-text-light" : "text-[#3f3f46]"}
                >
                  {m.content}
                </span>
                {streamingIdx === m.id && <span className="typing-caret" />}
              </div>
            )
          )}
        </div>

        <div className="p-3 border-t flex gap-2 bg-white" style={{ borderColor: "#ececef" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={`Message ${agent.name}…`}
            className="flex-1 bg-[#f3f3f6] border rounded-[14px] px-3 py-2 text-base outline-none text-[#0f0f14] placeholder:text-[#a1a1aa]"
            style={{
              borderColor: "#ececef",
            }}
            onFocus={(e) => {
              e.currentTarget.style.boxShadow = `0 0 0 3px ${agent.color}2e`;
              e.currentTarget.style.borderColor = agent.color + "44";
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = "none";
              e.currentTarget.style.borderColor = "#ececef";
            }}
          />
          <button
            onClick={send}
            disabled={busy}
            className="send-btn-light rounded-xl px-4 text-base font-extrabold text-black disabled:opacity-40"
            style={{
              background: agent.color,
              boxShadow: `0 0 12px ${agent.color}44`,
              "--agent-color": agent.color,
            } as React.CSSProperties}
          >
            →
          </button>
        </div>
      </div>
    </>
  );
}
