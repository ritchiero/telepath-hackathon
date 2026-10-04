"use client";

import { useState, useEffect } from "react";
import { AGENTS } from "@/lib/agents";
import { useMind } from "./MindProvider";
import ConfidenceMeter from "./ConfidenceMeter";

const agentColor = (id: string | null | undefined) =>
  AGENTS.find((a) => a.id === id)?.color ?? "#94a3b8";
const agentName = (id: string | null | undefined) =>
  AGENTS.find((a) => a.id === id)?.name ?? id ?? "?";

export default function BeliefsPanel() {
  const { beliefs, correct } = useMind();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState<string | null>(null);

  const save = async (id: string) => {
    if (!draft.trim() || saving) return;
    setSaving(true);
    try {
      await correct(id, draft.trim());
      setJustSaved(id);
    } finally {
      setSaving(false);
      setEditing(null);
      setDraft("");
    }
  };

  useEffect(() => {
    if (justSaved) {
      const timer = setTimeout(() => setJustSaved(null), 1200);
      return () => clearTimeout(timer);
    }
  }, [justSaved]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, id: string) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      save(id);
    }
  };

  return (
    <>
      <style>{`
        @keyframes belief-save-flash {
          0% { border-color: #4ade80; box-shadow: 0 0 12px rgba(74, 222, 128, 0.25); }
          100% { border-color: #ececef; box-shadow: none; }
        }
        @keyframes ripple-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes chip-pop {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes editor-expand {
          0% { opacity: 0; max-height: 0; }
          100% { opacity: 1; max-height: 200px; }
        }
        .belief-card-hover:hover {
          border-color: #fbbf2447;
          box-shadow: 0 1px 2px rgba(16,16,24,.04), 0 14px 34px -14px rgba(16,16,24,.16);
        }
        .correct-btn {
          transition: all 0.2s ease;
        }
        .correct-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(251, 191, 36, 0.15);
          background: #fff7ed;
        }
        .belief-just-saved {
          animation: belief-save-flash 1.2s ease-out forwards;
        }
        .ripple-pulse {
          animation: ripple-pulse 0.8s ease-in-out infinite;
        }
        .chip-pop {
          animation: chip-pop 0.3s ease-out forwards;
        }
        .editor-expand {
          animation: editor-expand 0.3s ease-out forwards;
          overflow: hidden;
        }
        .textarea-amber-focus:focus {
          box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.25);
          border-color: #fbbf24;
        }
        @media (prefers-reduced-motion: reduce) {
          .belief-just-saved,
          .ripple-pulse,
          .chip-pop,
          .editor-expand {
            animation: none;
          }
          .correct-btn:hover {
            transform: none;
          }
        }
      `}</style>
      <div className="flex flex-col h-full rounded-[28px] border border-[#ececef] bg-white shadow-[0_1px_2px_rgba(16,16,24,.04),0_14px_34px_-14px_rgba(16,16,24,.16)] overflow-hidden">
        <div className="px-6 py-5 border-b border-[#ececef]">
          <div className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#6b7280]">beliefs</div>
          <div className="text-2xl font-extrabold tracking-[-0.02em] text-[#0f0f14]">What the mind knows</div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-[#f7f7f9]">
          {beliefs.length === 0 && (
            <p className="text-base text-[#6b7280]">The mind is dormant. Feed it beliefs to wake it up.</p>
          )}
          {beliefs.map((b) => (
            <div
              key={b.id}
              className={`rise-in rounded-[20px] border bg-white p-4 transition-all duration-200 belief-card-hover ${
                justSaved === b.id ? "belief-just-saved" : "border-[#ececef]"
              }`}
              style={{ boxShadow: '0 1px 2px rgba(16,16,24,.04), 0 4px 12px -4px rgba(16,16,24,.06)' }}
            >
              <p className="text-[17px] leading-relaxed text-[#0f0f14] mb-3">«{b.content}»</p>
              <ConfidenceMeter value={b.confidence} color={agentColor(b.source_agent)} />
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span
                  className="rounded-full px-2.5 py-0.5 text-[13px] font-bold text-[#3f3f46]"
                  style={{ 
                    border: `1px solid ${agentColor(b.source_agent)}47`, 
                    background: agentColor(b.source_agent) + "1c" 
                  }}
                >
                  {agentName(b.source_agent)}
                </span>
                {b.corroborated_by.map((c, idx) => (
                  <span
                    key={c}
                    className="rounded-full px-2.5 py-0.5 text-[13px] font-bold text-[#3f3f46] border border-[#ececef] bg-white chip-pop"
                    style={{ animationDelay: `${idx * 0.1}s` }}
                  >
                    +{agentName(c)}
                  </span>
                ))}
                <button
                  onClick={() => {
                    setEditing(b.id);
                    setDraft(b.content);
                  }}
                  className="correct-btn ml-auto text-[13px] font-black uppercase tracking-widest text-[#b45309] border border-[#fbbf2447] bg-[#fffbeb] rounded-full px-3 py-1"
                >
                  Correct
                </button>
              </div>
              {editing === b.id && (
                <div className="editor-expand mt-3 space-y-2">
                  <div className="relative">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, b.id)}
                      rows={2}
                      className="textarea-amber-focus w-full bg-white border border-[#ececef] rounded-[14px] px-3 py-2 text-base text-[#0f0f14] outline-none transition-all duration-200 placeholder:text-[#a1a1aa]"
                    />
                    <span className="absolute bottom-2 right-3 text-[11px] text-[#a1a1aa] pointer-events-none">
                      ⌘↵ to save
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => save(b.id)}
                      disabled={saving}
                      className={`rounded-full bg-[#0f0f14] px-4 py-1.5 text-[13px] font-black text-white disabled:opacity-40 transition-all ${
                        saving ? "ripple-pulse" : ""
                      }`}
                    >
                      {saving ? "SENDING RIPPLE…" : "SAVE CORRECTION"}
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="rounded-full border border-[#ececef] bg-white px-4 py-1.5 text-[13px] font-bold text-[#6b7280]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
