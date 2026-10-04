"use client";

export default function ConfidenceMeter({
  value,
  color = "#4ade80",
  height = "h-2",
}: {
  value: number;
  color?: string;
  height?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className={`${height} flex-1 rounded-full bg-white/10 overflow-hidden`}>
        <div
          className="meter-animated h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}66, ${color})`,
            boxShadow: `0 0 14px ${color}`,
          }}
        />
      </div>
      <span className="tabular font-mono text-sm w-12 text-right text-white/90">{pct}%</span>
    </div>
  );
}
