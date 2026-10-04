"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Belief, MindEvent } from "@/lib/types";
import { AGENTS } from "@/lib/agents";
import { jaccard } from "@/lib/similarity";
import type { PredictPing } from "./MindProvider";

const agentColor = (id: string | null | undefined) =>
  AGENTS.find((a) => a.id === id)?.color ?? "#cbd5e1";

interface Link {
  a: string;
  b: string;
  hot: boolean;
  phase: number;
}
interface NodeS {
  id: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  born: number;
  phase: number;
}
interface Wave {
  x: number;
  y: number;
  t0: number;
  color: string;
  ring: number;
}
interface Bolt {
  x: number;
  y: number;
  t0: number;
  segments: { x: number; y: number }[];
  branches: { x: number; y: number }[][];
}
interface Trail {
  fromId: string;
  toId: string;
  t0: number;
  color: string;
  pulses: number[];
}
interface Flash {
  x: number;
  y: number;
  t0: number;
  color: string;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  depth: number;
}
interface Nebula {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}
interface VignettePulse {
  t0: number;
  color: string;
}
interface BirthRing {
  x: number;
  y: number;
  t0: number;
}

const GOLDEN = 2.399963;

const prefersReducedMotion =
  typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

export default function MindCanvas({
  beliefs,
  events,
  lastPredict,
}: {
  beliefs: Belief[];
  events: MindEvent[];
  lastPredict: PredictPing | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodes = useRef(new Map<string, NodeS>());
  const waves = useRef<Wave[]>([]);
  const bolts = useRef<Bolt[]>([]);
  const trails = useRef<Trail[]>([]);
  const flashes = useRef<Flash[]>([]);
  const birthRings = useRef<BirthRing[]>([]);
  const vignettePulses = useRef<VignettePulse[]>([]);
  const particles = useRef<Particle[]>([]);
  const nebulae = useRef<Nebula[]>([]);
  const seenEvents = useRef(new Set<string>());
  const seenPredictAt = useRef(0);
  const linkFlash = useRef(0);
  const size = useRef({ w: 900, h: 560 });
  const globalPhase = useRef(0);

  const ordered = useMemo(
    () => [...beliefs].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [beliefs]
  );
  const byId = useMemo(() => new Map(beliefs.map((b) => [b.id, b])), [beliefs]);

  const links = useMemo(() => {
    const out: Link[] = [];
    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const s = jaccard(ordered[i].content, ordered[j].content);
        if (s >= 0.28) {
          out.push({
            a: ordered[i].id,
            b: ordered[j].id,
            hot:
              ordered[i].corroborated_by.length > 0 ||
              ordered[j].corroborated_by.length > 0,
            phase: Math.random(),
          });
        }
      }
    }
    return out;
  }, [ordered]);

  const layout = () => {
    const { w, h } = size.current;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(w, h) / 2 - 70;
    ordered.forEach((b, i) => {
      const n = nodes.current.get(b.id);
      if (!n) return;
      const ang = i * GOLDEN + 0.6;
      const rad = Math.min(52 * Math.sqrt(i + 0.7), maxR);
      n.tx = cx + Math.cos(ang) * rad;
      n.ty = cy + Math.sin(ang) * rad * 0.8;
    });
  };

  const initParticles = () => {
    const { w, h } = size.current;
    particles.current = [];
    for (let i = 0; i < 60; i++) {
      particles.current.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.1,
        size: 0.5 + Math.random() * 1.5,
        alpha: 0.06 + Math.random() * 0.06,
        depth: 0.3 + Math.random() * 0.7,
      });
    }
  };

  const initNebulae = () => {
    const { w, h } = size.current;
    nebulae.current = [
      {
        x: w * 0.3,
        y: h * 0.4,
        vx: 0.08,
        vy: 0.05,
        radius: Math.min(w, h) * 0.4,
        color: "rgba(251,191,36,0.05)",
      },
      {
        x: w * 0.7,
        y: h * 0.6,
        vx: -0.06,
        vy: 0.04,
        radius: Math.min(w, h) * 0.35,
        color: "rgba(77,141,255,0.05)",
      },
      {
        x: w * 0.5,
        y: h * 0.3,
        vx: 0.04,
        vy: -0.03,
        radius: Math.min(w, h) * 0.3,
        color: "rgba(167,139,250,0.05)",
      },
    ];
  };

  useEffect(() => {
    const { w, h } = size.current;
    const cx = w / 2;
    const cy = h / 2;
    let added = false;
    for (const b of ordered) {
      if (!nodes.current.has(b.id)) {
        const ang = Math.random() * Math.PI * 2;
        const R = Math.max(w, h) / 2 + 60;
        const startX = cx + Math.cos(ang) * R;
        const startY = cy + Math.sin(ang) * R;
        nodes.current.set(b.id, {
          id: b.id,
          x: startX,
          y: startY,
          sx: startX,
          sy: startY,
          tx: cx,
          ty: cy,
          born: performance.now(),
          phase: Math.random() * Math.PI * 2,
        });
        birthRings.current.push({ x: cx, y: cy, t0: performance.now() });
        added = true;
      }
    }
    for (const id of [...nodes.current.keys()]) {
      if (!byId.has(id)) nodes.current.delete(id);
    }
    if (added || nodes.current.size !== ordered.length) layout();
  }, [ordered, byId]);

  useEffect(() => {
    for (const e of events) {
      if (seenEvents.current.has(e.id)) continue;
      seenEvents.current.add(e.id);
      const p = e.payload as Record<string, unknown>;
      if (e.kind === "correction" && typeof p.belief_id === "string") {
        const n = nodes.current.get(p.belief_id);
        const b = byId.get(p.belief_id);
        const col = agentColor(b?.source_agent);
        if (n) {
          for (let ring = 0; ring < 3; ring++) {
            waves.current.push({
              x: n.x,
              y: n.y,
              t0: performance.now() + ring * 80,
              color: col,
              ring,
            });
          }
          flashes.current.push({ x: n.x, y: n.y, t0: performance.now(), color: col });
          vignettePulses.current.push({ t0: performance.now(), color: col });

          const connectedNodes: string[] = [];
          for (const link of links) {
            if (link.hot) {
              if (link.a === p.belief_id) connectedNodes.push(link.b);
              else if (link.b === p.belief_id) connectedNodes.push(link.a);
            }
          }
          if (b && b.corroborated_by.length > 0) {
            for (const bel of ordered) {
              if (
                bel.id !== p.belief_id &&
                bel.corroborated_by.some((c) => b.corroborated_by.includes(c))
              ) {
                if (!connectedNodes.includes(bel.id)) {
                  connectedNodes.push(bel.id);
                }
              }
            }
          }
          for (const targetId of connectedNodes.slice(0, 6)) {
            trails.current.push({
              fromId: p.belief_id,
              toId: targetId,
              t0: performance.now(),
              color: col,
              pulses: [0, 0.33, 0.66],
            });
          }
        }
      }
      if (e.kind === "contribution" && p.corroborated) linkFlash.current = 1;
    }
  }, [events, byId, links, ordered]);

  useEffect(() => {
    if (
      lastPredict &&
      lastPredict.at !== seenPredictAt.current &&
      lastPredict.beliefId
    ) {
      seenPredictAt.current = lastPredict.at;
      const n = nodes.current.get(lastPredict.beliefId);
      if (n) {
        const segments: { x: number; y: number }[] = [];
        let bx = n.x + (Math.random() - 0.5) * 40;
        segments.push({ x: bx, y: -10 });
        const segs = 8;
        for (let s = 1; s <= segs; s++) {
          const yy = ((n.y + 10) * s) / segs - 10;
          bx += (Math.random() - 0.5) * 50;
          segments.push({ x: bx, y: yy });
        }
        segments.push({ x: n.x, y: n.y });

        const branches: { x: number; y: number }[][] = [];
        const branchCount = 1 + Math.floor(Math.random() * 2);
        for (let br = 0; br < branchCount; br++) {
          const branchStart = 2 + Math.floor(Math.random() * 4);
          if (branchStart < segments.length) {
            const branch: { x: number; y: number }[] = [];
            let bxBr = segments[branchStart].x;
            let byBr = segments[branchStart].y;
            branch.push({ x: bxBr, y: byBr });
            const brSegs = 3 + Math.floor(Math.random() * 3);
            const dir = Math.random() > 0.5 ? 1 : -1;
            for (let bs = 0; bs < brSegs; bs++) {
              bxBr += dir * (20 + Math.random() * 30);
              byBr += 15 + Math.random() * 25;
              branch.push({ x: bxBr, y: byBr });
            }
            branches.push(branch);
          }
        }

        bolts.current.push({
          x: n.x,
          y: n.y,
          t0: performance.now(),
          segments,
          branches,
        });
      }
    }
  }, [lastPredict]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size.current = { w: Math.max(300, r.width), h: Math.max(320, r.height) };
      canvas.width = size.current.w * dpr;
      canvas.height = size.current.h * dpr;
      canvas.style.width = `${size.current.w}px`;
      canvas.style.height = `${size.current.h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout();
      initParticles();
      initNebulae();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const drawStatic = () => {
      const { w, h } = size.current;
      ctx.clearRect(0, 0, w, h);

      for (const l of links) {
        const A = nodes.current.get(l.a);
        const B = nodes.current.get(l.b);
        if (!A || !B) continue;
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.strokeStyle = l.hot
          ? "rgba(0,0,0,0.18)"
          : "rgba(0,0,0,0.08)";
        ctx.lineWidth = l.hot ? 1.6 : 1;
        ctx.stroke();
      }

      for (const b of ordered) {
        const n = nodes.current.get(b.id);
        if (!n) continue;
        const conf = b.confidence;
        const r = 5 + conf * 13;
        const col = agentColor(b.source_agent);

        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 4);
        g.addColorStop(0, col + "40");
        g.addColorStop(1, col + "00");
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 4, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.35 + conf * 0.6;
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.beginPath();
        ctx.arc(n.x, n.y, Math.max(1.5, r * 0.28), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fill();

        if (b.corroborated_by.length > 0) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 6, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(107,114,128,0.5)";
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1.6;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    };

    if (prefersReducedMotion) {
      drawStatic();
      return () => {
        ro.disconnect();
      };
    }

    const draw = (t: number) => {
      const { w, h } = size.current;
      ctx.clearRect(0, 0, w, h);
      linkFlash.current *= 0.95;
      globalPhase.current = t;

      // Nebula backdrop - ultra soft pastel washes
      for (const neb of nebulae.current) {
        neb.x += neb.vx;
        neb.y += neb.vy;
        if (neb.x < -neb.radius * 0.5) neb.vx = Math.abs(neb.vx);
        if (neb.x > w + neb.radius * 0.5) neb.vx = -Math.abs(neb.vx);
        if (neb.y < -neb.radius * 0.5) neb.vy = Math.abs(neb.vy);
        if (neb.y > h + neb.radius * 0.5) neb.vy = -Math.abs(neb.vy);

        const grad = ctx.createRadialGradient(
          neb.x,
          neb.y,
          0,
          neb.x,
          neb.y,
          neb.radius
        );
        grad.addColorStop(0, neb.color);
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.beginPath();
        ctx.arc(neb.x, neb.y, neb.radius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Depth particles - light gray dots
      for (const p of particles.current) {
        p.x += p.vx * p.depth;
        p.y += p.vy * p.depth;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        const twinkle = 0.5 + 0.5 * Math.sin(t / 800 + p.x * 0.01);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,0,0,${p.alpha * twinkle})`;
        ctx.fill();
      }

      // Global breathing offset
      const breathX = Math.sin(t / 4000) * 3;
      const breathY = Math.cos(t / 5000) * 2;

      // Empty state
      if (ordered.length === 0) {
        for (let i = 0; i < 42; i++) {
          const gx = (i % 7) * (w / 6) + w / 12;
          const gy = Math.floor(i / 7) * (h / 5) + h / 10;
          const a = 0.05 + 0.03 * Math.sin(t / 1400 + i);
          ctx.beginPath();
          ctx.arc(gx, gy, 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0,0,0,${Math.max(0.04, a)})`;
          ctx.fill();
        }
        raf = requestAnimationFrame(draw);
        return;
      }

      // Links - dark on white
      for (const l of links) {
        const A = nodes.current.get(l.a);
        const B = nodes.current.get(l.b);
        if (!A || !B) continue;
        const base = l.hot ? 0.18 : 0.08;
        const alpha = Math.min(0.35, base + linkFlash.current * 0.15);
        ctx.beginPath();
        ctx.moveTo(A.x + breathX, A.y + breathY);
        ctx.lineTo(B.x + breathX, B.y + breathY);
        ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
        ctx.lineWidth = l.hot ? 1.6 : 1;
        ctx.stroke();

        if (l.hot) {
          const p = (t / 1600 + l.phase) % 1;
          const px = A.x + (B.x - A.x) * p + breathX;
          const py = A.y + (B.y - A.y) * p + breathY;
          ctx.beginPath();
          ctx.arc(px, py, 2.4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(107,114,128,${0.6 + linkFlash.current * 0.3})`;
          ctx.shadowColor = "rgba(107,114,128,0.4)";
          ctx.shadowBlur = 6;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // Nodes
      for (const b of ordered) {
        const n = nodes.current.get(b.id);
        if (!n) continue;
        const p = Math.min(1, (t - n.born) / 900);
        const ease = 1 - Math.pow(1 - p, 3);
        const wob = Math.sin(t / 1900 + n.phase) * 5;
        n.x = n.sx + (n.tx - n.sx) * ease + wob + breathX;
        n.y =
          n.sy +
          (n.ty - n.sy) * ease +
          Math.cos(t / 2300 + n.phase) * 4 +
          breathY;

        const conf = b.confidence;
        const r = (5 + conf * 13) * (0.4 + 0.6 * ease);
        const col = agentColor(b.source_agent);

        // Halo - softer alpha
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 4);
        g.addColorStop(0, col + "40");
        g.addColorStop(1, col + "00");
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 4, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.35 + conf * 0.6;
        ctx.shadowColor = col;
        ctx.shadowBlur = 18 * conf + 6;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        // Inner white dot
        ctx.beginPath();
        ctx.arc(n.x, n.y, Math.max(1.5, r * 0.28), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fill();

        // Corroboration orbit ring (rotating dashed) - gray
        if (b.corroborated_by.length > 0) {
          const orbitR = r + 6 + Math.sin(t / 500) * 1.5;
          const rotation = t / 2000;
          ctx.save();
          ctx.translate(n.x, n.y);
          ctx.rotate(rotation);
          ctx.beginPath();
          ctx.arc(0, 0, orbitR, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(107,114,128,0.5)";
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1.6;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
      }

      // Birth rings - gray fading
      birthRings.current = birthRings.current.filter((br) => t - br.t0 < 400);
      for (const br of birthRings.current) {
        const prog = (t - br.t0) / 400;
        ctx.beginPath();
        ctx.arc(br.x + breathX, br.y + breathY, 5 + prog * 30, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(107,114,128,${(1 - prog) * 0.6})`;
        ctx.lineWidth = 2 * (1 - prog);
        ctx.stroke();
      }

      // Correction shockwaves - slightly stronger alpha
      waves.current = waves.current.filter((wv) => t - wv.t0 < 1200);
      for (const wv of waves.current) {
        const elapsed = t - wv.t0;
        if (elapsed < 0) continue;
        const prog = elapsed / 1200;
        const maxRadius = 180 + wv.ring * 40;
        const radius = 10 + prog * maxRadius;

        ctx.save();
        ctx.beginPath();
        ctx.arc(wv.x + breathX, wv.y + breathY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = wv.color;
        ctx.globalAlpha = (1 - prog) * 0.85;
        ctx.lineWidth = (4 - wv.ring) * (1 - prog) + 1;
        ctx.shadowColor = wv.color;
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // Agent-color flashes (instead of white-hot)
      flashes.current = flashes.current.filter((fl) => t - fl.t0 < 600);
      for (const fl of flashes.current) {
        const prog = (t - fl.t0) / 600;
        const flashAlpha = Math.pow(1 - prog, 2) * 0.9;
        const flashR = 8 + prog * 25;

        ctx.save();
        const grad = ctx.createRadialGradient(
          fl.x + breathX,
          fl.y + breathY,
          0,
          fl.x + breathX,
          fl.y + breathY,
          flashR
        );
        grad.addColorStop(0, fl.color);
        grad.addColorStop(0.5, fl.color + "80");
        grad.addColorStop(1, fl.color + "00");
        ctx.beginPath();
        ctx.arc(fl.x + breathX, fl.y + breathY, flashR, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.globalAlpha = flashAlpha;
        ctx.fill();
        ctx.restore();
      }

      // Light trails (bezier arcs with traveling pulses)
      trails.current = trails.current.filter((tr) => t - tr.t0 < 1200);
      for (const tr of trails.current) {
        const fromNode = nodes.current.get(tr.fromId);
        const toNode = nodes.current.get(tr.toId);
        if (!fromNode || !toNode) continue;

        const fx = fromNode.x + breathX;
        const fy = fromNode.y + breathY;
        const tx = toNode.x + breathX;
        const ty = toNode.y + breathY;

        const mx = (fx + tx) / 2;
        const my = (fy + ty) / 2;
        const dx = tx - fx;
        const dy = ty - fy;
        const perpX = -dy * 0.3;
        const perpY = dx * 0.3;
        const cx = mx + perpX;
        const cy = my + perpY;

        const trailProg = (t - tr.t0) / 1200;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.quadraticCurveTo(cx, cy, tx, ty);
        ctx.strokeStyle = tr.color + Math.floor((1 - trailProg) * 80).toString(16).padStart(2, "0");
        ctx.lineWidth = 1.5;
        ctx.stroke();

        for (const pulseOffset of tr.pulses) {
          const pulseProg = Math.min(1, (t - tr.t0) / 800 - pulseOffset * 0.3);
          if (pulseProg < 0 || pulseProg > 1) continue;

          const tt = pulseProg;
          const px =
            (1 - tt) * (1 - tt) * fx + 2 * (1 - tt) * tt * cx + tt * tt * tx;
          const py =
            (1 - tt) * (1 - tt) * fy + 2 * (1 - tt) * tt * cy + tt * tt * ty;

          ctx.save();
          ctx.beginPath();
          ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fillStyle = tr.color;
          ctx.shadowColor = tr.color;
          ctx.shadowBlur = 12;
          ctx.globalAlpha = 0.9;
          ctx.fill();
          ctx.restore();
        }
      }

      // Vignette pulses - soft colored edge glow
      vignettePulses.current = vignettePulses.current.filter(
        (vp) => t - vp.t0 < 150
      );
      for (const vp of vignettePulses.current) {
        const prog = (t - vp.t0) / 150;
        const vignetteGrad = ctx.createRadialGradient(
          w / 2,
          h / 2,
          Math.max(w, h) * 0.4,
          w / 2,
          h / 2,
          Math.max(w, h) * 0.8
        );
        vignetteGrad.addColorStop(0, "rgba(255,255,255,0)");
        vignetteGrad.addColorStop(1, vp.color + Math.floor((1 - prog) * 20).toString(16).padStart(2, "0"));
        ctx.fillStyle = vignetteGrad;
        ctx.fillRect(0, 0, w, h);
      }

      // Jev bolts - vivid blue/violet
      bolts.current = bolts.current.filter((bl) => t - bl.t0 < 450);
      for (const bl of bolts.current) {
        const prog = (t - bl.t0) / 450;

        ctx.save();
        ctx.globalAlpha = 1 - prog;
        ctx.strokeStyle = "#4d8dff";
        ctx.lineWidth = 3;
        ctx.shadowColor = "#4d8dff";
        ctx.shadowBlur = 25;

        // Main bolt
        ctx.beginPath();
        if (bl.segments.length > 0) {
          ctx.moveTo(bl.segments[0].x, bl.segments[0].y);
          for (let i = 1; i < bl.segments.length; i++) {
            ctx.lineTo(bl.segments[i].x, bl.segments[i].y);
          }
        }
        ctx.stroke();

        // Branches
        ctx.lineWidth = 2;
        ctx.shadowBlur = 15;
        for (const branch of bl.branches) {
          if (branch.length > 0) {
            ctx.beginPath();
            ctx.moveTo(branch[0].x, branch[0].y);
            for (let i = 1; i < branch.length; i++) {
              ctx.lineTo(branch[i].x, branch[i].y);
            }
            ctx.stroke();
          }
        }

        // Impact ring
        const impactR = 5 + prog * 40;
        ctx.beginPath();
        ctx.arc(bl.x + breathX, bl.y + breathY, impactR, 0, Math.PI * 2);
        ctx.strokeStyle = "#4d8dff";
        ctx.lineWidth = 2 * (1 - prog);
        ctx.stroke();

        ctx.restore();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [links, ordered]);

  const avg =
    ordered.length > 0
      ? Math.round(
          (ordered.reduce((s, b) => s + b.confidence, 0) / ordered.length) * 100
        )
      : 0;

  const last = events[0];
  const stateLabel =
    last && Date.now() - new Date(last.created_at).getTime() < 9000
      ? last.kind === "correction"
        ? { t: "CORRECTING", c: "#b45309", dot: "#fbbf24" }
        : last.kind === "contribution"
          ? { t: "LEARNING", c: "#15803d", dot: "#4ade80" }
          : last.kind === "prediction"
            ? { t: "PREDICTING", c: "#4d8dff", dot: "#4d8dff" }
            : { t: "DORMANT", c: "#6b7280", dot: "#a1a1aa" }
      : { t: ordered.length === 0 ? "DORMANT" : "STABLE", c: "#6b7280", dot: "#a1a1aa" };

  return (
    <div ref={wrapRef} className="relative w-full h-full overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0" />
      {/* Overlay typography */}
      <div className="pointer-events-none absolute top-5 left-6">
        <div
          className="text-[13px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: "#6b7280" }}
        >
          shared mind
        </div>
        <div
          className="tabular text-6xl font-black leading-none mt-1"
          style={{ color: "#0f0f14" }}
        >
          {ordered.length}
          <span
            className="text-2xl font-bold ml-2"
            style={{ color: "#a1a1aa" }}
          >
            nodes
          </span>
        </div>
        <div
          className="tabular font-mono text-base mt-1"
          style={{ color: "#6b7280" }}
        >
          avg confidence {avg}%
        </div>
        {/* Gradient hairline */}
        <div
          className="mt-3 h-px w-32"
          style={{
            background:
              "linear-gradient(90deg, #fbbf24, #fb7185 45%, #a78bfa 75%, #4d8dff)",
            opacity: 0.5,
          }}
        />
      </div>
      <div className="pointer-events-none absolute top-6 right-6">
        <span
          className="rounded-full px-5 py-2 text-[14px] font-bold tracking-[0.12em] flex items-center gap-2"
          style={{
            color: stateLabel.c,
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: "#ececef",
            background: "#ffffff",
            boxShadow: "0 1px 2px rgba(16,16,24,.04), 0 4px 12px -4px rgba(16,16,24,.06)",
          }}
        >
          <span
            className="w-2 h-2 rounded-full animate-pulse"
            style={{
              backgroundColor: stateLabel.dot,
            }}
          />
          {stateLabel.t}
        </span>
      </div>
      <div
        className="pointer-events-none absolute bottom-4 left-6 flex items-center gap-4 text-[13px]"
        style={{ color: "#6b7280" }}
      >
        <span className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full inline-block"
            style={{ backgroundColor: "#a1a1aa" }}
          />{" "}
          node = belief · glow = confidence
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="w-4 h-px inline-block"
            style={{ backgroundColor: "#a1a1aa" }}
          />{" "}
          line = corroboration
        </span>
      </div>
    </div>
  );
}
