"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { chooseSideClass } from "@/app/actions/game";
import { useSystem } from "@/components/game/system-messages";
import { Button, Chip } from "@/components/ui/primitives";

/** Смежный класс: дополнение к основному, человек выбирает его сам из предложенных Системой. */
export function SideClassPicker({
  main,
  side,
  options,
}: {
  main: string | null;
  side: { key: string; name: string } | null;
  options: { key: string; name: string }[];
}) {
  const t = useTranslations("classes");
  const router = useRouter();
  const { run, pending } = useSystem();
  const choose = (key: string | null) =>
    run(async () => {
      const r = await chooseSideClass(key);
      if (!r.error) router.refresh();
      return r;
    });

  if (!main) return <p className="text-sm text-muted">{t("locked")}</p>;
  return (
    <div className="space-y-3">
      <p>
        <span className="text-xs text-muted">{t("main")}: </span>
        <span className="font-mono text-accent">{main}</span>
      </p>
      {side ? (
        <div className="flex items-center justify-between gap-2">
          <p>
            <span className="text-xs text-muted">{t("side")}: </span>
            <span className="font-mono text-star">{side.name}</span>
          </p>
          <Button variant="outline" disabled={pending} onClick={() => choose(null)}>
            {t("drop")}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted">{t("sideHint")}</p>
      )}
      {options.filter((o) => o.key !== side?.key).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {options
            .filter((o) => o.key !== side?.key)
            .map((o) => (
              <Chip key={o.key} disabled={pending} onClick={() => choose(o.key)}>
                {t("take", { name: o.name })}
              </Chip>
            ))}
        </div>
      )}
      <p className="text-xs text-muted">{t("about")}</p>
    </div>
  );
}
