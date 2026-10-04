import { NextResponse } from "next/server";
import { AGENTS } from "@/lib/agents";
import { topBeliefs } from "@/lib/mind-server";

export const dynamic = "force-dynamic";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

// Modelos por agente vía OpenRouter (el system prompt da la personalidad).
// gpt-4o para los que necesitan más capacidad; haiku probado OK para Fo.
const OPENROUTER_MODELS: Record<string, string> = {
  grok: "x-ai/grok-4",
  dot: "openai/gpt-4o",
  fo: "anthropic/claude-3-5-haiku",
};
const OPENROUTER_FALLBACK = "openai/gpt-4o";

async function* streamOpenRouter(
  model: string,
  system: string,
  messages: ChatMsg[]
): AsyncGenerator<string> {  const key = process.env.HACKATHON_DISABLED_OPENROUTER_API_KEY;
  if (!key) throw new Error("missing OPENROUTER_API_KEY");
  const tryModels = model === OPENROUTER_FALLBACK ? [model] : [model, OPENROUTER_FALLBACK];
  let lastErr: unknown = null;
  for (const m of tryModels) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://telepath-nu.vercel.app",
          "X-Title": "Telepath",
        },
        body: JSON.stringify({
          model: m,
          stream: true,
          messages: [{ role: "system", content: system }, ...messages],
          max_tokens: 500,
        }),
      });
      if (!res.ok || !res.body) throw new Error(`openrouter ${res.status} for ${m}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (payload === "[DONE]") return;
          try {
            const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) yield delta;
          } catch {
            /* chunk parcial, ignorar */
          }
        }
      }
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("openrouter failed");
}

export async function POST(req: Request) {  const { agent, messages } = (await req.json()) as { agent: string; messages: ChatMsg[] };
  const def = AGENTS.find((a) => a.id === agent) || AGENTS[0];

  // La mente COMPLETA se inyecta a los 4 agentes: ese es el mecanismo.
  // No un top-6 filtrado — si el agente solo ve un subconjunto, niega
  // datos que sí existen ("no está en mi memoria" cuando sí está).
  const all = await topBeliefs("", 200);
  const system =
    def.system +
    "\n\n[SHARED MIND — the complete list of what all four agents know about the user. " +
    "This is ALL of it, not a subset. Use it to answer better; do not recite it as a list.]\n" +
    all.map((b) => `- (${Math.round(b.confidence * 100)}% · ${b.source_agent}) ${b.content}`).join("\n") +
    "\n\n[If the user asks about something NOT in the shared mind above and NOT in the conversation, " +
    'say clearly: "I don\'t have that recorded in the shared mind." Do NOT invent data, do NOT fill ' +
    "the gap with unrelated facts, and do NOT claim the shared mind is empty — it isn't, you just " +
    "don't have that specific piece.]" +
    "\n\n[You ALWAYS answer in English. Never respond in Spanish.]";

  const encoder = new TextEncoder();
  const collected: string[] = [];
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (t: string) => {
        collected.push(t);
        controller.enqueue(encoder.encode(t));
      };
      try {
        const sysMsgs = messages.map((m) => ({ role: m.role, content: m.content }));
        if (agent === "muse" && process.env.HACKATHON_DISABLED_ANTHROPIC_API_KEY) {
          // Panel Muse: Claude real vía API de Anthropic.
          const { streamText } = await import("ai");
          const { createAnthropic } = await import("@ai-sdk/anthropic");
          const anthropic = createAnthropic({ apiKey: process.env.HACKATHON_DISABLED_ANTHROPIC_API_KEY });
          const result = streamText({
            model: anthropic(process.env.ANTHROPIC_MODEL || "claude-opus-5-5"),
            system,
            messages: sysMsgs,
          });
          for await (const chunk of result.textStream) push(chunk);
        } else {
          // Grok / Dot / Fo: modelo real vía OpenRouter, cada uno con su voz.
          const model = OPENROUTER_MODELS[agent] || OPENROUTER_FALLBACK;
          for await (const chunk of streamOpenRouter(model, system, sysMsgs)) push(chunk);
        }
      } catch (e) {
        // Sin plantillas: si el modelo no responde, decirlo.
        push(
          `[Local demo · ${def.name} · no live model call]\nShared memory currently contains:\n${all.slice(0, 3).map(b => "• " + b.content).join("\n")}`
        );
      }
      controller.close();
      // Write-back bidireccional: el panel aporta a la mente lo que aprendió.
      // No bloquea la respuesta; si falla, no pasa nada.
      const fullText = collected.join("");
      writeBack(agent, messages, fullText).catch(() => {});
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
  });
}

// Extrae creencias nuevas de la conversación y las aporta a la mente compartida.
// Es el loop de escritura: sin esto los paneles solo consumen.
async function writeBack(agent: string, messages: ChatMsg[], assistantText: string): Promise<void> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  if (!lastUser.trim() || assistantText.trim().length < 30) return;
  if (assistantText.includes("can't reach its model")) return;
  const key = process.env.HACKATHON_DISABLED_OPENROUTER_API_KEY;
  if (!key) return;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://telepath-nu.vercel.app",
        "X-Title": "Telepath",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Extract specific, durable facts about the user from this conversation. " +
              'Return ONLY a JSON array like [{"content": "fact in English", "confidence": 0.9}]. ' +
              "One specific fact per item. Only NEW facts the user revealed (not things the assistant said). " +
              "Skip greetings, opinions, and one-off remarks. If nothing durable, return []. No explanations.",
          },
          {
            role: "user",
            content: `User said: ${lastUser.slice(0, 500)}\nAssistant replied: ${assistantText.slice(0, 800)}`,
          },
        ],
        max_tokens: 400,
      }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const raw: string = data.choices?.[0]?.message?.content || "";
    const jsonStr = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed: unknown = JSON.parse(jsonStr);
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    const { contribute } = await import("@/lib/mind-server");
    const items = (parsed as Array<Record<string, unknown>>)
      .filter((b) => typeof b.content === "string" && (b.content as string).trim().length > 12)
      .slice(0, 4)
      .map((b) => ({
        content: (b.content as string).trim().slice(0, 220),
        confidence: Math.min(0.9, Math.max(0.5, Number(b.confidence) || 0.7)),
      }));
    if (items.length > 0) await contribute(items, agent);
  } catch {
    /* best effort */
  }
}
