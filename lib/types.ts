export type Level = "vazio" | "moderado" | "demorado";

export type Status = Level | "sem_dados";

export type Secao = {
  zona: string;
  secao: string;
  eleitores: number;
  principal: string;
};

export type Report = {
  uid: string;
  filaKey: string;
  level: Level;
  ts: number;
};

export type Station = {
  id: string;
  name: string;
  bairro: string;
  endereco: string;
  lat: number;
  lng: number;
  zonas: string[];
  totalSecoes: number;
  eleitores: number;
  secoes: Secao[];
  reports: Record<string, Report>;
};

export type FilaView = {
  filaKey: string;
  zona: string;
  secao: string;
  status: Status;
  minutes: number | null;
  updatedAt: number | null;
  isMine: boolean;
};

export type StationView = {
  id: string;
  name: string;
  bairro: string;
  endereco: string;
  zonasLabel: string;
  eleitores: number;
  lat: number;
  lng: number;
  status: Status;
  updatedLabel: string;
  updatedMinutes: number | null;
  recentCount: number;
  secoesComRelato: number;
  filas: FilaView[];
  distanceMeters: number | null;
  distanceLabel: string | null;
  shareText: string;
};

export type GeoFix = {
  lat: number;
  lng: number;
  accuracy: number | null;
};

export type SavedSection = {
  zona: string;
  secao: string;
};
