"use client";

import React, { useCallback, useEffect, useState } from "react";

/* ─────────────────────────────────────────────────────────────
   Telepath · Modo ensayo + reset para el escenario
   Un solo archivo, sin dependencias nuevas (solo React + fetch).
   Rutas: /api/mind/reset · /api/mind/status · /api/beliefs · /api/predict
   ───────────────────────────────────────────────────────────── */

type Belief = {
  id: string | number;
  content: string;
  confidence: number;
  source_agent?: string | null;
  corroborated_by?: string[] | null;
  created_at?: string | null;
};

type MindStatus = { mode?: string; detail?: string };

type Predict = {
  intent?: string;
  confidence?: number;
  latencyMs?: number;
  source?: "local" | "rpc" | "openrouter" | string;
  act?: boolean;
};

type StepStatus = "pendiente" | "corriendo" | "ok" | "falló" | "omitido";

type Step = {
  key: string;
  label: string;
  status: StepStatus;
  detail?: string;
  at?: string;
  ms?: number;
  fatal: boolean;
};

type Snapshot = {
  content: string;
  confidence: number;
  created_at?: string | null;
  capturedAt: string;
};

const C = {
  muse: "#fbbf24",
  grok: "#4d8dff",
  dot: "#4ade80",
  fo: "#a78bfa",
  ok: "#4ade80",
  fail: "#f87171",
  warn: "#fbbf24",
  bg: "#0b0b12",
  card: "#151522",
  cardHi: "#1c1c2e",
  border: "#2a2a3d",
  text: "#f4f4f8",
  muted: "#a1a1b5",
};

const STORAGE_KEY = "telepath-ensayo-checklist-v1";

const CHECKLIST: { key: string; label: string; hint: string; auto?: boolean }[] = [
  { key: "hotspot", label: "Hotspot del teléfono conectado y probado", hint: "Plan B si se cae el wifi del venue" },
  { key: "video", label: "Video de respaldo del momento central abierto en otra pestaña", hint: "60 segundos, por si falla la red o una API" },
  { key: "zoom", label: "Zoom del navegador al 150%", hint: "Que se lea desde la última fila" },
  { key: "ventana", label: "Una sola ventana con los dos agentes lado a lado", hint: "Nada de cambiar de pestaña en vivo" },
  { key: "cuotas", label: "Cuotas de API revisadas y llaves de respaldo listas", hint: "Grok, OpenRouter y Anthropic; revisar a las 4pm" },
  { key: "sesiones", label: "Sesiones iniciadas justo antes de subir", hint: "No cerrar pestañas después" },
  { key: "pregunta", label: "Pregunta del momento central ensayada", hint: "Fija, la misma siempre, mínimo 10 veces" },
  { key: "latencia", label: "Contador de latencia visible en pantalla", hint: "Para cuando pregunten por los milisegundos" },
  { key: "guion", label: "Guion cronometrado", hint: "El momento central dentro del primer minuto" },
  { key: "ensayo", label: "Auto-ensayo en verde", hint: "Se marca solo al terminar sin fallas", auto: true },
  { key: "reset", label: "Reset demo hecho justo antes de subir", hint: "Se marca solo al resetear", auto: true },
];

const STEP_DEFS: { key: string; label: string; fatal: boolean }[] = [
  { key: "status", label: "La mente responde", fatal: true },
  { key: "base", label: "Contar creencias actuales", fatal: true },
  { key: "aportar", label: "Aportar 2 creencias de prueba (agente \"ensayo\")", fatal: true },
  { key: "verificar", label: "Verificar que ambas llegaron a la mente", fatal: true },
  { key: "corregir", label: "Corregir una en vivo", fatal: true },
  { key: "despues", label: "Confirmar que la confianza subió a ~95%", fatal: true },
  { key: "jev", label: "jev predice sobre la corrección (latencia)", fatal: false },
  { key: "limpiar", label: "Borrar las creencias de prueba", fatal: false },
];

/* ───────── helpers ───────── */

async function api<T = unknown>(
  path: string,
  init?: RequestInit,
  timeoutMs = 15000
): Promise<{ data: T; ms: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = performance.now();
  try {
    const res = await fetch(path, {
      ...init,
      cache: "no-store",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...((init?.headers as Record<string, string> | undefined) ?? {}),
      },
    });
    const text = await res.text();
    const ms = Math.round(performance.now() - t0);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}${text ? ` · ${text.slice(0, 140)}` : ""}`);
    }
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* respuesta en texto plano */
    }
    return { data: data as T, ms };
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new Error(`Tiempo agotado (${timeoutMs / 1000} s) en ${path}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function toBeliefs(data: unknown): Belief[] {
  if (Array.isArray(data)) return data as Belief[];
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.beliefs)) return d.beliefs as Belief[];
    if (Array.isArray(d.data)) return d.data as Belief[];
  }
  return [];
}

function normConf(c: unknown): number {
  const n = typeof c === "number" ? c : Number(c);
  if (!Number.isFinite(n)) return 0;
  return n > 1 ? n / 100 : n;
}

const pct = (c: unknown) => `${Math.round(normConf(c) * 100)}%`;

const nowIso = () => new Date().toISOString();

function hora(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function countFromReset(data: unknown): number | null {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    for (const k of ["count", "beliefs", "inserted", "seeded", "total", "n"]) {
      const v = d[k];
      if (typeof v === "number") return v;
      if (Array.isArray(v)) return v.length;
    }
  }
  return null;
}

/* ───────── componente ───────── */

export default function RehearsalPanel() {
  const [status, setStatus] = useState<MindStatus | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);

  const [resetState, setResetState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [resetMsg, setResetMsg] = useState<string>("");

  const [steps, setSteps] = useState<Step[]>(STEP_DEFS.map((s) => ({ ...s, status: "pendiente" })));
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<"ok" | "fail" | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [totalMs, setTotalMs] = useState<number | null>(null);
  const [before, setBefore] = useState<Snapshot | null>(null);
  const [after, setAfter] = useState<Snapshot | null>(null);
  const [predict, setPredict] = useState<(Predict & { roundTrip: number }) | null>(null);
  const [cleanup, setCleanup] = useState(true);

  const [checks, setChecks] = useState<Record<string, boolean>>({});

  /* checklist persistente */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setChecks(JSON.parse(raw));
    } catch {
      /* sin localStorage */
    }
  }, []);

  const setCheck = useCallback((key: string, value: boolean) => {
    setChecks((prev) => {
      const next = { ...prev, [key]: value };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* sin localStorage */
      }
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api<MindStatus>("/api/mind/status");
      setStatus(data && typeof data === "object" ? data : { mode: String(data) });
      setStatusErr(null);
    } catch (e) {
      setStatus(null);
      setStatusErr((e as Error).message);
    }
    try {
      const { data } = await api("/api/beliefs");
      setCount(toBeliefs(data).length);
    } catch {
      setCount(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /* 1) Reset demo */
  const doReset = async () => {
    if (resetState === "running" || running) return;
    const ok = window.confirm(
      "¿Resetear la mente al seed?\n\nSe borran todas las creencias actuales y se carga la mente inicial de la demo."
    );
    if (!ok) return;
    setResetState("running");
    setResetMsg("Reseteando…");
    try {
      const { data, ms } = await api("/api/mind/reset", { method: "POST" });
      let n = countFromReset(data);
      if (n === null) {
        const { data: list } = await api("/api/beliefs");
        n = toBeliefs(list).length;
      }
      setCount(n);
      setResetState("done");
      setResetMsg(`Mente reseteada: ${n} creencias · ${hora(nowIso())} · ${ms} ms`);
      setCheck("reset", true);
    } catch (e) {
      setResetState("error");
      setResetMsg(`No se pudo resetear: ${(e as Error).message}`);
      setCheck("reset", false);
    }
  };

  /* 2) Auto-ensayo del momento central */
  const runRehearsal = async () => {
    if (running || resetState === "running") return;
    setRunning(true);
    setResult(null);
    setBefore(null);
    setAfter(null);
    setPredict(null);
    setTotalMs(null);
    const t0 = performance.now();
    setStartedAt(nowIso());

    const tag = `ENSAYO-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const TXT_A = `[${tag}] Al usuario le gusta el café sin azúcar`;
    const TXT_B = `[${tag}] El usuario vive en Oakland`;
    const TXT_CORR = `[${tag}] Corrección: el usuario vive en San Francisco, no en Oakland`;

    let local: Step[] = STEP_DEFS.map((s) => ({ ...s, status: "pendiente" }));
    setSteps(local);
    const update = (key: string, patch: Partial<Step>) => {
      local = local.map((s) => (s.key === key ? { ...s, ...patch } : s));
      setSteps(local);
    };

    const step = async <T,>(key: string, fn: () => Promise<{ detail: string; value: T }>): Promise<T> => {
      update(key, { status: "corriendo", at: nowIso(), detail: undefined });
      const s0 = performance.now();
      try {
        const { detail, value } = await fn();
        update(key, { status: "ok", detail, at: nowIso(), ms: Math.round(performance.now() - s0) });
        return value;
      } catch (e) {
        update(key, { status: "falló", detail: (e as Error).message, at: nowIso(), ms: Math.round(performance.now() - s0) });
        throw e;
      }
    };

    const created: (string | number)[] = [];
    let ok = false;

    try {
      await step("status", async () => {
        const { data, ms } = await api<MindStatus>("/api/mind/status");
        setStatus(data);
        return { detail: `Modo: ${data?.mode ?? "?"} · ${ms} ms`, value: null };
      });

      await step("base", async () => {
        const { data } = await api("/api/beliefs");
        const n = toBeliefs(data).length;
        return { detail: `${n} creencias en la mente`, value: n };
      });

      await step("aportar", async () => {
        const { ms } = await api("/api/beliefs", {
          method: "POST",
          body: JSON.stringify({
            agent: "ensayo",
            items: [
              { content: TXT_A, confidence: 0.6, source_agent: "ensayo" },
              { content: TXT_B, confidence: 0.55, source_agent: "ensayo" },
            ],
          }),
        });
        return { detail: `2 creencias enviadas · ${ms} ms`, value: null };
      });

      const target = await step<Belief>("verificar", async () => {
        const { data } = await api("/api/beliefs");
        const list = toBeliefs(data);
        const a = list.find((b) => b.content?.includes(tag) && b.content.includes("café"));
        const b = list.find((x) => x.content?.includes(tag) && x.content.includes("Oakland"));
        if (a) created.push(a.id);
        if (b) created.push(b.id);
        if (!a || !b) throw new Error(`Solo llegaron ${(a ? 1 : 0) + (b ? 1 : 0)} de 2 creencias`);
        setBefore({ content: b.content, confidence: normConf(b.confidence), created_at: b.created_at, capturedAt: nowIso() });
        return { detail: `Ambas en la mente · "Oakland" con ${pct(b.confidence)}`, value: b };
      });

      await step("corregir", async () => {
        const { ms } = await api(`/api/beliefs/${encodeURIComponent(String(target.id))}`, {
          method: "PATCH",
          body: JSON.stringify({ correction: TXT_CORR, by: "ensayo" }),
        });
        return { detail: `Corrección aplicada · ${ms} ms`, value: null };
      });

      await step("despues", async () => {
        const { data } = await api("/api/beliefs");
        const list = toBeliefs(data);
        const c =
          list.find((x) => String(x.id) === String(target.id)) ??
          list.find((x) => x.content?.includes(tag) && x.content.includes("San Francisco"));
        if (!c) throw new Error("No encontré la creencia corregida");
        if (!created.some((id) => String(id) === String(c.id))) created.push(c.id);
        const conf = normConf(c.confidence);
        setAfter({ content: c.content, confidence: conf, created_at: c.created_at, capturedAt: nowIso() });
        if (conf < 0.9) throw new Error(`La confianza quedó en ${pct(conf)}; se esperaba ~95%`);
        return { detail: `${pct(target.confidence)} → ${pct(conf)}`, value: null };
      });

      ok = true;

      try {
        await step("jev", async () => {
          const { data, ms } = await api<Predict>("/api/predict", {
            method: "POST",
            body: JSON.stringify({ query: "¿Dónde vive el usuario?" }),
          });
          setPredict({ ...data, roundTrip: ms });
          return {
            detail: `"${data?.intent ?? "?"}" · ${data?.latencyMs ?? "?"} ms (${data?.source ?? "?"}) · ida y vuelta ${ms} ms`,
            value: null,
          };
        });
      } catch {
        /* jev no es bloqueante: queda marcado en rojo pero el ensayo central pasó */
      }
    } catch {
      ok = false;
      local = local.map((s) => (s.status === "pendiente" && s.key !== "limpiar" ? { ...s, status: "omitido" } : s));
      setSteps(local);
    } finally {
      if (cleanup && created.length) {
        try {
          await step("limpiar", async () => {
            const ids = Array.from(new Set(created.map(String)));
            let borradas = 0;
            for (const id of ids) {
              try {
                await api(`/api/beliefs/${encodeURIComponent(id)}`, { method: "DELETE" });
                borradas++;
              } catch {
                /* sigue con las demás */
              }
            }
            if (borradas < ids.length) throw new Error(`Se borraron ${borradas} de ${ids.length}`);
            return { detail: `${borradas} creencias de prueba borradas`, value: null };
          });
        } catch {
          /* ya quedó marcado */
        }
      } else {
        update("limpiar", {
          status: "omitido",
          detail: cleanup ? "No había nada que borrar" : "Limpieza desactivada: las creencias de prueba siguen en la mente",
        });
      }
      setTotalMs(Math.round(performance.now() - t0));
      setResult(ok ? "ok" : "fail");
      setCheck("ensayo", ok);
      setRunning(false);
      refresh();
    }
  };

  const done = CHECKLIST.filter((i) => checks[i.key]).length;
  const allDone = done === CHECKLIST.length;

  /* ───────── UI ───────── */

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div>
          <div style={s.kicker}>TELEPATH · MODO ENSAYO</div>
          <h1 style={s.h1}>Listos para el escenario</h1>
        </div>
        <div style={s.statusBox}>
          <span style={{ ...s.dot, background: statusErr ? C.fail : status ? C.ok : C.muted }} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {statusErr ? "Mente sin respuesta" : status ? `Mente: ${status.mode ?? "activa"}` : "Revisando…"}
            </div>
            <div style={{ fontSize: 15, color: C.muted }}>
              {statusErr ?? status?.detail ?? ""}
              {count !== null ? ` · ${count} creencias` : ""}
            </div>
          </div>
          <button style={s.ghostBtn} onClick={refresh} disabled={running}>
            Actualizar
          </button>
        </div>
      </header>

      <p style={s.order}>Orden sugerido: auto-ensayo → checklist → reset demo → subir al escenario.</p>

      {/* 1) Reset */}
      <section style={s.card}>
        <h2 style={s.h2}>
          <span style={s.num}>1</span> Reset demo
        </h2>
        <button
          style={{
            ...s.bigBtn,
            background: resetState === "running" ? C.border : C.fo,
            cursor: resetState === "running" || running ? "wait" : "pointer",
          }}
          onClick={doReset}
          disabled={resetState === "running" || running}
        >
          {resetState === "running" ? "Reseteando…" : "Reset demo"}
        </button>
        {resetMsg && (
          <div
            style={{
              ...s.banner,
              borderColor: resetState === "error" ? C.fail : resetState === "done" ? C.ok : C.border,
              color: resetState === "error" ? C.fail : resetState === "done" ? C.ok : C.text,
            }}
          >
            {resetMsg}
          </div>
        )}
      </section>

      {/* 2) Auto-ensayo */}
      <section style={s.card}>
        <h2 style={s.h2}>
          <span style={s.num}>2</span> Auto-ensayo del momento central
        </h2>
        <p style={s.p}>
          Aporta 2 creencias de prueba, corrige una y comprueba que la mente compartida ya tiene la versión corregida.
        </p>
        <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          <button
            style={{ ...s.bigBtn, background: running ? C.border : C.grok, cursor: running ? "wait" : "pointer" }}
            onClick={runRehearsal}
            disabled={running || resetState === "running"}
          >
            {running ? "Ensayando…" : "Correr auto-ensayo"}
          </button>
          <label style={s.inline}>
            <input
              type="checkbox"
              checked={cleanup}
              onChange={(e) => setCleanup(e.target.checked)}
              disabled={running}
              style={s.checkbox}
            />
            Borrar las creencias de prueba al terminar
          </label>
        </div>

        <ol style={s.list}>
          {steps.map((st) => (
            <li key={st.key} style={s.stepRow}>
              <span style={{ ...s.badge, ...badgeStyle(st.status) }}>{icon(st.status)}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 600, opacity: st.status === "omitido" ? 0.5 : 1 }}>
                  {st.label}
                  {!st.fatal && <span style={s.optional}> · no bloqueante</span>}
                </div>
                {st.detail && (
                  <div style={{ fontSize: 16, color: st.status === "falló" ? C.fail : C.muted }}>{st.detail}</div>
                )}
              </div>
              <div style={s.stamp}>
                {st.at ? hora(st.at) : ""}
                {typeof st.ms === "number" ? ` · ${st.ms} ms` : ""}
              </div>
            </li>
          ))}
        </ol>

        {(before || after) && (
          <div style={s.compare}>
            <Snap title="Antes" color={C.muse} snap={before} />
            <div style={s.arrow}>→</div>
            <Snap title="Después de corregir" color={C.dot} snap={after} />
          </div>
        )}

        {predict && (
          <div style={{ ...s.banner, borderColor: C.fo }}>
            jev: intención <b>{predict.intent ?? "?"}</b> · confianza {pct(predict.confidence)} · {predict.latencyMs ?? "?"} ms
            ({predict.source ?? "?"}) · {predict.act ? "actúa" : "no actúa"}
          </div>
        )}

        {result && (
          <div
            style={{
              ...s.banner,
              fontSize: 22,
              fontWeight: 700,
              borderColor: result === "ok" ? C.ok : C.fail,
              color: result === "ok" ? C.ok : C.fail,
            }}
          >
            {result === "ok"
              ? `Ensayo en verde · empezó ${hora(startedAt)} · ${totalMs} ms en total`
              : "El ensayo falló. Revisa el paso en rojo antes de subir."}
          </div>
        )}
      </section>

      {/* 3) Checklist */}
      <section style={s.card}>
        <h2 style={s.h2}>
          <span style={s.num}>3</span> Checklist pre-demo
          <span style={{ ...s.counter, color: allDone ? C.ok : C.muted }}>
            {done}/{CHECKLIST.length}
          </span>
        </h2>
        <div style={s.progressOuter}>
          <div
            style={{
              ...s.progressInner,
              width: `${(done / CHECKLIST.length) * 100}%`,
              background: allDone ? C.ok : C.fo,
            }}
          />
        </div>
        <ul style={s.list}>
          {CHECKLIST.map((item) => (
            <li key={item.key} style={s.checkRow}>
              <label style={{ ...s.inline, alignItems: "flex-start", width: "100%", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!checks[item.key]}
                  onChange={(e) => setCheck(item.key, e.target.checked)}
                  style={{ ...s.checkbox, marginTop: 4 }}
                />
                <div>
                  <div
                    style={{
                      fontSize: 21,
                      fontWeight: 600,
                      textDecoration: checks[item.key] ? "line-through" : "none",
                      color: checks[item.key] ? C.muted : C.text,
                    }}
                  >
                    {item.label}
                    {item.auto && <span style={s.optional}> · automático</span>}
                  </div>
                  <div style={{ fontSize: 16, color: C.muted }}>{item.hint}</div>
                </div>
              </label>
            </li>
          ))}
        </ul>
        {allDone ? (
          <div style={{ ...s.banner, borderColor: C.ok, color: C.ok, fontSize: 24, fontWeight: 800, textAlign: "center" }}>
            Todo listo. A romperla.
          </div>
        ) : (
          <button style={s.ghostBtn} onClick={() => CHECKLIST.forEach((i) => setCheck(i.key, false))}>
            Desmarcar todo
          </button>
        )}
      </section>

      <footer style={s.footer}>
        <span style={{ color: C.muse }}>Muse</span> · <span style={{ color: C.grok }}>Grok</span> ·{" "}
        <span style={{ color: C.dot }}>Dot</span> · <span style={{ color: C.fo }}>Fo</span> — una sola mente.
      </footer>
    </div>
  );
}

function Snap({ title, color, snap }: { title: string; color: string; snap: Snapshot | null }) {
  return (
    <div style={{ ...s.snap, borderColor: color }}>
      <div style={{ fontSize: 16, color, fontWeight: 700, letterSpacing: 1 }}>{title.toUpperCase()}</div>
      {snap ? (
        <>
          <div style={{ fontSize: 44, fontWeight: 800, color }}>{pct(snap.confidence)}</div>
          <div style={{ fontSize: 18, margin: "6px 0 10px" }}>{snap.content}</div>
          <div style={{ fontSize: 15, color: C.muted }}>
            Creada {hora(snap.created_at)} · leída {hora(snap.capturedAt)}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 18, color: C.muted }}>Esperando…</div>
      )}
    </div>
  );
}

function icon(st: StepStatus): string {
  switch (st) {
    case "ok":
      return "✓";
    case "falló":
      return "✕";
    case "corriendo":
      return "…";
    case "omitido":
      return "–";
    default:
      return "○";
  }
}

function badgeStyle(st: StepStatus): React.CSSProperties {
  switch (st) {
    case "ok":
      return { background: C.ok, color: C.bg };
    case "falló":
      return { background: C.fail, color: C.bg };
    case "corriendo":
      return { background: C.warn, color: C.bg };
    default:
      return { background: C.border, color: C.muted };
  }
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: C.bg,
    color: C.text,
    padding: "40px 48px 64px",
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    fontSize: 20,
    lineHeight: 1.4,
    maxWidth: 1200,
    margin: "0 auto",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" },
  kicker: { color: C.fo, fontWeight: 800, letterSpacing: 3, fontSize: 16 },
  h1: { fontSize: 48, fontWeight: 800, margin: "6px 0 0" },
  h2: { fontSize: 30, fontWeight: 800, margin: "0 0 18px", display: "flex", alignItems: "center", gap: 14 },
  num: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    borderRadius: 999,
    background: C.fo,
    color: C.bg,
    fontSize: 22,
  },
  p: { color: C.muted, margin: "0 0 18px", fontSize: 19 },
  order: { color: C.muted, fontSize: 18, margin: "18px 0 8px" },
  card: {
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 20,
    padding: 32,
    marginTop: 24,
  },
  statusBox: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 16,
    padding: "14px 18px",
  },
  dot: { width: 16, height: 16, borderRadius: 999, flexShrink: 0 },
  bigBtn: {
    border: "none",
    borderRadius: 16,
    padding: "22px 40px",
    fontSize: 26,
    fontWeight: 800,
    color: "#0b0b12",
  },
  ghostBtn: {
    background: "transparent",
    color: C.text,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: "10px 16px",
    fontSize: 16,
    cursor: "pointer",
    marginTop: 4,
  },
  banner: {
    marginTop: 20,
    padding: "16px 20px",
    border: "2px solid",
    borderRadius: 14,
    background: C.cardHi,
    fontSize: 19,
  },
  inline: { display: "flex", alignItems: "center", gap: 12, fontSize: 18, color: C.text },
  checkbox: { width: 24, height: 24, accentColor: C.fo, flexShrink: 0 },
  list: { listStyle: "none", padding: 0, margin: "24px 0 0" },
  stepRow: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "14px 0",
    borderBottom: `1px solid ${C.border}`,
  },
  checkRow: { padding: "14px 0", borderBottom: `1px solid ${C.border}` },
  badge: {
    width: 38,
    height: 38,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: 20,
    flexShrink: 0,
  },
  stamp: { fontSize: 15, color: C.muted, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  optional: { fontSize: 15, color: C.muted, fontWeight: 400 },
  compare: { display: "flex", alignItems: "stretch", gap: 16, marginTop: 24, flexWrap: "wrap" },
  snap: { flex: 1, minWidth: 260, border: "2px solid", borderRadius: 16, padding: 20, background: C.cardHi },
  arrow: { alignSelf: "center", fontSize: 40, color: C.muted },
  counter: { marginLeft: "auto", fontSize: 24, fontVariantNumeric: "tabular-nums" },
  progressOuter: { height: 12, background: C.border, borderRadius: 999, overflow: "hidden" },
  progressInner: { height: "100%", borderRadius: 999, transition: "width 300ms ease" },
  footer: { marginTop: 40, textAlign: "center", color: C.muted, fontSize: 18 },
};

