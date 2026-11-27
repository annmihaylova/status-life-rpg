import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "ghost" | "outline" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-black font-medium hover:brightness-110",
  outline: "border border-panel-border hover:border-accent",
  ghost: "text-muted hover:text-foreground",
  danger: "border border-hp/60 text-hp hover:bg-hp/10",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm transition disabled:opacity-50",
        variants[variant],
        className,
      )}
    />
  );
}

export function Chip({
  selected,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...props}
      className={cn(
        "min-h-10 rounded-full border px-3 py-1.5 text-sm transition",
        selected
          ? "border-accent bg-accent/15 text-foreground shadow-[0_0_12px_-4px_var(--glow)]"
          : "border-panel-border text-muted hover:text-foreground",
        className,
      )}
    />
  );
}

export function Panel({
  title,
  children,
  className,
  action,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={cn("system-panel p-4", className)}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="font-mono text-xs uppercase tracking-widest text-muted">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Bar({
  value,
  max,
  color = "var(--xp)",
  label,
  className,
}: {
  value: number;
  max: number;
  color?: string;
  label: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (100 * value) / max)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      className={cn("h-2 overflow-hidden rounded-full bg-white/10", className)}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
        style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}` }}
      />
    </div>
  );
}

/** 10 звёзд прогресса к следующему очку характеристики. */
export function Stars({ count, label }: { count: number; label: string }) {
  return (
    <div className="flex gap-0.5" role="img" aria-label={label}>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={cn("text-xs", i < count ? "text-star" : "text-white/15")} aria-hidden>
          ★
        </span>
      ))}
    </div>
  );
}
