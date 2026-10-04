"use client";

import { useEffect, useState, useMemo } from "react";
import MindCanvas from "./MindCanvas";
import BeliefsPanel from "./BeliefsPanel";
import ChatPanel from "./ChatPanel";
import JevBar from "./JevBar";
import FuelGauges from "./FuelGauges";
import ContributePanel from "./ContributePanel";
import { EventsFeed, PredictionsLog } from "./ActivityPanels";
import { AGENTS } from "@/lib/agents";
import { useMind } from "./MindProvider";

const DEMO_STEPS = [
  "1 · Ask Grok something",
  "2 · Correct it live → watch the ripple",
  "3 · Ask Muse → it already knows",
  "4 · jev predicts → ACTS",
];

function useReveal(staggerMs = 90, totalSections = 6) {
  const [revealed, setRevealed] = useState<boolean[]>(Array(totalSections).fill(false));

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setRevealed(Array(totalSections).fill(true));
      return;
    }

    const timeouts: NodeJS.Timeout[] = [];
    for (let i = 0; i < totalSections; i++) {
      timeouts.push(
        setTimeout(() => {
          setRevealed((prev) => {
            const next = [...prev];
            next[i] = true;
            return next;
          });
        }, i * staggerMs)
      );
    }

    return () => timeouts.forEach(clearTimeout);
  }, [staggerMs, totalSections]);

  return revealed;
}

export default function StageView() {
  const { beliefs, events, lastPredict, status } = useMind();
  const revealed = useReveal(90, 6);

  const hasRecentCorrection = useMemo(() => {
    if (!events || events.length === 0) return false;
    const latest = events[events.length - 1];
    if (latest?.kind !== "correction") return false;
    const ts = latest.created_at;
    if (!ts) return false;
    const age = Date.now() - new Date(ts).getTime();
    return age < 2000;
  }, [events]);

  const revealClass = (index: number) =>
    revealed[index] ? "telepath-revealed" : "telepath-hidden";

  return (
    <>
      <style>{`
        @keyframes sheen-sweep {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }

        @keyframes pulse-dot {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }

        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 20px 4px rgba(251, 191, 36, 0.08), 0 0 40px 8px rgba(74, 222, 128, 0.06); }
          50% { box-shadow: 0 0 30px 8px rgba(251, 191, 36, 0.18), 0 0 60px 16px rgba(74, 222, 128, 0.12); }
        }

        @keyframes rise-in {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .telepath-hidden {
          opacity: 0;
          transform: translateY(16px);
        }

        .telepath-revealed {
          animation: rise-in 0.5s ease-out forwards;
        }

        .telepath-sheen {
          background: linear-gradient(
            90deg,
            #0f0f14 0%,
            #0f0f14 40%,
            #6b7280 50%,
            #0f0f14 60%,
            #0f0f14 100%
          );
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: sheen-sweep 7s ease-in-out infinite;
        }

        .telepath-glow-active {
          animation: glow-pulse 0.8s ease-in-out infinite;
        }

        .telepath-pulse-dot {
          animation: pulse-dot 2s ease-in-out infinite;
        }

        .drafta-hero-dots {
          background-image: radial-gradient(circle, #d1d5db 1px, transparent 1px);
          background-size: 24px 24px;
        }

        @media (prefers-reduced-motion: reduce) {
          .telepath-sheen {
            animation: none;
            background: #0f0f14;
            -webkit-text-fill-color: #0f0f14;
          }

          .telepath-hidden,
          .telepath-revealed {
            opacity: 1;
            transform: none;
            animation: none;
          }

          .telepath-glow-active {
            animation: none;
            box-shadow: 0 0 24px 6px rgba(251, 191, 36, 0.12), 0 0 48px 12px rgba(74, 222, 128, 0.08);
          }

          .telepath-pulse-dot {
            animation: none;
            opacity: 0.7;
          }
        }
      `}</style>
      <style>{`
        html:has(.tp-stage), body:has(.tp-stage) { background: #f7f7f9; color-scheme: light; }
        html:has(.tp-stage) ::-webkit-scrollbar-thumb { background: #d6d6dc; }
      `}</style>

      <div className="tp-stage min-h-screen bg-[#f7f7f9]">
        <div className="px-8 pb-20 pt-8 max-w-[1720px] mx-auto space-y-8">
          {/* header */}
          <header className={`flex items-start justify-between gap-6 flex-wrap drafta-hero-dots rounded-[28px] p-8 -mx-2 ${revealClass(0)}`}>
            <div>
              <div className="flex items-center gap-4 relative">
                <div className="relative">
                  <div
                    className="absolute inset-0 rounded-full blur-xl opacity-30"
                    style={{
                      background: "radial-gradient(circle, rgba(15,15,20,0.2) 0%, transparent 70%)",
                      transform: "scale(2)",
                    }}
                  />
                  <div className="relative z-10 w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-[0_1px_2px_rgba(16,16,24,.04),0_4px_12px_-4px_rgba(16,16,24,.06)]">
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="#0f0f14"
                    >
                      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
                    </svg>
                  </div>
                </div>
                <h1 className="text-7xl xl:text-8xl font-extrabold tracking-[-0.045em] telepath-sheen">
                  TELEPATH
                </h1>
              </div>
              <p className="text-xl leading-relaxed text-[#3f3f46] mt-4 max-w-2xl">
                One shared mind for <span className="font-bold text-[#b45309]">Muse</span>,{" "}
                <span className="font-bold text-[#4d8dff]">Grok</span>,{" "}
                <span className="font-bold text-[#16a34a]">Dot</span> and{" "}
                <span className="font-bold text-[#7c3aed]">Fo</span> — what one agent learns, all four know.
              </p>
            </div>
            <div className="flex flex-col items-end gap-3 max-w-[640px]">
              <span
                className={`rounded-full px-4 py-1.5 text-[13px] font-bold tracking-[0.12em] border bg-white flex items-center gap-2 ${
                  status?.mode === "supabase"
                    ? "text-[#0f0f14] border-[#ececef]"
                    : "text-[#0f0f14] border-[#ececef]"
                }`}
                style={{ boxShadow: "0 1px 2px rgba(16,16,24,.04), 0 4px 12px -4px rgba(16,16,24,.06)" }}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    status?.mode === "supabase" ? "bg-[#4ade80]" : "bg-[#fbbf24]"
                  }`}
                />
                {status
                  ? status.mode === "supabase"
                    ? "SUPABASE LIVE"
                    : "LOCAL MIND · DEMO"
                  : "CONNECTING…"}
              </span>
              <div className="flex gap-2 flex-wrap justify-end">
                {DEMO_STEPS.map((s, idx) => {
                  const isStep2 = idx === 1;
                  return (
                    <span
                      key={s}
                      className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold flex items-center gap-2 ${
                        isStep2
                          ? "border-[#fbbf24]/40 bg-[#fef3c7] text-[#92400e]"
                          : "border-[#ececef] bg-white text-[#3f3f46]"
                      }`}
                      style={{ boxShadow: isStep2 ? "0 0 12px 2px rgba(251,191,36,0.15)" : "0 1px 2px rgba(16,16,24,.04)" }}
                    >
                      {s}
                      {isStep2 && (
                        <span className="text-[10px] font-bold tracking-wide text-[#b45309] uppercase">
                          ★ live moment
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          </header>

          {/* jev reflex layer */}
          <section className={revealClass(1)}>
            <div className="mb-2">
              <span className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#6b7280]">
                reflex layer
              </span>
            </div>
            <JevBar />
          </section>

          {/* the living mind + beliefs */}
          <section className={`grid grid-cols-12 gap-7 ${revealClass(2)}`}>
            <div
              className={`col-span-12 xl:col-span-8 rounded-[28px] border border-[#ececef] bg-white overflow-hidden h-[560px] relative transition-shadow duration-300 ${
                hasRecentCorrection ? "telepath-glow-active" : ""
              }`}
              style={{ boxShadow: "0 1px 2px rgba(16,16,24,.04), 0 14px 34px -14px rgba(16,16,24,.16)" }}
            >
              <MindCanvas beliefs={beliefs} events={events} lastPredict={lastPredict} />
            </div>
            <div className="col-span-12 xl:col-span-4 h-[560px]">
              <BeliefsPanel />
            </div>
          </section>

          {/* the four agents */}
          <section className={revealClass(3)}>
            <div
              className="h-[2px] mb-5 rounded-full"
              style={{
                background: "linear-gradient(90deg, #fbbf24 0%, #4d8dff 33%, #4ade80 66%, #a78bfa 100%)",
                opacity: 0.6,
              }}
            />
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#6b7280] mb-3">
              four agents · one mind
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-7 h-auto xl:h-[430px]">
              {AGENTS.map((a) => (
                <div key={a.id} className="h-[380px] xl:h-full">
                  <ChatPanel agent={a} />
                </div>
              ))}
            </div>
          </section>

          {/* pulse, predictions, contribution, fuel */}
          <section className={`grid grid-cols-12 gap-7 ${revealClass(4)}`}>
            <div className="col-span-12 md:col-span-6 xl:col-span-3 h-[380px]">
              <EventsFeed />
            </div>
            <div className="col-span-12 md:col-span-6 xl:col-span-3 h-[380px]">
              <PredictionsLog />
            </div>
            <div className="col-span-12 md:col-span-6 xl:col-span-3 h-[380px]">
              <ContributePanel />
            </div>
            <div className="col-span-12 md:col-span-6 xl:col-span-3 h-[380px]">
              <FuelGauges />
            </div>
          </section>

          <footer className={`text-center text-base text-[#6b7280] pt-8 pb-2 ${revealClass(5)}`}>
            <span className="inline-flex items-center gap-2">
              Telepath · Supabase Select 2026 Hackathon ·{" "}
              <span
                className="inline-block w-2 h-2 rounded-full bg-[#fbbf24] telepath-pulse-dot"
                aria-hidden="true"
              />
              corrections travel at the speed of light
            </span>
          </footer>
        </div>
      </div>
    </>
  );
}
