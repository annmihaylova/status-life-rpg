"use client";

import { BookOpen, LayoutDashboard, Mic, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/components/ui/primitives";

const items = [
  { href: "/", key: "status", Icon: LayoutDashboard },
  { href: "/skills", key: "skills", Icon: Sparkles },
  { href: "/log", key: "log", Icon: Plus },
  { href: "/checkin", key: "checkin", Icon: Mic },
  { href: "/journal", key: "journal", Icon: BookOpen },
] as const;

export function BottomNav() {
  const t = useTranslations("nav");
  const path = usePathname();
  return (
    <nav
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-panel-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-md justify-around">
        {items.map(({ href, key, Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 min-w-14 flex-col items-center justify-center gap-0.5 text-xs",
                  active ? "text-accent" : "text-muted",
                )}
              >
                <Icon aria-hidden size={key === "log" ? 26 : 20} />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
