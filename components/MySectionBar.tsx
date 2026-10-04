"use client";

import { STATUS_LABEL, formatHa } from "@/lib/status";
import type { Status } from "@/lib/types";

export function MySectionBar({
  zona,
  secao,
  placeName,
  status,
  minutes,
  onPress,
}: {
  zona: string | null;
  secao: string | null;
  placeName: string | null;
  status: Status | null;
  minutes: number | null;
  onPress: () => void;
}) {
  const hasSection = Boolean(zona && secao && placeName && status);

  let line = "Escolher minha seção";
  if (hasSection && status === "sem_dados") {
    line = `Zona ${zona} · Seção ${secao} — ${placeName}: Sem dados recentes — seja o primeiro a informar`;
  } else if (hasSection && status) {
    line = `Zona ${zona} · Seção ${secao} — ${placeName}: ${STATUS_LABEL[status]} (${formatHa(minutes)})`;
  }

  return (
    <button
      type="button"
      onClick={onPress}
      className="w-full shrink-0 border-b border-zinc-200 bg-white px-4 py-2.5 text-left active:bg-zinc-50"
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">Minha seção</p>
      <p className="text-sm font-semibold leading-snug text-zinc-900">{line}</p>
    </button>
  );
}
