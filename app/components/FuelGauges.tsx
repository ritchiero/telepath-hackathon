"use client";

import { AGENTS } from "@/lib/agents";
import { useMind } from "./MindProvider";

// Capacidad estimada de contexto por agente (en caracteres ≈ 4 chars/token).
const CAPACITY = 200_000;

// Darker agent text colors for light backgrounds
const AGENT_TEXT_COLORS: Record<string, string> = {
  muse: "#b45309",
  grok: "#2563eb",
  dot: "#15803d",
  fo: "#7c3aed",
};

export default function FuelGauges() {
  const { fuel } = useMind();
  return (
    <div className="flex flex-col h-full rounded-[24px] border border-[#ececef] bg-white overflow-hidden" style={{ boxShadow: "0 1px 2px rgba(16,16,24,.04), 0 14px 34px -14px rgba(16,16,24,.16)" }}>
      <div className="px-6 py-5 border-b border-[#ececef]">
        <div className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#6b7280]">fuel</div>
        <div className="text-2xl font-extrabold tracking-[-0.02em] text-[#0f0f14]">Context remaining</div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {AGENTS.map((a) => {
          const used = fuel[a.id] || 0;
          const pct = Math.max(0, Math.min(100, Math.round((1 - used / CAPACITY) * 100)));
          const low = pct < 20;
          const textColor = AGENT_TEXT_COLORS[a.id] || a.color;
          return (
            <div key={a.id}>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-base font-bold" style={{ color: textColor }}>{a.name}</span>
                <span className={`tabular-nums text-2xl font-black ${low ? "text-[#dc2626]" : "text-[#0f0f14]"}`}>
                  {pct}%
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-[#ececef] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${pct}%`,
                    background: low
                      ? "linear-gradient(90deg, #fca5a5, #dc2626)"
                      : `linear-gradient(90deg, ${a.color}88, ${a.color})`,
                    boxShadow: low 
                      ? "0 0 8px rgba(220, 38, 38, 0.3)" 
                      : `0 0 8px ${a.color}40`,
                  }}
                />
              </div>
              {low && (
                <p className="text-[13px] text-[#dc2626] mt-2 font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-[#fff2f2] inline-block">
                  handoff suggested → another agent takes over
                </p>
              )}
            </div>
          );
        })}
        <p className="text-[13px] text-[#a1a1aa] leading-relaxed">
          Estimated from characters sent and received this session.
        </p>
      </div>
    </div>
  );
}
