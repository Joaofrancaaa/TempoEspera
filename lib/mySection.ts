import type { SavedSection } from "@/lib/types";

const STORAGE_KEY = "fila:minha-secao";

export function readMySection(): SavedSection | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedSection>;
    if (!parsed.zona || !parsed.secao) return null;
    return { zona: String(parsed.zona), secao: String(parsed.secao) };
  } catch {
    return null;
  }
}

export function writeMySection(value: SavedSection): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // modo privado pode bloquear; a escolha continua nesta sessão
  }
}

export function cooldownStorageKey(uid: string, filaKey: string): string {
  return `fila:last:${uid}:${filaKey}`;
}

export function readCooldown(uid: string, filaKey: string): number {
  try {
    return Number(localStorage.getItem(cooldownStorageKey(uid, filaKey)) || 0) || 0;
  } catch {
    return 0;
  }
}

export function writeCooldown(uid: string, filaKey: string, ts: number): void {
  try {
    localStorage.setItem(cooldownStorageKey(uid, filaKey), String(ts));
  } catch {
    // as rules continuam valendo no servidor
  }
}
