import { haversineMeters } from "../lib/geo";
import { computeFilaStatus, computeStationStatus } from "../lib/status";
import type { Report } from "../lib/types";

const now = 1_000_000_000_000;
const min = 60_000;

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function report(uid: string, filaKey: string, level: Report["level"], ts: number): Report {
  return { uid, filaKey, level, ts };
}

let result = computeStationStatus([], now);
assert(result.status === "sem_dados", "vazio deveria ser sem dados");
assert(result.secoesComRelato === 0, "sem seções");

result = computeStationStatus(
  [
    report("a", "65-0001", "vazio", now - 5 * min),
    report("b", "65-0001", "vazio", now - 4 * min),
    report("c", "65-0002", "demorado", now - 1 * min),
  ],
  now,
);
assert(result.status === "vazio", `maioria vazio, veio ${result.status}`);
assert(result.secoesComRelato === 2, `duas filas, veio ${result.secoesComRelato}`);

const fila = computeFilaStatus(
  [
    report("a", "65-0001", "vazio", now - 10 * min),
    report("b", "65-0001", "moderado", now - 9 * min),
    report("c", "65-0001", "vazio", now - 3 * min),
    report("d", "65-0001", "moderado", now - 2 * min),
  ],
  now,
);
assert(fila.status === "moderado", `empate deveria ser o mais recente, veio ${fila.status}`);

result = computeStationStatus([report("a", "65-0001", "demorado", now - 50 * min)], now);
assert(result.status === "sem_dados", "mais de 45 min deveria ser sem dados");
assert(result.secoesComRelato === 0, "fila velha não conta");

result = computeStationStatus([report("a", "65-0001", "moderado", now - 40 * min)], now);
assert(result.status === "moderado", "entre 30 e 45 min deveria manter o último nível");
assert(result.recentCount === 0, "janela de 30 min deveria estar vazia");
assert(result.secoesComRelato === 1, "fila ainda válida conta");

result = computeStationStatus(
  [
    report("a", "65-0001", "vazio", now - 40 * min),
    report("b", "65-0002", "demorado", now - 5 * min),
    report("c", "65-0002", "demorado", now - 4 * min),
  ],
  now,
);
assert(result.status === "demorado", "voto antigo não entra na contagem do local");
assert(result.recentCount === 2, "contagem recente");
assert(result.secoesComRelato === 2, "as duas filas ainda têm status");

const same = haversineMeters({ lat: -5.5265, lng: -47.4766 }, { lat: -5.5265, lng: -47.4766 });
assert(same < 1, `distância zero veio ${same}`);

const near = haversineMeters({ lat: -5.5265, lng: -47.4766 }, { lat: -5.5301, lng: -47.4766 });
assert(near > 350 && near < 450, `400 m aproximados veio ${near}`);

console.log("regras ok", { near: Math.round(near) });
