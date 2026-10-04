"use client";

import { useMind } from "./MindProvider";
import ConfidenceMeter from "./ConfidenceMeter";

const KIND_META: Record<string, { icon: string; label: string; color: string; darkColor: string }> = {
  correction: { icon: "✏️", label: "correction", color: "#fbbf24", darkColor: "#b45309" },
  contribution: { icon: "➕", label: "contribution", color: "#4ade80", darkColor: "#15803d" },
  prediction: { icon: "⚡", label: "prediction", color: "#4d8dff", darkColor: "#4d8dff" },
  decision: { icon: "🧠", label: "decision", color: "#a78bfa", darkColor: "#7c3aed" },
};

const time = (ts: string) =>
  new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function EventsFeed() {
  const { events } = useMind();
  return (
    <div className="flex flex-col h-full rounded-[24px] border border-[#ececef] bg-white overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(16,16,24,.04), 0 14px 34px -14px rgba(16,16,24,.16)' }}>
      <div className="px-6 py-5 border-b border-[#ececef]">
        <div className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#6b7280]">events</div>
        <div className="text-[22px] font-extrabold tracking-[-0.02em] text-[#0f0f14]">Mind pulse</div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2.5">
        {events.length === 0 && <p className="text-base text-[#6b7280]">No events yet.</p>}
        {events.slice(0, 30).map((e) => {
          const m = KIND_META[e.kind] || KIND_META.decision;
          const note = String((e.payload as Record<string, unknown>).note || e.kind);
          return (
            <div key={e.id} className="rise-in flex items-start gap-3 text-base">
              <span className="mt-0.5" style={{ color: m.color }}>{m.icon}</span>
              <div className="min-w-0 flex-1">
                <span className="text-[12px] uppercase tracking-widest font-black" style={{ color: m.darkColor }}>
                  {m.label}
                </span>
                <p className="text-[#3f3f46] text-base leading-snug truncate">{note}</p>
              </div>
              <span className="tabular font-mono text-[13px] text-[#a1a1aa] shrink-0">{time(e.created_at)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PredictionsLog() {
  const { predictions } = useMind();
  return (
    <div className="flex flex-col h-full rounded-[24px] border border-[#ececef] bg-white overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(16,16,24,.04), 0 14px 34px -14px rgba(16,16,24,.16)' }}>
      <div className="px-6 py-5 border-b border-[#ececef]">
        <div className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#6b7280]">predictions</div>
        <div className="text-[24px] font-extrabold tracking-[-0.02em] text-[#0f0f14]">What jev saw coming</div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {predictions.length === 0 && <p className="text-base text-[#6b7280]">jev hasn't predicted anything yet. Use it above.</p>}
        {predictions.slice(0, 20).map((p) => (
          <div key={p.id} className="rise-in rounded-[16px] bg-[#f7f7f9] p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-mono text-[13px] font-black text-white bg-[#0f0f14] rounded-full px-2.5 py-0.5">jev</span>
              <span className="tabular font-mono text-[13px] text-[#a1a1aa]">{time(p.created_at)}</span>
              {p.confidence > 0.8 && (
                <span className="ml-auto text-[12px] font-black tracking-widest text-[#15803d]">ACTED</span>
              )}
            </div>
            <p className="text-base text-[#0f0f14] leading-snug mb-2 truncate">«{p.predicted_intent}»</p>
            <ConfidenceMeter value={p.confidence} color="gradient" height="h-1.5" />
          </div>
        ))}
      </div>
    </div>
  );
}
