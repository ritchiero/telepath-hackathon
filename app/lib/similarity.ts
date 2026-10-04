// Tokenización + similitud Jaccard. Sin dependencias de Node: se usa igual
// en el servidor (motor de la mente) y en el cliente (canvas de la red).
const STOP = new Set(
  "de la el en y que los del se las por un para con no una su al lo como mas pero sus le ya o este esta esto son fue han hay ser está están tienen tiene puede pueden cada cuando donde porque tan muy sin sobre entre hasta desde todo todos también tras otro otra unos unas qué quién cuál cómo dónde cuándo cuánto".split(
    " "
  )
);

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

export function jaccard(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}
