import { useEffect, useState } from "react";
import { cn } from "../lib/utils";

interface CompanyPatternIconProps {
  companyName: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  className?: string;
}

/**
 * Deterministic palette of solid avatar colors, drawn from the app's
 * sage + rose + taupe design tokens. Each entry pairs a background
 * with a foreground that reads well at small sizes.
 *
 * Replaces the previous dithered/grainy pattern generator so avatars
 * feel like a proper brand mark rather than noise.
 */
const AVATAR_PALETTE: ReadonlyArray<{ bg: string; fg: string }> = [
  { bg: "#7C9470", fg: "#FFFFFF" }, // sage-ink
  { bg: "#8FA781", fg: "#FFFFFF" }, // primary sage
  { bg: "#B5C4B1", fg: "#2F3B2D" }, // sage-mist
  { bg: "#D9A5A5", fg: "#4A2626" }, // rose-soft
  { bg: "#B76E79", fg: "#FFFFFF" }, // rose-deep
  { bg: "#F0DCB4", fg: "#4A3A1F" }, // butter
  { bg: "#C8C0B4", fg: "#2F2C25" }, // taupe
  { bg: "#A49882", fg: "#FFFFFF" }, // taupe-deep
  { bg: "#E9E2D1", fg: "#4F4637" }, // cream
  { bg: "#6B8E6B", fg: "#FFFFFF" }, // deep sage
];

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickSolid(seed: string): { bg: string; fg: string } {
  const idx = hashString(seed) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx]!;
}

/** Choose readable foreground from a given hex based on its perceived luminance. */
function readableForeground(hex: string): string {
  const clean = hex.trim().replace("#", "");
  if (clean.length !== 3 && clean.length !== 6) return "#FFFFFF";
  const expand = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean;
  const r = parseInt(expand.slice(0, 2), 16) / 255;
  const g = parseInt(expand.slice(2, 4), 16) / 255;
  const b = parseInt(expand.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.62 ? "#2F2C25" : "#FFFFFF";
}

function resolveColors(
  companyName: string,
  brandColor: string | null | undefined,
): { bg: string; fg: string } {
  if (brandColor && /^#?[0-9a-fA-F]{3,6}$/.test(brandColor.trim())) {
    const bg = brandColor.trim().startsWith("#") ? brandColor.trim() : `#${brandColor.trim()}`;
    return { bg, fg: readableForeground(bg) };
  }
  return pickSolid(companyName.trim().toLowerCase());
}

export function CompanyPatternIcon({
  companyName,
  logoUrl,
  brandColor,
  className,
}: CompanyPatternIconProps) {
  const initial = companyName.trim().charAt(0).toUpperCase() || "?";
  const [imageError, setImageError] = useState(false);
  const logo =
    !imageError && typeof logoUrl === "string" && logoUrl.trim().length > 0 ? logoUrl : null;

  useEffect(() => {
    setImageError(false);
  }, [logoUrl]);

  const { bg, fg } = resolveColors(companyName, brandColor);

  return (
    <div
      className={cn(
        "relative flex items-center justify-center w-11 h-11 text-base font-semibold overflow-hidden",
        className,
      )}
      style={logo ? undefined : { backgroundColor: bg, color: fg }}
    >
      {logo ? (
        <img
          src={logo}
          alt={`${companyName} logo`}
          onError={() => setImageError(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span className="relative z-10 tracking-tight">{initial}</span>
      )}
    </div>
  );
}
