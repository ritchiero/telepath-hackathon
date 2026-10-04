"use client";

import { useState } from "react";
import { useMind } from "./MindProvider";
import ConfidenceMeter from "./ConfidenceMeter";

export default function JevBar() {
  const { predict, lastPredict } = useMind();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);

  const go = async () => {
    if (!q.trim() || busy) return;
    setBusy(true);
    try {
      await predict(q.trim());
    } finally {
      setBusy(false);
    }
  };

  const ms = lastPredict ? lastPredict.latencyMs : null;
  const speedTier = ms === null ? null : ms < 10 ? "reflex" : ms < 100 ? "fast" : "thinking";

  return (
    <>
      <style>{`
        @keyframes scanline-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes bolt-glow {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(15,15,20,0.15)); }
          50% { filter: drop-shadow(0 0 12px rgba(15,15,20,0.25)); }
        }
        @keyframes energy-surge {
          0% { background-position: -100% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes latency-pop {
          0% { transform: scale(1); }
          30% { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
        @keyframes acts-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(21, 128, 61, 0.1); }
          50% { box-shadow: 0 0 0 4px rgba(21, 128, 61, 0.15); }
        }
        @keyframes ask-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(180, 83, 9, 0.1); }
          50% { box-shadow: 0 0 0 4px rgba(180, 83, 9, 0.15); }
        }
        @keyframes ellipsis {
          0% { content: '.'; }
          33% { content: '..'; }
          66% { content: '...'; }
        }
        .animate-scanline {
          animation: scanline-shimmer 4s linear infinite;
        }
        .animate-bolt-glow {
          animation: bolt-glow 2.5s ease-in-out infinite;
        }
        .animate-energy-surge {
          animation: energy-surge 1.2s ease-in-out infinite;
        }
        .animate-latency-pop {
          animation: latency-pop 0.4s ease-out;
        }
        .animate-acts-pulse {
          animation: acts-pulse 2s ease-in-out infinite;
        }
        .animate-ask-pulse {
          animation: ask-pulse 2s ease-in-out infinite;
        }
        .busy-ellipsis::after {
          content: '.';
          animation: ellipsis 1s steps(1) infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-scanline,
          .animate-bolt-glow,
          .animate-energy-surge,
          .animate-latency-pop,
          .animate-acts-pulse,
          .animate-ask-pulse {
            animation: none;
          }
          .busy-ellipsis::after {
            content: '...';
            animation: none;
          }
        }
      `}</style>

      <section
        className="relative overflow-hidden rounded-[28px] border bg-white transition-all duration-200"
        style={{
          borderColor: focused ? "rgba(77,141,255,0.3)" : "#ececef",
          boxShadow: focused
            ? "0 1px 2px rgba(16,16,24,.04), 0 14px 34px -14px rgba(16,16,24,.16), 0 0 0 4px rgba(77,141,255,.12)"
            : "0 1px 2px rgba(16,16,24,.04), 0 14px 34px -14px rgba(16,16,24,.16)",
        }}
      >
        {/* subtle scanline shimmer background */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03] animate-scanline"
          style={{
            backgroundImage:
              "linear-gradient(90deg, transparent 0%, rgba(15,15,20,0.3) 25%, rgba(15,15,20,0.5) 50%, rgba(15,15,20,0.3) 75%, transparent 100%)",
            backgroundSize: "200% 100%",
          }}
        />

        <div className="relative flex items-center gap-5 px-6 py-4">
          <div className="flex items-center gap-3 shrink-0">
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="#0f0f14"
              className="animate-bolt-glow"
            >
              <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
            </svg>
            <div>
              <div className="text-xl font-black tracking-widest text-[#0f0f14]">JEV</div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6b7280]">reflex layer</div>
            </div>
          </div>

          {/* Input chamber */}
          <div
            className="flex-1 relative rounded-[16px] transition-all duration-200"
            style={{
              boxShadow: focused
                ? "0 0 0 4px rgba(77,141,255,0.18)"
                : "none",
            }}
          >
            <div
              className="relative rounded-[16px] overflow-hidden border"
              style={{
                background: "#f3f3f6",
                borderColor: focused ? "rgba(77,141,255,0.3)" : "#ececef",
              }}
            >
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && go()}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="Ask jev… e.g. what format does he prefer for reports?"
                className="w-full bg-transparent border-0 px-4 py-3 text-base outline-none placeholder:text-[#a1a1aa] text-[#0f0f14]"
              />
            </div>
          </div>

          <button
            onClick={go}
            disabled={busy}
            className="shrink-0 rounded-full bg-[#0f0f14] px-6 py-3 font-black tracking-widest text-white text-base transition-all duration-150 hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 disabled:opacity-40 disabled:hover:scale-100 disabled:hover:translate-y-0"
            style={{ boxShadow: "0 1px 2px rgba(16,16,24,.08), 0 4px 12px rgba(16,16,24,.12)" }}
          >
            {busy ? <span className="busy-ellipsis">PREDICTING</span> : "PREDICT"}
          </button>

          <div className="shrink-0 text-right min-w-[150px]">
            <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6b7280]">latency</div>
            <div
              key={lastPredict?.at || 0}
              className="tabular font-mono text-6xl font-black text-[#0f0f14] animate-latency-pop"
            >
              {ms === null ? "—" : `${ms < 10 ? ms.toFixed(1) : Math.round(ms)}ms`}
            </div>
            {speedTier && (
              <div
                className="text-[11px] font-bold uppercase tracking-[0.12em] mt-1"
                style={{
                  color:
                    speedTier === "reflex"
                      ? "#15803d"
                      : speedTier === "fast"
                      ? "#b45309"
                      : "#4d8dff",
                }}
              >
                {speedTier}
              </div>
            )}
          </div>
        </div>

        {/* Energy line under bar */}
        <div
          className="h-[2px] w-full"
          style={{
            background: busy
              ? undefined
              : "linear-gradient(90deg, transparent, rgba(15,15,20,0.06) 50%, transparent)",
          }}
        >
          {busy && (
            <div
              className="h-full w-full animate-energy-surge"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, transparent 0%, #fbbf24 20%, #fb7185 40%, #a78bfa 60%, #4d8dff 80%, transparent 100%)",
                backgroundSize: "200% 100%",
              }}
            />
          )}
        </div>

        {lastPredict && (
          <div
            key={lastPredict.at}
            className="rise-in relative border-t px-6 py-3 flex items-center gap-5 bg-white"
            style={{ borderColor: "#ececef" }}
          >
            <span
              className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-black tracking-widest flex items-center gap-2 ${
                lastPredict.act
                  ? "bg-[#f0fbf4] text-[#15803d] animate-acts-pulse"
                  : "bg-[#fffbeb] text-[#b45309] animate-ask-pulse"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: lastPredict.act ? "#4ade80" : "#fbbf24",
                }}
              />
              {lastPredict.act ? "ACTS" : "ASK"}
            </span>
            <p className="flex-1 text-base text-[#3f3f46] truncate">«{lastPredict.intent}»</p>
            <div className="w-56 shrink-0 relative">
              <div
                className="absolute inset-0 rounded-full overflow-hidden h-1.5"
                style={{
                  background: "rgba(15,15,20,0.06)",
                }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300 relative"
                  style={{
                    width: `${Math.round(lastPredict.confidence * 100)}%`,
                    background: "linear-gradient(90deg, #fbbf24, #fb7185 45%, #a78bfa 75%, #4d8dff)",
                  }}
                >
                  {/* White knob at end */}
                  <div
                    className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2"
                    style={{
                      borderColor: "#a78bfa",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                    }}
                  />
                </div>
              </div>
              <div className="opacity-0">
                <ConfidenceMeter value={lastPredict.confidence} color="#0f0f14" height="h-1.5" />
              </div>
            </div>
            <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#a1a1aa] shrink-0">
              via {lastPredict.source === "rpc" ? "pgvector" : "local ranking"}
            </span>
          </div>
        )}
      </section>
    </>
  );
}
