"use client";

import { ChevronDown, MessageCircle } from "lucide-react";
import { useState } from "react";
import {
  STATUS_BADGE,
  STATUS_COLOR,
  STATUS_EMOJI,
  STATUS_LABEL,
  formatEleitores,
  formatHa,
  formatRecentCount,
  formatSecoesComRelato,
} from "@/lib/status";
import type { StationView } from "@/lib/types";

export function StationCard({
  station,
  selected,
  onSelect,
  cardRef,
}: {
  station: StationView;
  selected: boolean;
  onSelect: (id: string) => void;
  cardRef: (element: HTMLElement | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(station.shareText)}`;
  const canExpand = station.filas.length > 0;

  return (
    <article
      ref={cardRef}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onSelect(station.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(station.id);
        }
      }}
      className={`cursor-pointer rounded-2xl border bg-white p-3 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
        selected ? "border-emerald-600 ring-2 ring-emerald-600" : "border-zinc-200"
      }`}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-1.5 h-3 w-3 shrink-0 rounded-full"
          style={{ background: STATUS_COLOR[station.status] }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-snug">{station.name}</h2>
          <p className="text-sm text-zinc-600">
            {station.bairro}
            {station.zonasLabel ? ` · ${station.zonasLabel}` : ""}
          </p>
          <p className="text-sm text-zinc-500">{station.endereco}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[station.status]}`}>
          {STATUS_LABEL[station.status]}
        </span>
        <span className="text-xs text-zinc-500">{station.updatedLabel}</span>
        {station.distanceLabel && (
          <span className="text-xs font-medium text-zinc-700">a {station.distanceLabel}</span>
        )}
      </div>

      <p className="mt-1 text-xs text-zinc-500">
        {formatRecentCount(station.recentCount)} · {formatEleitores(station.eleitores)}
      </p>

      <button
        type="button"
        aria-expanded={open}
        disabled={!canExpand}
        onClick={(event) => {
          event.stopPropagation();
          if (canExpand) setOpen((value) => !value);
        }}
        className="mt-1 flex items-center gap-1 text-xs font-medium text-zinc-700 disabled:font-normal disabled:text-zinc-500"
      >
        {formatSecoesComRelato(station.secoesComRelato)}
        {canExpand && (
          <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {open && canExpand && (
        <ul className="mt-2 space-y-1 border-t border-zinc-100 pt-2">
          {station.filas.map((fila) => (
            <li key={fila.filaKey} className="text-xs leading-5 text-zinc-700">
              Seção {fila.secao} (Zona {fila.zona}):{" "}
              {fila.status === "sem_dados" ? (
                "sem dados"
              ) : (
                <>
                  {STATUS_EMOJI[fila.status]} {formatHa(fila.minutes)}
                </>
              )}
              {fila.isMine && (
                <span className="ml-1 rounded-full bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-800">
                  Minha seção
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-200 py-2 text-sm font-medium text-zinc-800 active:bg-zinc-50"
      >
        <MessageCircle className="h-4 w-4" />
        Compartilhar no WhatsApp
      </a>
    </article>
  );
}
