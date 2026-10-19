// A flat drawing of the item in the chosen colour, so the seller can see at a
// glance they picked "burgundy hoodie" and not "black zip-up". The shape is
// guessed from the product name; anything unknown gets a price-tag shape.

type Kind = "zip" | "hoodie" | "crew" | "tee" | "tote" | "cap" | "bottle" | "tag";

export function kindOf(name: string): Kind {
  const n = name.toLowerCase();
  if (/zip/.test(n)) return "zip";
  if (/hood/.test(n)) return "hoodie";
  if (/crew|sweat|jumper|long.?sleeve/.test(n)) return "crew";
  if (/t-?shirt|tee|polo|jersey|top/.test(n)) return "tee";
  if (/tote|bag/.test(n)) return "tote";
  if (/cap|hat|beanie/.test(n)) return "cap";
  if (/bottle|mug|cup|thermos/.test(n)) return "bottle";
  return "tag";
}

/** Dark or light outline, whichever shows against the fill. */
function edge(hex: string) {
  const v = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
  return lum > 0.55 ? "rgba(22,23,26,.55)" : "rgba(255,255,255,.35)";
}

const BODY_LONG = "M30 20 L42 15 Q50 21 58 15 L70 20 Q84 26 87 40 L94 76 L82 79 L74 48 L74 90 L26 90 L26 48 L18 79 L6 76 L13 40 Q16 26 30 20 Z";
const BODY_TEE = "M30 18 L42 14 Q50 22 58 14 L70 18 L88 32 L78 44 L70 38 L70 88 L30 88 L30 38 L22 44 L12 32 Z";

export default function Garment({ name, hex, size = 96 }: { name: string; hex: string; size?: number }) {
  const k = kindOf(name);
  const line = edge(hex);
  const common = { fill: hex, stroke: line, strokeWidth: 1.6, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" className="garment">
      {k === "tee" && <path d={BODY_TEE} {...common} />}
      {k === "crew" && (
        <>
          <path d={BODY_LONG} {...common} />
          <path d="M42 15 Q50 23 58 15" fill="none" stroke={line} strokeWidth={3} />
          <path d="M26 86 H74" stroke={line} strokeWidth={1.2} />
        </>
      )}
      {(k === "hoodie" || k === "zip") && (
        <>
          <path d="M34 26 Q32 4 50 4 Q68 4 66 26 Z" {...common} />
          <path d={BODY_LONG} {...common} />
          <path d="M38 17 Q50 30 62 17 Q58 10 50 10 Q42 10 38 17 Z" fill={line} opacity={0.35} />
          {k === "hoodie"
            ? <path d="M36 64 H64 L60 80 H40 Z" fill="none" stroke={line} strokeWidth={1.4} />
            : <>
                <path d="M50 24 V90" stroke={line} strokeWidth={2} />
                <path d="M34 66 L42 66 M58 66 L66 66" stroke={line} strokeWidth={1.4} />
              </>}
          <path d="M46 26 L45 38 M54 26 L55 38" stroke={line} strokeWidth={1.2} />
          <path d="M26 86 H74" stroke={line} strokeWidth={1.2} />
        </>
      )}
      {k === "tote" && (
        <>
          <path d="M36 34 Q36 10 50 10 Q64 10 64 34" fill="none" stroke={hex} strokeWidth={5} />
          <path d="M36 34 Q36 10 50 10 Q64 10 64 34" fill="none" stroke={line} strokeWidth={1} />
          <path d="M20 32 H80 L76 90 H24 Z" {...common} />
        </>
      )}
      {k === "cap" && (
        <>
          <path d="M18 62 Q18 26 50 26 Q82 26 82 62 Z" {...common} />
          <path d="M18 62 Q50 56 82 62 Q92 64 94 72 Q60 66 18 70 Z" {...common} />
          <circle cx="50" cy="26" r="3" fill={line} />
          <path d="M50 28 V60" stroke={line} strokeWidth={1.2} />
        </>
      )}
      {k === "bottle" && (
        <>
          <rect x="40" y="8" width="20" height="12" rx="3" {...common} />
          <path d="M36 24 Q36 20 42 20 H58 Q64 20 64 24 V88 Q64 92 60 92 H40 Q36 92 36 88 Z" {...common} />
        </>
      )}
      {k === "tag" && (
        <>
          <path d="M14 50 L40 18 H86 V82 H40 Z" {...common} />
          <circle cx="34" cy="50" r="5" fill="none" stroke={line} strokeWidth={2} />
        </>
      )}
    </svg>
  );
}
