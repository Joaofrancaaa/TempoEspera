"use client";

import { FirebaseError } from "firebase/app";
import { doc, FieldPath, serverTimestamp, updateDoc } from "firebase/firestore";
import { Check, Loader2, MapPin, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { findSecao, findStationForSection, zonesOf } from "@/lib/catalog";
import { firebase } from "@/lib/firebase";
import { GEOFENCE_METERS, GPS_ACCURACY_WARN_METERS, formatDistance, haversineMeters } from "@/lib/geo";
import { readCooldown, writeCooldown } from "@/lib/mySection";
import {
  STATUS_LABEL,
  buildShareText,
  cooldownRemaining,
  formatCountdown,
  formatTimeFortaleza,
  makeFilaKey,
  makeReportKey,
} from "@/lib/status";
import type { GeoFix, Level, SavedSection, Secao, Station } from "@/lib/types";

const OPTIONS: { level: Level; emoji: string; label: string; hint: string; className: string }[] = [
  {
    level: "vazio",
    emoji: "🟢",
    label: "Sem fila",
    hint: "",
    className: "border-green-500 bg-green-50 text-green-950",
  },
  {
    level: "moderado",
    emoji: "🟡",
    label: "Moderada",
    hint: "até 30 min",
    className: "border-yellow-400 bg-yellow-50 text-yellow-950",
  },
  {
    level: "demorado",
    emoji: "🔴",
    label: "Grande",
    hint: "mais de 30 min",
    className: "border-red-500 bg-red-50 text-red-950",
  },
];

type Fix = GeoFix & { at: number };

function requestFix(): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          at: Date.now(),
        });
      },
      (error) => reject(error),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
    );
  });
}

function geoErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === "unsupported") {
    return "Este navegador não informa a localização. Dá para ver as filas, sem enviar.";
  }
  const code = typeof error === "object" && error && "code" in error ? Number(error.code) : 0;
  if (code === 1) {
    return "Permissão de localização negada. Ative o GPS nas configurações do navegador para informar a fila. Você ainda pode só visualizar.";
  }
  if (code === 3) {
    return "O GPS demorou para responder. Vá para um lugar aberto e tente de novo.";
  }
  return "Não conseguimos sua localização agora. Você pode continuar só olhando as filas.";
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function ReportModal({
  open,
  onClose,
  stations,
  uid,
  initialFix,
  siteUrl,
  online,
  authError,
  mySection,
  onSaveMySection,
  onShowOnMap,
}: {
  open: boolean;
  onClose: () => void;
  stations: Station[];
  uid: string | null;
  initialFix: GeoFix | null;
  siteUrl: string;
  online: boolean;
  authError: string | null;
  mySection: SavedSection | null;
  onSaveMySection: (value: SavedSection) => void;
  onShowOnMap: (id: string) => void;
}) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(false);
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [pickingPlace, setPickingPlace] = useState(false);
  const [placeFilter, setPlaceFilter] = useState("");
  const [otherMode, setOtherMode] = useState(false);
  const [otherSecao, setOtherSecao] = useState<Secao | null>(null);
  const [replacingMine, setReplacingMine] = useState(false);
  const [zonePick, setZonePick] = useState<string | null>(null);
  const [storedTs, setStoredTs] = useState(0);
  const [tick, setTick] = useState(() => Date.now());
  const [sending, setSending] = useState<Level | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentLevel, setSentLevel] = useState<Level | null>(null);
  const [sentSecao, setSentSecao] = useState<Secao | null>(null);

  useEffect(() => {
    if (!open) return;
    setSentLevel(null);
    setSentSecao(null);
    setFormError(null);
    setPickingPlace(false);
    setPlaceFilter("");
    setChosenId(null);
    setFix(null);
    setGpsMessage(null);
    setOtherMode(false);
    setOtherSecao(null);
    setReplacingMine(false);
    setLocating(true);

    let cancelled = false;
    requestFix()
      .then((next) => {
        if (cancelled) return;
        setFix(next);
        setLocating(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLocating(false);
        setGpsMessage(geoErrorMessage(error));
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const pos = useMemo<Fix | null>(() => {
    if (fix) return fix;
    if (!initialFix) return null;
    return {
      lat: initialFix.lat,
      lng: initialFix.lng,
      accuracy: initialFix.accuracy,
      at: 0,
    };
  }, [fix, initialFix]);

  const ranked = useMemo(() => {
    const rows = stations.map((station) => ({
      station,
      distance: pos ? haversineMeters(pos, station) : null,
    }));
    rows.sort((a, b) => {
      if (a.distance != null && b.distance != null) return a.distance - b.distance;
      return b.station.eleitores - a.station.eleitores;
    });
    return rows;
  }, [pos, stations]);

  const selected = ranked.find((row) => row.station.id === chosenId) ?? ranked[0] ?? null;
  const selectedId = selected?.station.id ?? null;

  useEffect(() => {
    if (!open || chosenId || !pos || !ranked[0]) return;
    setChosenId(ranked[0].station.id);
  }, [chosenId, open, pos, ranked]);
  const mineOnStation =
    selected && mySection ? findSecao(selected.station, mySection.zona, mySection.secao) : null;
  const mineStation = mySection ? findStationForSection(stations, mySection.zona, mySection.secao) : null;
  const activeSecao = otherMode ? otherSecao : replacingMine ? null : mineOnStation;
  const activeFilaKey = activeSecao ? makeFilaKey(activeSecao.zona, activeSecao.principal) : null;
  const zones = selected ? zonesOf(selected.station) : [];
  const sectionChoices = selected
    ? selected.station.secoes
        .filter((item) => (zonePick ? item.zona === zonePick : zones.length === 1))
        .slice()
        .sort((a, b) => a.secao.localeCompare(b.secao, "pt-BR"))
    : [];

  useEffect(() => {
    if (!open || !selectedId) return;
    const station = stations.find((item) => item.id === selectedId);
    if (!station) return;
    const nextZones = zonesOf(station);
    setZonePick(nextZones.length === 1 ? nextZones[0] : null);
    setOtherMode(false);
    setOtherSecao(null);
    setReplacingMine(false);
    // stations entra só para ler as zonas do local escolhido; um snapshot não pode apagar a seção.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedId]);

  useEffect(() => {
    if (!open || !uid || !activeFilaKey) {
      setStoredTs(0);
      return;
    }
    setStoredTs(readCooldown(uid, activeFilaKey));
  }, [activeFilaKey, open, uid]);

  if (!open) return null;

  const distance = selected?.distance ?? null;
  const inside = distance != null && distance <= GEOFENCE_METERS;
  const weakGps = pos?.accuracy != null && pos.accuracy > GPS_ACCURACY_WARN_METERS;
  const serverTs =
    uid && selected && activeFilaKey
      ? selected.station.reports[makeReportKey(uid, activeFilaKey)]?.ts ?? 0
      : 0;
  const lastTs = Math.max(storedTs, serverTs) || null;
  const remaining = cooldownRemaining(lastTs, tick);
  const choosingSection = !activeSecao;
  const canSend = Boolean(
    uid && firebase && online && inside && activeSecao && remaining <= 0 && !locating && pos,
  );

  function chooseSection(secao: Secao) {
    setFormError(null);
    if (otherMode) {
      setOtherSecao(secao);
      return;
    }
    onSaveMySection({ zona: secao.zona, secao: secao.secao });
    setReplacingMine(false);
  }

  async function submit(level: Level) {
    if (!selected || !firebase || !uid || !activeSecao || !activeFilaKey || sending) return;
    if (!/^[A-Za-z0-9]+$/.test(uid)) {
      setFormError("Não foi possível identificar seu acesso. Recarregue a página.");
      return;
    }
    if (!online) {
      setFormError("Você está offline. Conecte-se à internet para enviar.");
      return;
    }

    setSending(level);
    setFormError(null);
    try {
      const current = await requestFix();
      setFix(current);
      const meters = haversineMeters(current, selected.station);
      if (meters > GEOFENCE_METERS) {
        setFormError(
          `Você está a cerca de ${formatDistance(meters)} deste local. Dá para informar a fila só até 400 m. Por enquanto, é só visualizar.`,
        );
        return;
      }

      await updateDoc(
        doc(firebase.db, "stations", selected.station.id),
        new FieldPath("reports", makeReportKey(uid, activeFilaKey)),
        {
          uid,
          filaKey: activeFilaKey,
          level,
          ts: serverTimestamp(),
        },
      );

      const sentAt = Date.now();
      writeCooldown(uid, activeFilaKey, sentAt);
      setStoredTs(sentAt);
      setSentLevel(level);
      setSentSecao(activeSecao);
    } catch (error) {
      if (error instanceof FirebaseError && error.code === "permission-denied") {
        setFormError(
          "O envio foi recusado. Se você acabou de informar esta fila, espere 10 minutos. Se for a primeira vez, confira o login anônimo e se as regras novas do Firestore foram publicadas.",
        );
      } else if (error instanceof FirebaseError && error.code === "not-found") {
        setFormError("Este local ainda não está no servidor. Rode o seed de novo.");
      } else if (error instanceof FirebaseError) {
        setFormError("Não conseguimos enviar agora. Verifique a internet e tente de novo.");
      } else {
        setFormError(geoErrorMessage(error));
      }
    } finally {
      setSending(null);
    }
  }

  const shareHref =
    sentLevel && sentSecao && selected
      ? `https://wa.me/?text=${encodeURIComponent(
          buildShareText(selected.station.name, sentLevel, 0, siteUrl, {
            zona: sentSecao.zona,
            secao: sentSecao.secao,
          }),
        )}`
      : "";

  const filteredPlaces = ranked.filter((row) => {
    const q = normalize(placeFilter.trim());
    if (!q) return true;
    return normalize(row.station.name).includes(q) || normalize(row.station.bairro).includes(q);
  });

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/40 sm:items-center">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Fechar" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-4 shadow-xl sm:rounded-3xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Sua fila</p>
            <h2 id="report-title" className="text-lg font-semibold">
              Informar fila
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-zinc-500 active:bg-zinc-100"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {sentLevel && sentSecao && selected ? (
          <div className="space-y-3 pb-2">
            <div className="flex items-center gap-2 text-emerald-700">
              <Check className="h-5 w-5" />
              <p className="font-semibold">Informação enviada</p>
            </div>
            <p className="text-sm text-zinc-700">
              Você marcou <strong>{STATUS_LABEL[sentLevel]}</strong> na seção {sentSecao.secao} (Zona{" "}
              {sentSecao.zona}) em {selected.station.name}. Enviado às {formatTimeFortaleza(new Date())}{" "}
          
            </p>
            <a
              href={shareHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center rounded-2xl bg-emerald-600 py-3 text-base font-semibold text-white"
            >
              Compartilhar no WhatsApp
            </a>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-2xl border border-zinc-200 py-3 text-sm font-medium"
            >
              Fechar
            </button>
          </div>
        ) : (
          <div className="space-y-3 pb-2">
            {locating && (
              <p className="flex items-center gap-2 text-sm text-zinc-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                {pos ? "Afinando o GPS…" : "Buscando sua localização…"}
              </p>
            )}

            {gpsMessage && !pos && (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">{gpsMessage}</p>
            )}

            {!pos && (
              <button
                type="button"
                onClick={() => {
                  setLocating(true);
                  setGpsMessage(null);
                  requestFix()
                    .then((next) => {
                      setFix(next);
                      setLocating(false);
                    })
                    .catch((error: unknown) => {
                      setLocating(false);
                      setGpsMessage(geoErrorMessage(error));
                    });
                }}
                className="w-full rounded-2xl border border-zinc-200 py-3 text-sm font-medium"
              >
                Tentar localização de novo
              </button>
            )}

            {weakGps && (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
                Sinal de GPS fraco, vá para um local aberto.
              </p>
            )}

            {!online && (
              <p className="rounded-xl bg-zinc-800 p-3 text-sm text-white">
                Você está sem internet. Dá para ver as filas já carregadas, mas o envio espera a conexão voltar.
              </p>
            )}

            {authError && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">{authError}</p>}

            {selected && (
              <div className="rounded-2xl border border-zinc-200 p-3">
                <p className="text-xs text-zinc-500">
                  {chosenId ? "Local escolhido" : "Sugerimos o mais perto de você"}
                </p>
                <p className="font-semibold leading-snug">{selected.station.name}</p>
                <p className="text-sm text-zinc-600">
                  {selected.station.bairro}
                  {selected.station.endereco ? ` · ${selected.station.endereco}` : ""}
                </p>
                {distance != null && (
                  <p className="mt-1 flex items-center gap-1 text-sm font-medium text-zinc-800">
                    <MapPin className="h-4 w-4" />
                    a {formatDistance(distance)}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setPickingPlace(true)}
                  className="mt-2 text-sm font-medium text-emerald-800"
                >
                  Não é este local
                </button>
              </div>
            )}

            {pos && selected && !inside && (
              <p className="rounded-xl bg-zinc-100 p-3 text-sm text-zinc-800">
                Você está a cerca de {formatDistance(distance ?? 0)} deste local. Dá para informar a fila só
                até 400 m. Por enquanto, é só visualizar.
              </p>
            )}

            {mineStation && selected && mineStation.id !== selected.station.id && mySection && !otherMode && (
              <div className="rounded-xl bg-zinc-100 p-3 text-sm text-zinc-800">
                <p>
                  Sua seção {mySection.zona}/{mySection.secao} é em {mineStation.name}.
                </p>
                <button
                  type="button"
                  onClick={() => setChosenId(mineStation.id)}
                  className="mt-2 font-medium text-emerald-800"
                >
                  Ir para o meu local
                </button>
              </div>
            )}

            {activeSecao && !replacingMine && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-sm font-semibold text-emerald-950">
                  {otherMode ? "Fila que você está vendo" : "Sua seção"}: {activeSecao.zona}/
                  {activeSecao.secao}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      if (otherMode) {
                        setOtherSecao(null);
                        return;
                      }
                      setReplacingMine(true);
                      setOtherMode(false);
                      setOtherSecao(null);
                    }}
                    className="font-medium text-emerald-800"
                  >
                    (trocar)
                  </button>
                </p>
                {activeSecao.secao !== activeSecao.principal && (
                  <p className="mt-1 text-xs text-emerald-900">
                    Esta seção divide a fila com a seção {activeSecao.principal}.
                  </p>
                )}
              </div>
            )}

            {mineOnStation && !replacingMine && (
              <button
                type="button"
                aria-pressed={otherMode}
                onClick={() => {
                  setOtherMode((value) => !value);
                  setOtherSecao(null);
                  setFormError(null);
                }}
                className={`w-full rounded-2xl border px-3 py-3 text-left text-sm font-medium ${
                  otherMode ? "border-emerald-600 bg-emerald-50 text-emerald-950" : "border-zinc-200"
                }`}
              >
                Estou vendo a fila de outra seção
              </button>
            )}

            {inside && activeSecao && remaining > 0 && (
              <p className="rounded-xl bg-zinc-100 p-3 text-sm text-zinc-800">
                Você já informou esta fila. Pode atualizar em {formatCountdown(remaining)}.
              </p>
            )}

            {formError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900">{formError}</p>}

            {stations.length === 0 && (
              <p className="text-sm text-zinc-600">
                Os locais ainda não carregaram. Espere um instante e tente de novo.
              </p>
            )}

            {pickingPlace ? (
              <div className="space-y-2">
                <label htmlFor="trocar-local" className="sr-only">
                  Buscar outro local
                </label>
                <input
                  id="trocar-local"
                  value={placeFilter}
                  onChange={(event) => setPlaceFilter(event.target.value)}
                  placeholder="Buscar outro local"
                  className="w-full rounded-xl border border-zinc-200 px-3 py-3 text-base outline-none ring-emerald-600 focus:ring-2"
                />
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {filteredPlaces.map((row) => (
                    <button
                      key={row.station.id}
                      type="button"
                      onClick={() => {
                        setChosenId(row.station.id);
                        setPickingPlace(false);
                        setFormError(null);
                      }}
                      className="block w-full rounded-xl px-3 py-2 text-left active:bg-zinc-100"
                    >
                      <span className="block text-sm font-medium">{row.station.name}</span>
                      <span className="block text-xs text-zinc-500">
                        {row.station.bairro}
                        {row.distance != null ? ` · ${formatDistance(row.distance)}` : ""}
                      </span>
                    </button>
                  ))}
                  {filteredPlaces.length === 0 && (
                    <p className="px-1 py-3 text-sm text-zinc-500">Nenhum local encontrado.</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setPickingPlace(false)}
                  className="w-full py-2 text-sm text-zinc-600"
                >
                  Voltar
                </button>
              </div>
            ) : (
              choosingSection &&
              selected && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-zinc-800">
                    {otherMode
                      ? "Qual seção você está vendo?"
                      : mySection
                        ? "Escolha a sua seção neste local"
                        : "Escolher minha seção"}
                  </p>
                  {zones.length > 1 && (
                    <div className="flex flex-wrap gap-2">
                      {zones.map((zona) => (
                        <button
                          key={zona}
                          type="button"
                          onClick={() => setZonePick(zona)}
                          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                            zonePick === zona ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-800"
                          }`}
                        >
                          Zona {zona}
                        </button>
                      ))}
                    </div>
                  )}
                  {zonePick && (
                    <div className="max-h-52 space-y-1 overflow-y-auto">
                      {sectionChoices.map((item) => (
                        <button
                          key={`${item.zona}-${item.secao}`}
                          type="button"
                          onClick={() => chooseSection(item)}
                          className="block w-full rounded-xl px-3 py-2 text-left text-sm font-medium active:bg-zinc-100"
                        >
                          Seção {item.secao}
                        </button>
                      ))}
                      {sectionChoices.length === 0 && (
                        <p className="text-sm text-zinc-500">Nenhuma seção nesta zona.</p>
                      )}
                    </div>
                  )}
                  {replacingMine && (
                    <button
                      type="button"
                      onClick={() => setReplacingMine(false)}
                      className="w-full py-2 text-sm text-zinc-600"
                    >
                      Voltar
                    </button>
                  )}
                </div>
              )
            )}

            {!pickingPlace && !choosingSection && (
              <div className="space-y-2">
                {OPTIONS.map((option) => (
                  <button
                    key={option.level}
                    type="button"
                    disabled={!canSend || sending !== null}
                    onClick={() => submit(option.level)}
                    className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 px-4 text-left text-base font-semibold disabled:opacity-40 ${option.className}`}
                  >
                    <span aria-hidden>{option.emoji}</span>
                    <span className="flex-1">
                      {option.label}
                      {option.hint && (
                        <span className="mt-0.5 block text-xs font-medium opacity-80">{option.hint}</span>
                      )}
                    </span>
                    {sending === option.level && <Loader2 className="h-5 w-5 animate-spin" />}
                  </button>
                ))}
              </div>
            )}

            {selected && (
              <button
                type="button"
                onClick={() => onShowOnMap(selected.station.id)}
                className="w-full text-sm text-zinc-500"
              >
                Ver no mapa
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
