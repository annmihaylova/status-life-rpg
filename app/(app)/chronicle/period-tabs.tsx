"use client";

import { useState, type ReactNode } from "react";
import { Chip } from "@/components/ui/primitives";

/** Переключатель «неделя / месяц»: содержимое отрисовано на сервере. */
export function PeriodTabs({ labels, panels }: { labels: string[]; panels: ReactNode[] }) {
  const [i, setI] = useState(0);
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {labels.map((l, k) => (
          <Chip key={l} selected={i === k} onClick={() => setI(k)}>
            {l}
          </Chip>
        ))}
      </div>
      {panels[i]}
    </div>
  );
}
