// Respondedor demo para los paneles de chat.
//
// Se usa SOLO cuando no hay AI_GATEWAY_API_KEY. En cuanto la key existe,
// /api/chat usa Vercel AI SDK vía AI Gateway con el system prompt de cada
// agente + los beliefs de la mente compartida inyectados en contexto.
// Incluso en modo demo, la respuesta cita la mente: la diferenciación real
// entre agentes viene de lo que la mente sabe, no del modelo.

import type { Belief } from "./types";

const OPENERS: Record<string, string[]> = {
  muse: [
    "Lo revisé contra la mente compartida.",
    "Verifiqué lo que sé de ti antes de responder.",
  ],
  grok: ["Va, directo:", "Órale, ahí te va:"],
  dot: ["Al grano:", "Hecho, mira:"],
  fo: ["Se me ocurren dos ángulos:", "¿Y si lo vemos así?"],
};

const CLOSERS: Record<string, string[]> = {
  muse: ["¿Quieres que lo afine en algo?"],
  grok: ["¿Algo más o seguimos?"],
  dot: ["Dime el siguiente paso."],
  fo: ["¿Exploramos la otra opción?"],
};

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

export function demoRespond(agentId: string, userText: string, beliefs: Belief[]): string {
  const seed = userText.length + agentId.length;
  const open = pick(OPENERS[agentId] || [""], seed);
  const close = pick(CLOSERS[agentId] || [""], seed + 1);

  if (beliefs.length === 0) {
    return `${open} Aún no tengo nada en la mente compartida sobre ti. Aporta algunas creencias en el panel "Aportar" y verás cómo los cuatro las usamos. ${close}`.trim();
  }

  const top = beliefs.slice(0, 2);
  const cited = top.map((b) => `«${b.content}» (${Math.round(b.confidence * 100)}%)`).join(" y ");

  const bodies: Record<string, string> = {
    muse: `Sobre "${userText.slice(0, 60)}": la mente dice que ${cited}. Con esa base, mi recomendación es actuar en ese formato y no preguntar de más.`,
    grok: `Fácil: sé que ${cited}. Así que para "${userText.slice(0, 60)}" ni lo dudes, hazlo así.`,
    dot: `Plan: 1) usar que ${cited}. 2) ejecutar "${userText.slice(0, 50)}" en ese formato. Sin vueltas.`,
    fo: `Dos caminos: el seguro usa que ${cited}; el atrevido lo combina con algo nuevo que aprenda de tu reacción. Yo iría por el seguro primero.`,
  };
  const body = bodies[agentId] || bodies.muse;
  return `${open} ${body} ${close}`.trim();
}

// Divide en pedazos para el efecto typewriter del streaming demo.
export function chunkText(s: string, size = 6): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}
