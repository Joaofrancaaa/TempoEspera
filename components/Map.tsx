"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  ZoomControl,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { STATUS_COLOR, STATUS_LABEL, formatEleitores } from "@/lib/status";
import type { StationView } from "@/lib/types";

const CENTER: [number, number] = [-5.5265, -47.4766];

const defaultPrototype = L.Icon.Default.prototype as unknown as { _getIconUrl?: string };
delete defaultPrototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function circleIcon(color: string, selected: boolean): L.DivIcon {
  const size = selected ? 28 : 18;
  return L.divIcon({
    className: "station-pin",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></span>`,
  });
}

function MapFocus({
  lat,
  lng,
  nonce,
}: {
  lat: number | null;
  lng: number | null;
  nonce: number;
}) {
  const map = useMap();
  const seen = useRef(0);

  useEffect(() => {
    if (nonce === 0 || nonce === seen.current) return;
    seen.current = nonce;
    if (lat == null || lng == null) return;
    map.flyTo([lat, lng], Math.max(map.getZoom(), 16), { duration: 0.55 });
  }, [lat, lng, map, nonce]);

  return null;
}

function StationMarker({
  station,
  selected,
  focusNonce,
  onSelect,
}: {
  station: StationView;
  selected: boolean;
  focusNonce: number;
  onSelect: (id: string) => void;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  const icon = useMemo(
    () => circleIcon(STATUS_COLOR[station.status], selected),
    [selected, station.status],
  );

  useEffect(() => {
    if (!selected || focusNonce === 0) return;
    markerRef.current?.openPopup();
  }, [focusNonce, selected]);

  return (
    <Marker
      position={[station.lat, station.lng]}
      icon={icon}
      zIndexOffset={selected ? 1000 : 0}
      eventHandlers={{
        add: (event) => {
          markerRef.current = event.target;
        },
        click: () => onSelect(station.id),
      }}
    >
      <Popup>
        <strong>{station.name}</strong>
        <div>{station.bairro}</div>
        <div>
          {STATUS_LABEL[station.status]} · {station.updatedLabel}
        </div>
        <div>{formatEleitores(station.eleitores)}</div>
        <div>
          {station.secoesComRelato === 1
            ? "1 seção com relatos"
            : `${station.secoesComRelato} seções com relatos`}
        </div>
      </Popup>
    </Marker>
  );
}

type MapProps = {
  stations: StationView[];
  selectedId: string | null;
  focusNonce: number;
  userPos: { lat: number; lng: number } | null;
  onSelect: (id: string) => void;
};

export default function MapView({
  stations,
  selectedId,
  focusNonce,
  userPos,
  onSelect,
}: MapProps) {
  const selected = useMemo(
    () => stations.find((station) => station.id === selectedId) ?? null,
    [selectedId, stations],
  );

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={CENTER}
        zoom={12}
        zoomControl={false}
        className="h-full w-full"
        scrollWheelZoom
      >
        <ZoomControl position="bottomright" />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapFocus
          lat={selected?.lat ?? null}
          lng={selected?.lng ?? null}
          nonce={focusNonce}
        />
        {userPos && (
          <CircleMarker
            center={[userPos.lat, userPos.lng]}
            radius={7}
            pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#2563eb", fillOpacity: 1 }}
          />
        )}
        {stations.map((station) => (
          <StationMarker
            key={station.id}
            station={station}
            selected={station.id === selectedId}
            focusNonce={focusNonce}
            onSelect={onSelect}
          />
        ))}
      </MapContainer>

      <div className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded-lg bg-white/95 px-2 py-1.5 text-[10px] leading-4 text-zinc-700 shadow">
        <Legend color={STATUS_COLOR.vazio} label="Sem fila" />
        <Legend color={STATUS_COLOR.moderado} label="Moderada" />
        <Legend color={STATUS_COLOR.demorado} label="Grande" />
        <Legend color={STATUS_COLOR.sem_dados} label="Sem dados" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </div>
  );
}
