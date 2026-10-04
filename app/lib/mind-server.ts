// Motor de la mente (solo servidor).
//
// Estrategia de datos, honesta y a prueba de demo:
// 1. La mente vive en /tmp/telepath-public-fictional-v1.json, sembrada desde
//    ../seed-muse-beliefs.json → la demo NUNCA muestra una mente vacía.
//    (Archivo y no memoria: en Next.js cada ruta puede tener su propia
//    instancia del módulo; el archivo es la única verdad compartida.)
// 2. Si hay Supabase configurado y la tabla beliefs tiene filas, se leen de
//    ahí en el primer arranque (modo espejo). Si no, store local.
// 3. Las escrituras a Supabase están ACTIVADAS para el demo user:
//    contribute/correct/delete escriben a la tabla beliefs con el user_id
//    del demo (f559a52f…). Así sobreviven deploys y arranques en frío.
// 4. El cliente usa polling cada 2.5s contra /api/* (siempre funciona) y
//    además se suscribe a Supabase Realtime cuando las keys lo permiten.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, renameSync, existsSync } from "fs";
import { join } from "path";
import { jaccard } from "./similarity";
import type {
  Belief,
  ContributeItem,
  MindEvent,
  MindEventKind,
  MindStatus,
  PredictResult,
  Prediction,
} from "./types";

const STATE_FILE = "/tmp/telepath-public-fictional-v1.json";
const SEED_FILE = join(process.cwd(), "seed-muse-beliefs.json");

const SUPABASE_URL = process.env.HACKATHON_DISABLED_NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.HACKATHON_DISABLED_SUPABASE_SERVICE_ROLE_KEY || process.env.HACKATHON_DISABLED_NEXT_PUBLIC_SUPABASE_ANON_KEY;

let sb: SupabaseClient | null = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  sb = createClient(SUPABASE_URL, SUPABASE_KEY);
}

interface State {
  beliefs: Belief[];
  events: MindEvent[];
  predictions: Prediction[];
  readMode: "supabase" | "local";
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const now = () => new Date().toISOString();

function seedState(): State {
  const beliefs: Belief[] = [];
  try {
    const arr = JSON.parse(readFileSync(SEED_FILE, "utf8")) as Array<{
      content: string;
      confidence?: number;
      source_agent?: string;
    }>;
    for (const b of arr) {
      if (!b.content) continue;
      beliefs.push({
        id: uid(),
        content: String(b.content),
        confidence: Math.min(0.99, Math.max(0.05, Number(b.confidence) || 0.5)),
        source_agent: b.source_agent || "muse",
        corroborated_by: [],
        created_at: now(),
      });
    }
  } catch {
    // sin seed: la mente nace vacía (estado "latente" en el canvas)
  }
  const events: MindEvent[] = [];
  if (beliefs.length > 0) {
    events.unshift({
      id: uid(),
      kind: "contribution",
      payload: {
        agent: "muse",
        inserted: beliefs.length,
        note: "initial mind dump",
      },
      created_at: now(),
    });
  }
  return { beliefs, events, predictions: [], readMode: "local" };
}

function saveState(s: State) {
  try {
    const tmp = STATE_FILE + ".tmp";
    writeFileSync(tmp, JSON.stringify(s));
    renameSync(tmp, STATE_FILE);
  } catch {
    // /tmp no escribible: se sigue con estado en memoria de esta instancia
  }
}

// Escrituras a Supabase: el demo user es el dueño de la mente.
// Sin esto, todo lo que la API escribe vive solo en el /tmp de la instancia
// y se pierde en cada deploy o arranque en frío de Vercel.
const DEMO_USER_ID =
  process.env.HACKATHON_DISABLED_TELEPATH_DEMO_USER_ID || "00000000-0000-4000-8000-000000000001";

async function sbInsertBelief(b: Belief): Promise<void> {
  if (!sb) return;
  try {
    await sb.from("beliefs").insert({
      id: b.id,
      user_id: DEMO_USER_ID,
      content: b.content,
      confidence: b.confidence,
      source_agent: b.source_agent,
      meta: { corroborated_by: b.corroborated_by || [] },
    });
  } catch {
    /* best effort: el estado local ya se guardó */
  }
}

async function sbUpdateBelief(b: Belief): Promise<void> {
  if (!sb) return;
  try {
    await sb
      .from("beliefs")
      .update({
        content: b.content,
        confidence: b.confidence,
        meta: { corroborated_by: b.corroborated_by || [] },
      })
      .eq("id", b.id);
  } catch {
    /* best effort */
  }
}

async function sbDeleteBelief(id: string): Promise<void> {
  if (!sb) return;
  try {
    await sb.from("beliefs").delete().eq("id", id);
  } catch {
    /* best effort */
  }
}

async function sbInsertEvent(kind: string, payload: Record<string, unknown>): Promise<void> {
  if (!sb) return;
  try {
    await sb.from("events").insert({ user_id: DEMO_USER_ID, kind, payload });
  } catch {
    /* best effort */
  }
}

async function probeSupabase(): Promise<{
  beliefs: Belief[];
  events: MindEvent[];
  predictions: Prediction[];
} | null> {
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("beliefs")
      .select("id, content, confidence, source_agent, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error || !data || data.length === 0) return null;
    const beliefs: Belief[] = data.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      content: String(r.content),
      confidence: Number(r.confidence) || 0.5,
      source_agent: (r.source_agent as string) || null,
      corroborated_by: [],
      created_at: String(r.created_at || now()),
    }));
    let events: MindEvent[] = [];
    let predictions: Prediction[] = [];
    try {
      const { data: ed } = await sb
        .from("events")
        .select("id, kind, payload, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (ed)
        events = ed.map((r: Record<string, unknown>) => ({
          id: String(r.id),
          kind: r.kind as MindEventKind,
          payload: (r.payload as Record<string, unknown>) || {},
          created_at: String(r.created_at || now()),
        }));
    } catch { /* noop */ }
    try {
      const { data: pd } = await sb
        .from("predictions")
        .select("id, agent, predicted_intent, confidence, correct, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (pd)
        predictions = pd.map((r: Record<string, unknown>) => ({
          id: String(r.id),
          agent: String(r.agent),
          predicted_intent: String(r.predicted_intent),
          confidence: Number(r.confidence) || 0,
          correct: (r.correct as boolean) ?? null,
          created_at: String(r.created_at || now()),
        }));
    } catch { /* noop */ }
    return { beliefs, events, predictions };
  } catch {
    return null;
  }
}

async function loadState(): Promise<State> {
  let s: State | null = null;
  try {
    if (existsSync(STATE_FILE)) {
      const parsed = JSON.parse(readFileSync(STATE_FILE, "utf8")) as State;
      if (parsed && Array.isArray(parsed.beliefs)) s = parsed;
    }
  } catch { /* regenerar */ }
  if (!s) s = seedState();
  // En modo Supabase, refrescar siempre desde la base (no usar /tmp viejo).
  // Esto evita lecturas inconsistentes entre instancias de Vercel.
  if (sb) {
    try {
      const remote = await probeSupabase();
      if (remote && remote.beliefs.length > 0) {
        s.beliefs = remote.beliefs;
        s.events = remote.events;
        s.predictions = remote.predictions;
        s.readMode = "supabase";
        saveState(s);
      }
    } catch { /* usar estado local si Supabase falla */ }
  } else if (!existsSync(STATE_FILE)) {
    const remote = await probeSupabase();
    if (remote) {
      s.beliefs = remote.beliefs;
      s.events = remote.events;
      s.predictions = remote.predictions;
      s.readMode = "supabase";
    }
    saveState(s);
  }
  return s;
}

function addEvent(s: State, kind: MindEventKind, payload: Record<string, unknown>) {
  s.events.unshift({ id: uid(), kind, payload, created_at: now() });
  s.events = s.events.slice(0, 200);
}

// ---------- API pública del motor ----------
export async function getStatus(): Promise<MindStatus> {
  const s = await loadState();
  return {
    mode: s.readMode,
    detail:
      s.readMode === "supabase"
        ? "Leyendo de Supabase en vivo"
        : sb
          ? "Supabase sin datos o sin acceso → mente local (demo)"
          : "Sin Supabase configurado → mente local (demo)",
    realtime: !!process.env.HACKATHON_DISABLED_NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

export async function getBeliefs(): Promise<Belief[]> {
  const s = await loadState();
  return [...s.beliefs].sort((a, b) => b.confidence - a.confidence);
}

export async function getEvents(): Promise<MindEvent[]> {
  const s = await loadState();
  return s.events.slice(0, 100);
}

export async function getPredictions(): Promise<Prediction[]> {
  const s = await loadState();
  return s.predictions.slice(0, 100);
}

export async function topBeliefs(query: string, n: number): Promise<Belief[]> {
  const s = await loadState();
  const all = [...s.beliefs].sort((a, b) => b.confidence - a.confidence);
  if (!query.trim()) return all.slice(0, n);
  return all
    .map((b) => ({ b, s: jaccard(query, b.content) * 0.7 + b.confidence * 0.3 }))
    .sort((x, y) => y.s - x.s)
    .slice(0, n)
    .map((x) => x.b);
}

export async function contribute(
  items: ContributeItem[],
  agent: string
): Promise<{ inserted: number; corroborated: number }> {
  const s = await loadState();
  let inserted = 0;
  let corroborated = 0;
  for (const item of items) {
    const content = item.content.trim();
    if (!content) continue;
    let best: Belief | null = null;
    let bestSim = 0;
    for (const b of s.beliefs) {
      const sim = jaccard(content, b.content);
      if (sim > bestSim) {
        bestSim = sim;
        best = b;
      }
    }
    if (best && bestSim >= 0.85 && best.source_agent === agent) continue; // duplicado
    if (best && bestSim >= 0.38 && best.source_agent !== agent) {
      // Corroboración: otro agente ya lo sabía → sube la confianza
      if (!best.corroborated_by.includes(agent)) {
        best.corroborated_by.push(agent);
        best.confidence = Math.min(0.99, best.confidence + 0.12);
        corroborated++;
        addEvent(s, "contribution", {
          agent,
          corroborated: true,
          belief_id: best.id,
          note: `${agent} corroborated: "${best.content.slice(0, 60)}…"`,
        });
        await sbUpdateBelief(best);
      }
      continue;
    }
    const nb: Belief = {
      id: uid(),
      content,
      confidence: Math.min(0.99, Math.max(0.05, item.confidence ?? 0.5)),
      source_agent: agent,
      corroborated_by: [],
      created_at: now(),
    };
    s.beliefs.push(nb);
    await sbInsertBelief(nb);
    inserted++;
  }
  if (inserted > 0 || corroborated > 0) {
    addEvent(s, "contribution", {
      agent,
      inserted,
      corroborated,
      note: `${agent} contributed ${inserted} new beliefs and corroborated ${corroborated}`,
    });
  }
  saveState(s);
  return { inserted, corroborated };
}

export async function correctBelief(
  id: string,
  correction: string,
  by = "usuario"
): Promise<Belief | null> {
  const s = await loadState();
  const b = s.beliefs.find((x) => x.id === id);
  if (!b) return null;
  const before = b.content;
  b.content = correction.trim() || before;
  b.confidence = 0.95; // el usuario es ground truth
  addEvent(s, "correction", {
    belief_id: id,
    by,
    before,
    after: b.content,
    note: `Correction by ${by}: confidence → 95%`,
  });
  saveState(s);
  await sbUpdateBelief(b);
  await sbInsertEvent("correction", {
    belief_id: id,
    by,
    before,
    after: b.content,
    note: `Correction by ${by}: confidence → 95%`,
  });
  return b;
}

// Borra una creencia (el usuario es dueño de su mente). Registra el evento.
export async function deleteBelief(id: string, by = "usuario"): Promise<boolean> {
  const s = await loadState();
  const i = s.beliefs.findIndex((x) => x.id === id);
  if (i < 0) return false;
  const [b] = s.beliefs.splice(i, 1);
  addEvent(s, "deletion", {
    belief_id: id,
    by,
    content: b.content.slice(0, 120),
    note: `Belief deleted by ${by}`,
  });
  saveState(s);
  await sbDeleteBelief(id);
  return true;
}

// Resetea la mente al seed inicial (para ensayos y pre-demo en escenario).
export async function resetMind(): Promise<{ beliefs: number }> {
  const s = seedState();
  addEvent(s, "reset", { note: "Mind reset to initial seed", by: "demo" });
  saveState(s);
  return { beliefs: s.beliefs.length };
}

// jev: predict. Si Astra entrega el RPC predict_match, se usa; si no,
// ranking local por keywords con latencia real medida.
export async function predict(query: string): Promise<PredictResult> {
  const s = await loadState();
  const t0 = performance.now();

  if (s.readMode === "supabase" && sb) {
    try {
      const { data, error } = await sb.rpc("predict_match", { p_query: query });
      if (!error && data && (data as Array<Record<string, unknown>>).length > 0) {
        const r = (data as Array<Record<string, unknown>>)[0];
        const latencyMs = performance.now() - t0;
        const confidence = Math.min(0.99, Number(r.confidence) || 0.5);
        const res: PredictResult = {
          intent: String(r.content),
          confidence,
          latencyMs,
          beliefId: String(r.id),
          source: "rpc",
          act: confidence > 0.8,
        };
        logPrediction(s, "jev", res);
        saveState(s);
        return res;
      }
    } catch {
      // cae al ranking local
    }
  }

  let best: Belief | null = null;
  let bestScore = 0;
  for (const b of s.beliefs) {
    const sim = jaccard(query, b.content);
    const score = b.confidence * (0.35 + 0.65 * sim);
    if (score > bestScore) {
      bestScore = score;
      best = b;
    }
  }
  const latencyMs = performance.now() - t0;

  // jev con cerebro: si la señal local es dudosa (15%-80%) y hay key de
  // OpenRouter, un modelo rápido desempata. La latencia se mide honesta.
  const OR_KEY = process.env.HACKATHON_DISABLED_OPENROUTER_API_KEY;
  if (OR_KEY && best && bestScore > 0.15 && bestScore <= 0.8) {
    try {
      const cands = s.beliefs
        .map((b) => ({ sim: jaccard(query, b.content), b }))
        .sort((x, y) => y.sim - x.sim)
        .slice(0, 5);
      const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OR_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://telepath.demo",
          "X-Title": "Telepath jev",
        },
        body: JSON.stringify({
          model: process.env.JEV_MODEL || "openai/gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                'Eres jev, el predictor de Telepath. Dada la petición del usuario y las creencias candidatas de su mente compartida, devuelve SOLO JSON: {"intent": "...", "confidence": 0.0-1.0}. "intent" = la creencia que mejor explica lo que quiere, o una frase nueva si ninguna calza. Nada más que el JSON.',
            },
            {
              role: "user",
              content:
                `Petición: "${query}"\nCandidatas:\n` +
                cands
                  .map((c, i) => `${i + 1}. (${Math.round(c.b.confidence * 100)}%) ${c.b.content}`)
                  .join("\n"),
            },
          ],
          max_tokens: 120,
        }),
      });
      if (orRes.ok) {
        const jd = (await orRes.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const txt = jd.choices?.[0]?.message?.content || "";
        const m = txt.match(/\{[\s\S]*\}/);
        if (m) {
          const parsed = JSON.parse(m[0]) as { intent?: unknown; confidence?: unknown };
          const orLatency = performance.now() - t0;
          const orConf = Math.min(0.99, Math.max(0.05, Number(parsed.confidence) || bestScore));
          const res: PredictResult = {
            intent: String(parsed.intent || best.content).slice(0, 200),
            confidence: orConf,
            latencyMs: orLatency,
            beliefId: best.id,
            source: "openrouter",
            act: orConf > 0.8,
          };
          logPrediction(s, "jev", res);
          saveState(s);
          return res;
        }
      }
    } catch {
      // cae al resultado local
    }
  }

  const res: PredictResult =
    best && bestScore > 0.15
      ? {
          intent: best.content,
          confidence: Math.min(0.99, bestScore),
          latencyMs,
          beliefId: best.id,
          source: "local",
          act: bestScore > 0.8,
        }
      : {
          intent: "Sin señal suficiente en la mente — mejor preguntar.",
          confidence: 0,
          latencyMs,
          beliefId: null,
          source: "local",
          act: false,
        };
  logPrediction(s, "jev", res);
  saveState(s);
  return res;
}

function logPrediction(s: State, agent: string, r: PredictResult) {
  s.predictions.unshift({
    id: uid(),
    agent,
    predicted_intent: r.intent,
    confidence: r.confidence,
    correct: null,
    created_at: now(),
  });
  s.predictions = s.predictions.slice(0, 200);
  addEvent(s, "prediction", {
    agent,
    intent: r.intent.slice(0, 80),
    confidence: Math.round(r.confidence * 100),
    latencyMs: Math.round(r.latencyMs * 10) / 10,
    act: r.act,
  });
}
