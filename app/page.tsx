"use client";

import dynamic from "next/dynamic";
import { MapPin, Search, WifiOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { signInAnonymously } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { MySectionBar } from "@/components/MySectionBar";
import { ReportModal } from "@/components/ReportModal";
import { StationCard } from "@/components/StationCard";
import {
  findSecao,
  findStationForSection,
  listFilas,
  loadCatalog,
  reportsForFila,
} from "@/lib/catalog";
import { firebase, isFirebaseConfigured, parseReports } from "@/lib/firebase";
import { formatDistance, haversineMeters } from "@/lib/geo";
import { readMySection, writeMySection } from "@/lib/mySection";
import {
  buildShareText,
  computeFilaStatus,
  computeStationStatus,
  formatUpdated,
  formatZonas,
  makeFilaKey,
  minutesAgo,
} from "@/lib/status";
import type { GeoFix, Report, SavedSection, Station, StationView } from "@/lib/types";

const MapView = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-200 text-sm text-zinc-600">
      Carregando mapa…
    </div>
  ),
});

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function geoBanner(code: string | null): string | null {
  if (code === "denied") {
    return "Sem permissão de localização. Você pode ver as filas. Para informar, permita o GPS nas configurações do navegador.";
  }
  if (code === "timeout") {
    return "O GPS demorou para responder. O mapa continua disponível. Tente de novo ao informar a fila.";
  }
  if (code === "unavailable") {
    return "Não foi possível obter sua localização agora. Você pode continuar só olhando as filas.";
  }
  if (code === "unsupported") {
    return "Este navegador não oferece localização. Dá para ver as filas, sem informar.";
  }
  return null;
}

export default function HomePage() {
  const configured = isFirebaseConfigured();
  const catalog = useMemo(() => loadCatalog(), []);
  const [reportsById, setReportsById] = useState<Record<string, Record<string, Report>>>({});
  const [loading, setLoading] = useState(configured);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  const [userPos, setUserPos] = useState<GeoFix | null>(null);
  const [geoCode, setGeoCode] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [siteUrl, setSiteUrl] = useState("");
  const [mySection, setMySection] = useState<SavedSection | null>(null);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  const stations = useMemo<Station[]>(
    () =>
      catalog.map((station) => ({
        ...station,
        reports: reportsById[station.id] ?? {},
      })),
    [catalog, reportsById],
  );

  useEffect(() => {
    setSiteUrl(window.location.origin);
    setMySection(readMySection());
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    const client = firebase;
    if (!client) return;
    let cancelled = false;
    client.auth.authStateReady().then(() => {
      if (cancelled) return;
      if (client.auth.currentUser) {
        setUid(client.auth.currentUser.uid);
        return;
      }
      signInAnonymously(client.auth)
        .then((credential) => {
          if (!cancelled) setUid(credential.user.uid);
        })
        .catch(() => {
          if (!cancelled) {
            setAuthError(
              "Não foi possível entrar. Ative o login anônimo no Firebase para informar a fila. Ver o mapa continua liberado.",
            );
          }
        });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const client = firebase;
    if (!client) return;
    return onSnapshot(
      collection(client.db, "stations"),
      (snapshot) => {
        const next: Record<string, Record<string, Report>> = {};
        for (const item of snapshot.docs) next[item.id] = parseReports(item.data());
        setReportsById(next);
        setLoading(false);
        setLoadError(null);
      },
      () => {
        setLoading(false);
        setLoadError("Não foi possível carregar as filas. Confira sua internet e se o Firestore está ativo.");
      },
    );
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoCode("unsupported");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserPos({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        });
        setGeoCode(null);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) setGeoCode("denied");
        else if (error.code === error.TIMEOUT) setGeoCode("timeout");
        else setGeoCode("unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    cardRefs.current[selectedId]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusNonce, selectedId]);

  function saveMySection(value: SavedSection) {
    writeMySection(value);
    setMySection(value);
  }

  const mine = useMemo(() => {
    if (!mySection) return null;
    const station = findStationForSection(stations, mySection.zona, mySection.secao);
    if (!station) return null;
    const secao = findSecao(station, mySection.zona, mySection.secao);
    if (!secao) return null;
    const result = computeFilaStatus(
      reportsForFila(station, makeFilaKey(secao.zona, secao.principal)),
      now,
    );
    return {
      stationId: station.id,
      placeName: station.name,
      zona: secao.zona,
      secao: secao.secao,
      status: result.status,
      minutes: result.updatedAt == null ? null : minutesAgo(result.updatedAt, now),
    };
  }, [mySection, now, stations]);

  const views = useMemo(() => {
    const withMeta: StationView[] = stations.map((station) => {
      const result = computeStationStatus(Object.values(station.reports), now);
      const distance = userPos ? haversineMeters(userPos, station) : null;
      const updatedMinutes = result.updatedAt == null ? null : minutesAgo(result.updatedAt, now);
      return {
        id: station.id,
        name: station.name,
        bairro: station.bairro,
        endereco: station.endereco,
        zonasLabel: formatZonas(station.zonas),
        eleitores: station.eleitores,
        lat: station.lat,
        lng: station.lng,
        status: result.status,
        updatedLabel: formatUpdated(result.updatedAt, now),
        updatedMinutes,
        recentCount: result.recentCount,
        secoesComRelato: result.secoesComRelato,
        filas: listFilas(station, now, mySection),
        distanceMeters: distance,
        distanceLabel: distance == null ? null : formatDistance(distance),
        shareText: buildShareText(station.name, result.status, updatedMinutes, siteUrl),
      };
    });

    withMeta.sort((a, b) => {
      if (userPos && a.distanceMeters != null && b.distanceMeters != null) {
        return a.distanceMeters - b.distanceMeters;
      }
      return b.eleitores - a.eleitores;
    });

    return withMeta;
  }, [mySection, now, siteUrl, stations, userPos]);

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return views;
    return views.filter(
      (station) => normalize(station.name).includes(q) || normalize(station.bairro).includes(q),
    );
  }, [query, views]);

  function selectStation(id: string) {
    setSelectedId(id);
    setFocusNonce((value) => value + 1);
  }

  const locationBanner = geoBanner(userPos ? null : geoCode);

  return (
    <div className="flex h-dvh flex-col bg-zinc-100 text-zinc-900">
      <MySectionBar
        zona={mine?.zona ?? null}
        secao={mine?.secao ?? null}
        placeName={mine?.placeName ?? null}
        status={mine?.status ?? null}
        minutes={mine?.minutes ?? null}
        onPress={() => {
          if (!mine) {
            setModalOpen(true);
            return;
          }
          selectStation(mine.stationId);
        }}
      />

      <div className="relative h-[46dvh] min-h-[220px] shrink-0">
        <MapView
          stations={views}
          selectedId={selectedId}
          focusNonce={focusNonce}
          userPos={userPos}
          onSelect={selectStation}
        />
        <header className="pointer-events-none absolute inset-x-0 top-0 z-[500] bg-gradient-to-b from-white via-white/90 to-transparent px-4 pb-8 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Imperatriz · MA</p>
          <h1 className="text-lg font-semibold leading-tight">Filas na votação</h1>
        </header>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-zinc-200 bg-white px-3 py-2">
          <label htmlFor="busca" className="sr-only">
            Buscar por nome ou bairro
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              id="busca"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nome ou bairro"
              autoComplete="off"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-9 pr-3 text-base outline-none ring-emerald-600 focus:ring-2"
            />
          </div>
        </div>

        {!online && (
          <div className="flex items-center gap-2 bg-zinc-800 px-3 py-2 text-sm text-white">
            <WifiOff className="h-4 w-4 shrink-0" />
            Você está sem internet. Os dados podem ficar desatualizados até a conexão voltar.
          </div>
        )}

        {!configured && (
          <div className="bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Falta configurar o Firebase. Preencha o .env.local com as chaves do projeto e reinicie o servidor.
          </div>
        )}

        {loadError && (
          <div className="flex items-center justify-between gap-3 bg-red-50 px-3 py-2 text-sm text-red-900">
            <span>{loadError}</span>
            <button type="button" onClick={() => window.location.reload()} className="shrink-0 font-semibold">
              Tentar de novo
            </button>
          </div>
        )}

        {authError && <div className="bg-amber-50 px-3 py-2 text-sm text-amber-950">{authError}</div>}

        {locationBanner && <div className="bg-zinc-50 px-3 py-2 text-sm text-zinc-700">{locationBanner}</div>}

        {loading && <p className="px-3 pt-2 text-xs text-zinc-500">Sincronizando filas…</p>}

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 pb-40">
          {!loading && visible.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-500">
              {stations.length === 0
                ? "Nenhum local carregado ainda."
                : "Nenhum local encontrado para essa busca."}
            </p>
          )}
          {visible.map((station) => (
            <StationCard
              key={station.id}
              station={station}
              selected={station.id === selectedId}
              onSelect={selectStation}
              cardRef={(element) => {
                cardRefs.current[station.id] = element;
              }}
            />
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="fixed bottom-[4.75rem] right-4 z-[1000] flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/20 active:bg-emerald-700"
      >
        <MapPin className="h-5 w-5" />
        Informar fila
      </button>

      <footer className="fixed inset-x-0 bottom-0 z-[900] border-t border-zinc-200 bg-white/95 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-center text-[11px] leading-snug text-zinc-600 backdrop-blur">
        Informações enviadas por cidadãos, não oficiais. Vá votar: a votação vai até as 17h e quem está na fila até
        esse horário vota.
      </footer>

      <ReportModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        stations={stations}
        uid={uid}
        initialFix={userPos}
        siteUrl={siteUrl}
        online={online}
        authError={authError}
        mySection={mySection}
        onSaveMySection={saveMySection}
        onShowOnMap={(id) => {
          setModalOpen(false);
          selectStation(id);
        }}
      />
    </div>
  );
}
