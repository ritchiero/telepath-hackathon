"use client";

import { useState } from "react";
import { AGENTS } from "@/lib/agents";
import { useMind } from "./MindProvider";
import type { ContributeItem } from "@/lib/types";

export default function ContributePanel() {
  const { contribute } = useMind();
  const [agent, setAgent] = useState("muse");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const parse = (raw: string): ContributeItem[] => {
    const t = raw.trim();
    if (!t) return [];
    try {
      const j = JSON.parse(t);
      const arr = Array.isArray(j) ? j : [j];
      return arr
        .map((x) =>
          typeof x === "string"
            ? { content: x }
            : { content: String(x.content || ""), confidence: Number(x.confidence) || undefined }
        )
        .filter((x) => x.content.trim());
    } catch {
      return t
        .split("\n")
        .map((l) => l.trim().replace(/^[-•*]\s*/, ""))
        .filter(Boolean)
        .map((content) => ({ content }));
    }
  };

  const go = async () => {
    const items = parse(text);
    if (items.length === 0 || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await contribute(items, agent);
      setResult(`✓ ${r.inserted} new · ${r.corroborated} corroborated — watch them light up the network`);
      setText("");
    } catch {
      setResult("Contribution failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const currentAgent = AGENTS.find((a) => a.id === agent);
  const color = currentAgent?.color || "#0f0f14";

  return (
    <>
      <style>{`
        @keyframes contributeRiseIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .contribute-rise-in {
          animation: contributeRiseIn 0.4s ease-out forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .contribute-rise-in {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
      <div className="flex flex-col h-full rounded-[24px] border border-[#ececef] bg-white overflow-hidden"
        style={{
          boxShadow: '0 1px 2px rgba(16,16,24,0.04), 0 14px 34px -14px rgba(16,16,24,0.16)'
        }}
      >
        <div className="px-6 py-5 border-b border-[#ececef]">
          <div className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#6b7280]">contribute</div>
          <div className="text-2xl font-extrabold tracking-[-0.02em] text-[#0f0f14]">Pour into the mind</div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="space-y-2">
            <label className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6b7280]">Contributing agent</label>
            <div className="flex gap-2 flex-wrap">
              {AGENTS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAgent(a.id)}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold border transition-all duration-200 ${
                    agent === a.id ? "text-black" : "text-[#6b7280] border-[#ececef] bg-white hover:border-[#d1d5db]"
                  }`}
                  style={
                    agent === a.id
                      ? { 
                          background: a.color, 
                          borderColor: a.color, 
                          boxShadow: `0 2px 8px ${a.color}40`
                        }
                      : {}
                  }
                >
                  {a.name}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={'JSON or one belief per line:\nPrefers concise answers\nNever touch prod without his ok'}
            className="w-full bg-[#f3f3f6] border border-[#ececef] rounded-[16px] focus:ring-2 focus:ring-[#4d8dff]/30 px-4 py-3 text-base text-[#0f0f14] outline-none focus:border-[#4d8dff]/50 placeholder:text-[#a1a1aa] font-mono transition-all duration-200"
          />
          <button
            onClick={go}
            disabled={busy}
            className="w-full rounded-full py-3.5 text-base font-bold tracking-wide text-white bg-[#0f0f14] disabled:opacity-40 transition-all duration-200 hover:bg-[#1a1a24] active:scale-[0.98]"
            style={{
              boxShadow: '0 1px 2px rgba(16,16,24,0.04), 0 4px 12px -4px rgba(16,16,24,0.2)'
            }}
          >
            {busy ? "POURING…" : "FEED THE MIND"}
          </button>
          {result && <p className="contribute-rise-in text-base font-medium text-[#15803d]">{result}</p>}
        </div>
      </div>
    </>
  );
}
