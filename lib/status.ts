import type { Level, Report, Status } from "./types";

export const VOTE_WINDOW_MS = 30 * 60 * 1000;
export const STALE_MS = 45 * 60 * 1000;
export const COOLDOWN_MS = 10 * 60 * 1000;

export const STATUS_LABEL: Record<Status, string> = {
  vazio: "Sem fila",
  moderado: "Fila moderada",
  demorado: "Fila grande",
  sem_dados: "Sem dados",
};

export const STATUS_EMOJI: Record<Status, string> = {
  vazio: "🟢",
  moderado: "🟡",
  demorado: "🔴",
  sem_dados: "⚪",
};

export const STATUS_COLOR: Record<Status, string> = {
  vazio: "#22c55e",
  moderado: "#eab308",
  demorado: "#ef4444",
  sem_dados: "#9ca3af",
};

export const STATUS_BADGE: Record<Status, string> = {
  vazio: "bg-green-100 text-green-800",
  moderado: "bg-yellow-100 text-yellow-900",
  demorado: "bg-red-100 text-red-800",
  sem_dados: "bg-zinc-200 text-zinc-600",
};

export type StatusResult = {
  status: Status;
  updatedAt: number | null;
  recentCount: number;
};

export type StationStatusResult = StatusResult & {
  secoesComRelato: number;
};

export function isLevel(value: unknown): value is Level {
  return value === "vazio" || value === "moderado" || value === "demorado";
}

export function makeFilaKey(zona: string, principal: string): string {
  return `${zona}-${principal}`;
}

export function makeReportKey(uid: string, filaKey: string): string {
  return `${uid}_${filaKey}`;
}

function isFreshEnough(ts: number, now: number): boolean {
  const age = now - ts;
  return age <= VOTE_WINDOW_MS && ts - now <= 60_000;
}

function newestOf(reports: Report[]): Report {
  return reports.reduce((best, report) => (report.ts > best.ts ? report : best));
}

/**
 * Relatos válidos: últimos 30 min.
 * Status = nível mais votado; empate fica com o mais recente entre os empatados.
 * Sem relatos, ou o mais recente com mais de 45 min: sem dados.
 * Entre 30 e 45 min não há voto na janela, mas o último relato ainda vale.
 */
export function voteStatus(reports: Report[], now: number): StatusResult {
  if (reports.length === 0) {
    return { status: "sem_dados", updatedAt: null, recentCount: 0 };
  }

  const newest = newestOf(reports);
  const recent = reports.filter((report) => isFreshEnough(report.ts, now));

  if (now - newest.ts > STALE_MS) {
    return { status: "sem_dados", updatedAt: newest.ts, recentCount: recent.length };
  }

  if (recent.length === 0) {
    return { status: newest.level, updatedAt: newest.ts, recentCount: 0 };
  }

  const counts: Record<Level, number> = { vazio: 0, moderado: 0, demorado: 0 };
  for (const report of recent) counts[report.level] += 1;

  const max = Math.max(counts.vazio, counts.moderado, counts.demorado);
  const tied = (Object.keys(counts) as Level[]).filter((level) => counts[level] === max);

  if (tied.length === 1) {
    return { status: tied[0], updatedAt: newest.ts, recentCount: recent.length };
  }

  const winner = recent
    .filter((report) => tied.includes(report.level))
    .sort((a, b) => b.ts - a.ts)[0];

  return { status: winner.level, updatedAt: newest.ts, recentCount: recent.length };
}

export function computeFilaStatus(reports: Report[], now: number): StatusResult {
  return voteStatus(reports, now);
}

export function computeStationStatus(reports: Report[], now: number): StationStatusResult {
  const base = voteStatus(reports, now);
  const byFila = new Map<string, Report[]>();
  for (const report of reports) {
    const group = byFila.get(report.filaKey);
    if (group) group.push(report);
    else byFila.set(report.filaKey, [report]);
  }

  let secoesComRelato = 0;
  for (const group of byFila.values()) {
    if (voteStatus(group, now).status !== "sem_dados") secoesComRelato += 1;
  }

  return { ...base, secoesComRelato };
}

export function minutesAgo(ts: number, now: number): number {
  return Math.max(0, Math.floor((now - ts) / 60_000));
}

export function formatUpdated(ts: number | null, now: number): string {
  if (ts == null) return "sem atualização";
  const minutes = minutesAgo(ts, now);
  if (minutes < 1) return "atualizado agora";
  if (minutes === 1) return "atualizado há 1 min";
  return `atualizado há ${minutes} min`;
}

export function formatHa(minutes: number | null): string {
  if (minutes == null) return "há — min";
  if (minutes === 1) return "há 1 min";
  return `há ${minutes} min`;
}

export function formatEleitores(count: number): string {
  const formatted = new Intl.NumberFormat("pt-BR").format(count);
  return `${formatted} eleitores neste local`;
}

export function formatRecentCount(count: number): string {
  if (count === 0) return "nenhum relato recente";
  if (count === 1) return "1 relato recente";
  return `${count} relatos recentes`;
}

export function formatSecoesComRelato(count: number): string {
  if (count === 0) return "nenhuma seção com relatos";
  if (count === 1) return "1 seção com relatos";
  return `${count} seções com relatos`;
}

export function formatZonas(zonas: string[]): string {
  if (zonas.length === 0) return "";
  if (zonas.length === 1) return `Zona ${zonas[0]}`;
  return `Zonas ${zonas.join(", ")}`;
}

export function buildShareText(
  local: string,
  status: Status,
  minutes: number | null,
  url: string,
  section?: { zona: string; secao: string } | null,
): string {
  const when = minutes == null ? "—" : String(minutes);
  const statusLabel = STATUS_LABEL[status];
  if (section) {
    return `Fila na seção ${section.secao} (Zona ${section.zona}) — ${local}: ${statusLabel}, atualizado há ${when} min. Veja em ${url}`;
  }
  return `Fila no ${local}: ${statusLabel}, atualizado há ${when} min. Veja em ${url}`;
}

export function cooldownRemaining(lastTs: number | null, now: number): number {
  if (lastTs == null || lastTs <= 0) return 0;
  return Math.max(0, COOLDOWN_MS - (now - lastTs));
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatTimeFortaleza(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
