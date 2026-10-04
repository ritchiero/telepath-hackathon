"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  Belief,
  ContributeItem,
  MindEvent,
  MindStatus,
  PredictResult,
  Prediction,
} from "@/lib/types";

export interface PredictPing extends PredictResult {
  at: number;
}

interface MindCtx {
  beliefs: Belief[];
  events: MindEvent[];
  predictions: Prediction[];
  status: MindStatus | null;
  fuel: Record<string, number>;
  lastPredict: PredictPing | null;
  contribute: (
    items: ContributeItem[],
    agent: string
  ) => Promise<{ inserted: number; corroborated: number }>;
  correct: (id: string, correction: string) => Promise<void>;
  predict: (q: string) => Promise<PredictResult>;
  reportUsage: (agent: string, chars: number) => void;
  refresh: () => void;
}

const Ctx = createContext<MindCtx | null>(null);
export const useMind = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMind fuera del provider");
  return c;
};

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(url);
  return r.json();
}

export default function MindProvider({ children }: { children: React.ReactNode }) {
  const [beliefs, setBeliefs] = useState<Belief[]>([]);
  const [events, setEvents] = useState<MindEvent[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [status, setStatus] = useState<MindStatus | null>(null);
  const [fuel, setFuel] = useState<Record<string, number>>({});
  const [lastPredict, setLastPredict] = useState<PredictPing | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [b, e, p, s] = await Promise.all([
        getJSON<Belief[]>("/api/beliefs"),
        getJSON<MindEvent[]>("/api/events"),
        getJSON<Prediction[]>("/api/predictions"),
        getJSON<MindStatus>("/api/mind/status"),
      ]);
      setBeliefs(b);
      setEvents(e);
      setPredictions(p);
      setStatus(s);
    } catch {
      // la mente local siempre responde; si falla, el próximo poll lo intenta
    }
  }, []);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, 2500); // polling: la demo siempre se ve en vivo
    // Realtime best-effort: si las keys y RLS lo permiten, los cambios llegan al instante.
    let cleanup = () => {};
    if (process.env.HACKATHON_DISABLED_NEXT_PUBLIC_SUPABASE_URL && process.env.HACKATHON_DISABLED_NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      (async () => {
        try {
          const { createClient } = await import("@supabase/supabase-js");
          const c = createClient(
            process.env.HACKATHON_DISABLED_NEXT_PUBLIC_SUPABASE_URL!,
            process.env.HACKATHON_DISABLED_NEXT_PUBLIC_SUPABASE_ANON_KEY!
          );
          const ch = c
            .channel("telepath-mind")
            .on("postgres_changes", { event: "*", schema: "public" }, () => refresh())
            .subscribe();
          cleanup = () => {
            c.removeChannel(ch);
          };
        } catch {
          /* polling cubre */
        }
      })();
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
      cleanup();
    };
  }, [refresh]);

  const contribute = useCallback(async (items: ContributeItem[], agent: string) => {
    const r = await fetch("/api/beliefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, agent }),
    });
    if (!r.ok) throw new Error("contribute falló");
    const data = await r.json();
    setBeliefs(data.beliefs);
    refresh();
    return { inserted: data.inserted, corroborated: data.corroborated };
  }, [refresh]);

  const correct = useCallback(
    async (id: string, correction: string) => {
      // optimista: el medidor se mueve al instante, el poll confirma
      setBeliefs((prev) =>
        prev.map((b) => (b.id === id ? { ...b, content: correction, confidence: 0.95 } : b))
      );
      await fetch(`/api/beliefs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correction, by: "usuario" }),
      });
      refresh();
    },
    [refresh]
  );

  const predict = useCallback(async (q: string) => {
    const r = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
    });
    if (!r.ok) throw new Error("predict falló");
    const data = (await r.json()) as PredictResult;
    setLastPredict({ ...data, at: Date.now() });
    refresh();
    return data;
  }, [refresh]);

  const reportUsage = useCallback((agent: string, chars: number) => {
    setFuel((f) => ({ ...f, [agent]: (f[agent] || 0) + chars }));
  }, []);

  return (
    <Ctx.Provider
      value={{
        beliefs,
        events,
        predictions,
        status,
        fuel,
        lastPredict,
        contribute,
        correct,
        predict,
        reportUsage,
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
