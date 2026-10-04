import locais from "@/data/locais.json";
import { computeFilaStatus, makeFilaKey, minutesAgo } from "@/lib/status";
import type { FilaView, Report, SavedSection, Secao, Station } from "@/lib/types";

type RawSecao = {
  zona?: unknown;
  secao?: unknown;
  eleitores?: unknown;
  principal?: unknown;
};

type RawLocal = {
  id?: unknown;
  name?: unknown;
  bairro?: unknown;
  endereco?: unknown;
  lat?: unknown;
  lng?: unknown;
  zonas?: unknown;
  totalSecoes?: unknown;
  eleitores?: unknown;
  secoes?: unknown;
};

function asSecao(value: RawSecao): Secao | null {
  const zona = String(value.zona ?? "");
  const secao = String(value.secao ?? "");
  const principal = String(value.principal ?? "");
  if (!zona || !secao || !principal) return null;
  return {
    zona,
    secao,
    principal,
    eleitores: Number(value.eleitores ?? 0) || 0,
  };
}

function asStation(value: RawLocal): Station | null {
  const id = String(value.id ?? "");
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const secoes = Array.isArray(value.secoes)
    ? value.secoes
        .map((item) => asSecao(item as RawSecao))
        .filter((item): item is Secao => item !== null)
    : [];

  const zonas = Array.isArray(value.zonas)
    ? value.zonas.map((zona) => String(zona))
    : Array.from(new Set(secoes.map((item) => item.zona)));

  return {
    id,
    name: String(value.name ?? ""),
    bairro: String(value.bairro ?? ""),
    endereco: String(value.endereco ?? ""),
    lat,
    lng,
    zonas,
    totalSecoes: Number(value.totalSecoes ?? secoes.length) || secoes.length,
    eleitores: Number(value.eleitores ?? 0) || 0,
    secoes,
    reports: {},
  };
}

let cached: Station[] | null = null;

export function loadCatalog(): Station[] {
  if (cached) return cached;
  cached = (locais as RawLocal[])
    .map((item) => asStation(item))
    .filter((item): item is Station => item !== null);
  return cached;
}

export function findSecao(station: Station, zona: string, secao: string): Secao | null {
  return station.secoes.find((item) => item.zona === zona && item.secao === secao) ?? null;
}

export function findStationForSection(
  stations: Station[],
  zona: string,
  secao: string,
): Station | null {
  return stations.find((station) => findSecao(station, zona, secao)) ?? null;
}

export function zonesOf(station: Station): string[] {
  const zones = Array.from(new Set(station.secoes.map((item) => item.zona)));
  return zones.length > 0 ? zones : station.zonas;
}

export function filaIdentity(
  station: Station,
  filaKey: string,
): { zona: string; secao: string } | null {
  const principal = station.secoes.find(
    (item) => makeFilaKey(item.zona, item.principal) === filaKey && item.secao === item.principal,
  );
  const any = station.secoes.find((item) => makeFilaKey(item.zona, item.principal) === filaKey);
  const chosen = principal ?? any;
  if (!chosen) return null;
  return { zona: chosen.zona, secao: chosen.principal };
}

function reportsOfFila(reports: Record<string, Report>, filaKey: string): Report[] {
  return Object.values(reports).filter((report) => report.filaKey === filaKey);
}

export function listFilas(station: Station, now: number, mine: SavedSection | null): FilaView[] {
  const groups = new Map<string, Report[]>();
  for (const report of Object.values(station.reports)) {
    const group = groups.get(report.filaKey);
    if (group) group.push(report);
    else groups.set(report.filaKey, [report]);
  }

  const mineSecao = mine ? findSecao(station, mine.zona, mine.secao) : null;
  const mineFila = mineSecao ? makeFilaKey(mineSecao.zona, mineSecao.principal) : null;
  const rows: FilaView[] = [];
  const seen = new Set<string>();

  if (mineSecao && mineFila) {
    const result = computeFilaStatus(groups.get(mineFila) ?? [], now);
    rows.push({
      filaKey: mineFila,
      zona: mineSecao.zona,
      secao: mineSecao.secao,
      status: result.status,
      minutes: result.updatedAt == null ? null : minutesAgo(result.updatedAt, now),
      updatedAt: result.updatedAt,
      isMine: true,
    });
    seen.add(mineFila);
  }

  const others: FilaView[] = [];
  for (const [filaKey, reports] of groups) {
    if (seen.has(filaKey)) continue;
    const result = computeFilaStatus(reports, now);
    if (result.status === "sem_dados") continue;
    const identity = filaIdentity(station, filaKey);
    if (!identity) continue;
    others.push({
      filaKey,
      zona: identity.zona,
      secao: identity.secao,
      status: result.status,
      minutes: result.updatedAt == null ? null : minutesAgo(result.updatedAt, now),
      updatedAt: result.updatedAt,
      isMine: false,
    });
  }

  others.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return [...rows, ...others];
}

export function reportsForFila(station: Station, filaKey: string): Report[] {
  return reportsOfFila(station.reports, filaKey);
}
