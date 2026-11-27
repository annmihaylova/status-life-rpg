/**
 * 2D-портрет-заглушка до VRM (SPEC 6.2): силуэт и свечение в цвете ведущей характеристики.
 */
export function Portrait({ color, label }: { color: string; label: string }) {
  return (
    <svg viewBox="0 0 80 80" className="h-20 w-20 shrink-0" role="img" aria-label={label}>
      <defs>
        <radialGradient id="pg" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="80" height="80" rx="16" fill="rgb(255 255 255 / 0.04)" stroke={color} strokeOpacity="0.5" />
      <circle cx="40" cy="36" r="34" fill="url(#pg)" />
      <circle cx="40" cy="30" r="12" fill="rgb(232 232 242 / 0.85)" />
      <path d="M16 72c2-14 12-22 24-22s22 8 24 22" fill="rgb(232 232 242 / 0.85)" />
    </svg>
  );
}
