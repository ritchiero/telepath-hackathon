// Tipos compartidos entre servidor y cliente.
export interface Belief {
  id: string;
  content: string;
  confidence: number; // 0..1
  source_agent: string | null;
  corroborated_by: string[];
  created_at: string;
}

export type MindEventKind = "decision" | "correction" | "prediction" | "contribution" | "deletion" | "reset" | "confidence_update";

export interface MindEvent {
  id: string;
  kind: MindEventKind;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface Prediction {
  id: string;
  agent: string;
  predicted_intent: string;
  confidence: number;
  correct: boolean | null;
  created_at: string;
}

export interface ContributeItem {
  content: string;
  confidence?: number;
}

export interface PredictResult {
  intent: string;
  confidence: number;
  latencyMs: number;
  beliefId: string | null;
  source: "rpc" | "local" | "openrouter";
  act: boolean; // confidence > 0.8 → actúa sin preguntar
}

export interface MindStatus {
  mode: "supabase" | "local";
  detail: string;
  realtime: boolean;
}
