"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  CircleMarker,
  Circle,
  Polygon,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { CtoPonto, OnuData } from "@/types";
import L from "leaflet";
import {
  Radar,
  X,
  CircleDot,
  Pentagon,
  RotateCcw,
  Trash2,
  Users,
  Layers,
  Box,
  Globe,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Search,
  MapPin,
  Route,
  Signal,
  Sparkles,
  Loader2,
} from "lucide-react";

// Leaflet icon fix for Next.js
import iconRetina from "leaflet/dist/images/marker-icon-2x.png";
import iconMarker from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

const initIconFix = () => {
  delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: iconRetina.src,
    iconUrl: iconMarker.src,
    shadowUrl: iconShadow.src,
  });
};

const isOnline = (o: OnuData) => o.online === true || o.online === 1 || o.online === "1";

interface MapComponentProps {
  onus: OnuData[];
  ctos: CtoPonto[];
  escopo?: "pon" | "slot" | "tudo";
  onChangeEscopo?: (novoEscopo: "pon" | "slot" | "tudo") => void;
  onSelectPon?: (slot: number, pon: number) => void;
}

const RADIUS_PRESETS = [100, 250, 500, 1000, 2000];
const STREET_BUFFER_PRESETS = [0, 50, 100, 200];

/** Remove acentos, converte para minúsculas e limpa espaços extras. */
function normalizeText(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,;-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normaliza abreviações comuns de logradouro (R., Av., Tv.) para unificar cadastros da mesma rua. */
function normalizeStreetKey(raw: string | undefined | null): string {
  const base = normalizeText(raw);
  if (!base) return "";
  return base
    .replace(/^(r|rua)\s+/, "rua ")
    .replace(/^(av|avenida)\s+/, "avenida ")
    .replace(/^(tv|trav|travessa)\s+/, "travessa ")
    .replace(/^(al|alameda)\s+/, "alameda ")
    .replace(/^(estr|estrada)\s+/, "estrada ")
    .replace(/^(rod|rodovia)\s+/, "rodovia ")
    .replace(/^(pc|pca|praca)\s+/, "praca ");
}

/** Extrai o nome do logradouro de uma ONU, mesmo quando só há `enderecoLinha`. */
function extractLogradouro(onu: OnuData): string {
  const fromAddr = onu.address?.logradouro?.trim();
  if (fromAddr) return fromAddr;
  if (onu.enderecoLinha) {
    const firstPart = onu.enderecoLinha.split(" - ")[0]?.split(",")[0]?.trim();
    if (firstPart) return firstPart;
  }
  return "";
}

interface StreetCatalogItem {
  key: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  searchNorm: string;
  onus: OnuData[];
  plottedOnus: (OnuData & { lat: number; lng: number })[];
  pons: { slot: number; pon: number; count: number }[];
  ctosCount: number;
}

/** Ray-casting para verificar se um ponto [lat, lng] está dentro de um polígono. */
function isPointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  if (polygon.length < 3) return false;
  const [py, px] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Captura cliques no mapa quando a ferramenta de análise de área está ativa. */
function AreaClickHandler({
  active,
  mode,
  onSelectCenter,
  onAddPolygonVertex,
}: {
  active: boolean;
  mode: "raio" | "poligono" | "rua";
  onSelectCenter: (latlng: [number, number]) => void;
  onAddPolygonVertex: (latlng: [number, number]) => void;
}) {
  useMapEvents({
    click(e) {
      if (!active || mode === "rua") return;
      const coords: [number, number] = [e.latlng.lat, e.latlng.lng];
      if (mode === "raio") {
        onSelectCenter(coords);
      } else if (mode === "poligono") {
        onAddPolygonVertex(coords);
      }
    },
  });
  return null;
}

/** Ajusta o enquadramento sempre que o conjunto de pontos muda (exceto durante análise de área). */
function FitBounds({ points, disabled }: { points: [number, number][]; disabled?: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (disabled || points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 17);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [56, 56], maxZoom: 18 });
  }, [map, points, disabled]);

  return null;
}

/** Foca o mapa sob demanda quando o usuário seleciona uma rua ou clica em um cliente. */
function MapFocusController({
  target,
}: {
  target: { bounds?: [number, number][]; point?: [number, number]; seq: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!target) return;
    if (target.point) {
      map.flyTo(target.point, 18, { duration: 0.6 });
      return;
    }
    if (target.bounds && target.bounds.length > 0) {
      if (target.bounds.length === 1) {
        map.flyTo(target.bounds[0], 17, { duration: 0.6 });
      } else {
        map.flyToBounds(L.latLngBounds(target.bounds), {
          padding: [70, 70],
          maxZoom: 18,
          duration: 0.6,
        });
      }
    }
  }, [map, target]);

  return null;
}

/** Recalcula as dimensões do Leaflet ao entrar ou sair do modo Tela Cheia. */
function InvalidateMapSize({ trigger }: { trigger: boolean }) {
  const map = useMap();
  useEffect(() => {
    const id = setTimeout(() => {
      map.invalidateSize();
    }, 60);
    return () => clearTimeout(id);
  }, [map, trigger]);
  return null;
}

export default function MapComponent({
  onus,
  escopo,
  onChangeEscopo,
  onSelectPon,
}: MapComponentProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [mapKey, setMapKey] = useState("map-init");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Estados da ferramenta de Análise de Área / Raio / Rua
  const [areaToolActive, setAreaToolActive] = useState(false);
  const [areaMode, setAreaMode] = useState<"raio" | "poligono" | "rua">("raio");
  const [circleCenter, setCircleCenter] = useState<[number, number] | null>(null);
  const [circleRadius, setCircleRadius] = useState<number>(300); // metros
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);
  const [showClientList, setShowClientList] = useState(false);

  // Estados específicos de Análise por Rua
  const [streetQuery, setStreetQuery] = useState("");
  const [selectedStreetKey, setSelectedStreetKey] = useState<string | null>(null);
  const [streetBufferRadius, setStreetBufferRadius] = useState<number>(0); // 0 = só cadastro da rua
  const [osmLocation, setOsmLocation] = useState<{
    label: string;
    lat: number;
    lng: number;
    radius: number;
  } | null>(null);
  const [osmResults, setOsmResults] = useState<
    Array<{ display_name: string; lat: string; lon: string }>
  >([]);
  const [isSearchingOsm, setIsSearchingOsm] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{
    bounds?: [number, number][];
    point?: [number, number];
    seq: number;
  } | null>(null);

  useEffect(() => {
    initIconFix();
    setIsMounted(true);
    setMapKey(Date.now().toString());
  }, []);

  // Permite sair da tela cheia com a tecla ESC
  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen]);

  // Só entra no mapa quem realmente tem posição vinda do SGP.
  const plotted = useMemo(
    () => onus.filter((o): o is OnuData & { lat: number; lng: number } =>
      o.lat !== null && o.lng !== null
    ),
    [onus]
  );

  const semCoordenada = onus.filter((o) => o.lat === null && !o.aguardandoGeo).length;

  // Enquadramento baseado apenas nos clientes (sem CTOs no mapa)
  const bounds = useMemo<[number, number][]>(
    () => plotted.map((o) => [o.lat, o.lng] as [number, number]),
    [plotted]
  );

  // Catálogo de todas as ruas presentes nas ONUs carregadas (incluindo sem coordenada GPS)
  const streetCatalog = useMemo<StreetCatalogItem[]>(() => {
    // 1º passo: identifica bairros por logradouro normalizado para não fragmentar a mesma rua sem bairro
    const mainBairroByStreet = new Map<string, { normBairro: string; rawBairro: string; count: number }>();
    const countsByStreetBairro = new Map<string, number>();

    for (const o of onus) {
      const rawLog = extractLogradouro(o);
      const normLog = normalizeStreetKey(rawLog);
      if (!normLog) continue;
      const rawBairro = o.address?.bairro?.trim() || "";
      const normBairro = normalizeText(rawBairro);
      if (!normBairro) continue;

      const pairKey = `${normLog}::${normBairro}`;
      const newCount = (countsByStreetBairro.get(pairKey) ?? 0) + 1;
      countsByStreetBairro.set(pairKey, newCount);

      const curMain = mainBairroByStreet.get(normLog);
      if (!curMain || newCount > curMain.count) {
        mainBairroByStreet.set(normLog, { normBairro, rawBairro, count: newCount });
      }
    }

    // 2º passo: agrupa ONUs por rua + bairro
    const groups = new Map<
      string,
      {
        key: string;
        logradouro: string;
        bairro: string;
        cidade: string;
        onus: OnuData[];
      }
    >();

    for (const o of onus) {
      const rawLog = extractLogradouro(o);
      const normLog = normalizeStreetKey(rawLog);
      if (!normLog) continue;

      let rawBairro = o.address?.bairro?.trim() || "";
      let normBairro = normalizeText(rawBairro);

      if (!normBairro) {
        const fallback = mainBairroByStreet.get(normLog);
        if (fallback) {
          normBairro = fallback.normBairro;
          rawBairro = fallback.rawBairro;
        }
      }

      const key = `${normLog}::${normBairro}`;
      const existing = groups.get(key);
      const rawCidade = o.address?.cidade?.trim() || "";

      if (!existing) {
        groups.set(key, {
          key,
          logradouro: rawLog,
          bairro: rawBairro,
          cidade: rawCidade,
          onus: [o],
        });
      } else {
        existing.onus.push(o);
        // Prefere o nome de rua mais descritivo (ex: "Rua das Flores" em vez de "R. das Flores")
        if (rawLog.length > existing.logradouro.length) {
          existing.logradouro = rawLog;
        }
        if (!existing.bairro && rawBairro) existing.bairro = rawBairro;
        if (!existing.cidade && rawCidade) existing.cidade = rawCidade;
      }
    }

    const items: StreetCatalogItem[] = [];
    for (const g of groups.values()) {
      const plottedOnus = g.onus.filter(
        (o): o is OnuData & { lat: number; lng: number } => o.lat !== null && o.lng !== null
      );

      const ponCounts = new Map<string, { slot: number; pon: number; count: number }>();
      const ctosSet = new Set<string>();

      for (const o of g.onus) {
        const pk = `${o.slot}-${o.pon}`;
        const cur = ponCounts.get(pk) ?? { slot: o.slot, pon: o.pon, count: 0 };
        cur.count += 1;
        ponCounts.set(pk, cur);
        if (o.cto) ctosSet.add(o.cto);
      }

      const pons = Array.from(ponCounts.values()).sort((a, b) => b.count - a.count);

      items.push({
        key: g.key,
        logradouro: g.logradouro,
        bairro: g.bairro,
        cidade: g.cidade,
        searchNorm: normalizeText(`${g.logradouro} ${normalizeStreetKey(g.logradouro)} ${g.bairro} ${g.cidade}`),
        onus: g.onus,
        plottedOnus,
        pons,
        ctosCount: ctosSet.size,
      });
    }

    return items.sort((a, b) => b.onus.length - a.onus.length || a.logradouro.localeCompare(b.logradouro));
  }, [onus]);

  // Filtra ruas conforme o termo digitado pelo usuário
  const filteredStreets = useMemo(() => {
    const q = normalizeText(streetQuery);
    if (!q) return streetCatalog.slice(0, 40);

    const tokens = q.split(" ").filter(Boolean);
    return streetCatalog
      .filter((item) => tokens.every((t) => item.searchNorm.includes(t)))
      .slice(0, 50);
  }, [streetCatalog, streetQuery]);

  const selectedStreetItem = useMemo(() => {
    if (!selectedStreetKey || selectedStreetKey === "__ALL_MATCHES__" || selectedStreetKey === "__OSM__") {
      return null;
    }
    return streetCatalog.find((s) => s.key === selectedStreetKey) ?? null;
  }, [streetCatalog, selectedStreetKey]);

  const handleSelectStreet = (item: StreetCatalogItem) => {
    setSelectedStreetKey(item.key);
    setOsmLocation(null);
    if (item.plottedOnus.length > 0) {
      setFocusTarget({
        bounds: item.plottedOnus.map((o) => [o.lat, o.lng] as [number, number]),
        seq: Date.now(),
      });
    }
  };

  const handleAnalyzeAllMatchedStreets = () => {
    if (filteredStreets.length === 0) return;
    setSelectedStreetKey("__ALL_MATCHES__");
    setOsmLocation(null);
    const allPts = filteredStreets.flatMap((s) =>
      s.plottedOnus.map((o) => [o.lat, o.lng] as [number, number])
    );
    if (allPts.length > 0) {
      setFocusTarget({
        bounds: allPts,
        seq: Date.now(),
      });
    }
  };

  const searchStreetOnOsm = async () => {
    const query = streetQuery.trim();
    if (!query) return;
    setIsSearchingOsm(true);
    setOsmResults([]);
    try {
      // Usa a cidade mais comum do escopo atual para refinar a busca no OpenStreetMap
      const mainCity = streetCatalog.find((s) => s.cidade)?.cidade || "Paraíba";
      const qParam = `${query}, ${mainCity}, Brasil`;
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=4&countrycodes=br&q=${encodeURIComponent(
          qParam
        )}`
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setOsmResults(data);
          if (data.length === 1) {
            const lat = parseFloat(data[0].lat);
            const lng = parseFloat(data[0].lon);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              const radius = streetBufferRadius > 0 ? streetBufferRadius : 200;
              setOsmLocation({
                label: data[0].display_name.split(",").slice(0, 2).join(","),
                lat,
                lng,
                radius,
              });
              setSelectedStreetKey("__OSM__");
              setFocusTarget({ point: [lat, lng], seq: Date.now() });
            }
          }
        }
      }
    } catch {
      // Ignora erro de rede silenciosamente
    } finally {
      setIsSearchingOsm(false);
    }
  };

  // Calcula quais ONUs estão dentro da área demarcada (Raio, Polígono ou Rua)
  const areaSelection = useMemo(() => {
    if (!areaToolActive) return null;

    let onusInside: OnuData[] = [];
    let streetTitle: string | null = null;
    let streetSubtitle: string | null = null;
    let proximityAddedCount = 0;

    if (areaMode === "raio") {
      if (!circleCenter) return null;
      const centerLatLng = L.latLng(circleCenter[0], circleCenter[1]);
      onusInside = plotted.filter(
        (o) => centerLatLng.distanceTo(L.latLng(o.lat, o.lng)) <= circleRadius
      );
    } else if (areaMode === "poligono") {
      if (polygonPoints.length < 3) return null;
      onusInside = plotted.filter((o) => isPointInPolygon([o.lat, o.lng], polygonPoints));
    } else if (areaMode === "rua") {
      if (selectedStreetKey === "__OSM__" && osmLocation) {
        const centerLatLng = L.latLng(osmLocation.lat, osmLocation.lng);
        const radius = streetBufferRadius > 0 ? streetBufferRadius : osmLocation.radius;
        onusInside = plotted.filter(
          (o) => centerLatLng.distanceTo(L.latLng(o.lat, o.lng)) <= radius
        );
        streetTitle = osmLocation.label;
        streetSubtitle = `Raio de ${radius}m no mapa (GPS)`;
      } else if (selectedStreetKey === "__ALL_MATCHES__" && streetQuery.trim() !== "") {
        const baseMap = new Map<number, OnuData>();
        for (const s of filteredStreets) {
          for (const o of s.onus) {
            baseMap.set(o.id, o);
          }
        }
        const baseList = Array.from(baseMap.values());
        onusInside = [...baseList];
        streetTitle = `Busca: "${streetQuery.trim()}"`;
        streetSubtitle = `${filteredStreets.length} logradouro(s) correspondente(s)`;

        if (streetBufferRadius > 0) {
          const basePlotted = baseList.filter(
            (o): o is OnuData & { lat: number; lng: number } => o.lat !== null && o.lng !== null
          );
          if (basePlotted.length > 0) {
            for (const cand of plotted) {
              if (baseMap.has(cand.id)) continue;
              const candLatLng = L.latLng(cand.lat, cand.lng);
              const near = basePlotted.some(
                (bp) => candLatLng.distanceTo(L.latLng(bp.lat, bp.lng)) <= streetBufferRadius
              );
              if (near) {
                onusInside.push(cand);
                proximityAddedCount += 1;
              }
            }
          }
        }
      } else if (selectedStreetItem) {
        const baseMap = new Map<number, OnuData>(
          selectedStreetItem.onus.map((o) => [o.id, o])
        );
        onusInside = [...selectedStreetItem.onus];
        streetTitle = selectedStreetItem.logradouro;
        streetSubtitle = [selectedStreetItem.bairro, selectedStreetItem.cidade]
          .filter(Boolean)
          .join(" • ");

        if (streetBufferRadius > 0 && selectedStreetItem.plottedOnus.length > 0) {
          for (const cand of plotted) {
            if (baseMap.has(cand.id)) continue;
            const candLatLng = L.latLng(cand.lat, cand.lng);
            const near = selectedStreetItem.plottedOnus.some(
              (bp) => candLatLng.distanceTo(L.latLng(bp.lat, bp.lng)) <= streetBufferRadius
            );
            if (near) {
              onusInside.push(cand);
              proximityAddedCount += 1;
            }
          }
        }
      } else {
        return null;
      }

      // Em modo Rua, ordena os clientes pelo número da residência quando disponível
      onusInside.sort((a, b) => {
        const numA = parseInt(String(a.address?.numero ?? ""), 10);
        const numB = parseInt(String(b.address?.numero ?? ""), 10);
        if (Number.isFinite(numA) && Number.isFinite(numB)) return numA - numB;
        if (Number.isFinite(numA)) return -1;
        if (Number.isFinite(numB)) return 1;
        return (a.service_cliente || "").localeCompare(b.service_cliente || "");
      });
    }

    // Agrupa por Slot/PON (incluindo CTOs daquela PON e clientes com sinal fraco)
    const ponMap = new Map<
      string,
      {
        slot: number;
        pon: number;
        total: number;
        online: number;
        offline: number;
        weakSignal: number;
        ctos: Set<string>;
      }
    >();

    for (const o of onusInside) {
      const key = `${o.slot}-${o.pon}`;
      const cur = ponMap.get(key) ?? {
        slot: o.slot,
        pon: o.pon,
        total: 0,
        online: 0,
        offline: 0,
        weakSignal: 0,
        ctos: new Set<string>(),
      };
      cur.total += 1;
      if (isOnline(o)) {
        cur.online += 1;
        if (o.info_rx !== undefined && o.info_rx !== null && o.info_rx !== 0 && o.info_rx < -25) {
          cur.weakSignal += 1;
        }
      } else {
        cur.offline += 1;
      }
      if (o.cto) cur.ctos.add(o.cto);
      ponMap.set(key, cur);
    }

    const pons = Array.from(ponMap.values())
      .map((p) => ({
        ...p,
        ctos: Array.from(p.ctos),
      }))
      .sort((a, b) => b.total - a.total);

    // Agrupa CTOs que atendem os clientes da seleção
    const ctoMap = new Map<string, { ident: string; count: number; ponLabel: string }>();
    for (const o of onusInside) {
      if (o.cto) {
        const cur = ctoMap.get(o.cto) ?? {
          ident: o.cto,
          count: 0,
          ponLabel: `S${o.slot}/P${o.pon}`,
        };
        cur.count += 1;
        ctoMap.set(o.cto, cur);
      }
    }
    const ctosSummary = Array.from(ctoMap.values()).sort((a, b) => b.count - a.count);

    const onlineTotal = onusInside.filter(isOnline).length;
    const offlineTotal = onusInside.length - onlineTotal;
    const weakSignalTotal = onusInside.filter(
      (o) =>
        isOnline(o) &&
        o.info_rx !== undefined &&
        o.info_rx !== null &&
        o.info_rx !== 0 &&
        o.info_rx < -25
    ).length;
    const semPinTotal = onusInside.filter((o) => o.lat === null || o.lng === null).length;
    const plottedInside = onusInside.filter(
      (o): o is OnuData & { lat: number; lng: number } => o.lat !== null && o.lng !== null
    );
    const selectedIds = new Set(onusInside.map((o) => o.id));

    return {
      onusInside,
      plottedInside,
      pons,
      ctosSummary,
      onlineTotal,
      offlineTotal,
      weakSignalTotal,
      semPinTotal,
      proximityAddedCount,
      streetTitle,
      streetSubtitle,
      selectedIds,
    };
  }, [
    areaToolActive,
    areaMode,
    circleCenter,
    circleRadius,
    polygonPoints,
    plotted,
    selectedStreetKey,
    selectedStreetItem,
    filteredStreets,
    streetQuery,
    streetBufferRadius,
    osmLocation,
  ]);

  if (!isMounted) {
    return (
      <div className="h-full w-full bg-[#000000] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#EB6410] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Verde online, vermelho offline, âmbar quando o sinal está fraco.
  const createCustomIcon = (
    online: boolean,
    infoRx: number | undefined,
    aproximado: boolean,
    destacado: boolean
  ) => {
    let color = "#10b981";
    if (!online) color = "#ef4444";
    else if (infoRx !== undefined && infoRx < -25) color = "#f59e0b";

    const border = aproximado ? "3px dashed #DFDAC6" : "3px solid #FFFFFF";
    const ring = destacado ? "box-shadow: 0 0 0 4px rgba(235, 100, 16, 0.9);" : "";

    return L.divIcon({
      className: "custom-div-icon",
      html: `<div style="background-color:${color};width:18px;height:18px;border-radius:50%;border:${border};${ring}"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  };

  const handleCloseTool = () => {
    setAreaToolActive(false);
    setCircleCenter(null);
    setPolygonPoints([]);
    setSelectedStreetKey(null);
    setOsmLocation(null);
    setOsmResults([]);
    setShowClientList(false);
  };

  return (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-[2000] h-screen w-screen bg-[#000000]"
          : "h-full w-full relative z-0"
      }
    >
      {/* Barra Superior Esquerda: Botões e Controles de Análise de Área / Rua */}
      <div className="absolute top-3 left-3 right-16 sm:right-auto z-[1000] flex flex-col gap-2 max-w-md pointer-events-none">
        {!areaToolActive ? (
          <div className="flex items-center gap-2 flex-wrap pointer-events-auto">
            <button
              onClick={() => {
                setAreaMode("raio");
                setAreaToolActive(true);
              }}
              className="flex items-center gap-2 bg-gradient-to-r from-[#EB6410] to-[#E84818] hover:brightness-110 text-[#FFFFFF] text-xs font-bold px-3.5 py-2.5 rounded-xl shadow-lg border border-[#EB6410]/50 transition-all cursor-pointer"
            >
              <Radar className="w-4 h-4" />
              Analisar Área / Raio
            </button>

            <button
              onClick={() => {
                setAreaMode("rua");
                setAreaToolActive(true);
              }}
              className="flex items-center gap-2 bg-[#000000]/90 hover:bg-[#333333] text-[#FFFFFF] text-xs font-bold px-3.5 py-2.5 rounded-xl shadow-lg border border-[#EB6410]/60 hover:border-[#EB6410] transition-all cursor-pointer"
            >
              <Route className="w-4 h-4 text-[#EB6410]" />
              Analisar por Rua
            </button>
          </div>
        ) : (
          <div className="pointer-events-auto bg-[#000000]/95 backdrop-blur-md border border-[#EB6410]/60 rounded-2xl p-3 shadow-2xl space-y-2.5 text-[#FFFFFF]">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#EB6410] uppercase tracking-wider">
                {areaMode === "rua" ? (
                  <>
                    <Route className="w-4 h-4 text-[#EB6410]" />
                    Análise por Rua
                  </>
                ) : (
                  <>
                    <Radar className="w-4 h-4 text-[#EB6410]" />
                    Análise de Área
                  </>
                )}
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setAreaMode("raio");
                    setPolygonPoints([]);
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    areaMode === "raio"
                      ? "bg-[#EB6410] text-[#FFFFFF]"
                      : "bg-[#333333]/60 text-[#D2D2D2] hover:text-[#FFFFFF]"
                  }`}
                >
                  <CircleDot className="w-3.5 h-3.5" /> Raio
                </button>
                <button
                  onClick={() => {
                    setAreaMode("poligono");
                    setCircleCenter(null);
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    areaMode === "poligono"
                      ? "bg-[#EB6410] text-[#FFFFFF]"
                      : "bg-[#333333]/60 text-[#D2D2D2] hover:text-[#FFFFFF]"
                  }`}
                >
                  <Pentagon className="w-3.5 h-3.5" /> Polígono
                </button>
                <button
                  onClick={() => {
                    setAreaMode("rua");
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    areaMode === "rua"
                      ? "bg-[#EB6410] text-[#FFFFFF]"
                      : "bg-[#333333]/60 text-[#D2D2D2] hover:text-[#FFFFFF]"
                  }`}
                >
                  <Route className="w-3.5 h-3.5" /> Rua
                </button>
                <button
                  onClick={handleCloseTool}
                  className="ml-1 p-1 text-[#D2D2D2] hover:text-[#FFFFFF] rounded-lg hover:bg-[#333333] transition-colors cursor-pointer"
                  title="Fechar ferramenta de análise"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {areaMode === "raio" ? (
              <div className="space-y-2">
                <p className="text-[11px] text-[#D2D2D2] leading-snug">
                  {circleCenter
                    ? "Toque em outro ponto no mapa para mover o centro ou ajuste o raio:"
                    : "👆 Toque em qualquer ponto do mapa para traçar o raio de busca."}
                </p>

                {/* Botões rápidos de raio */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {RADIUS_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setCircleRadius(preset)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        circleRadius === preset
                          ? "bg-[#EB6410]/25 text-[#DFDAC6] border border-[#EB6410]"
                          : "bg-[#333333]/40 text-[#D2D2D2] hover:text-[#FFFFFF] border border-[#333333]"
                      }`}
                    >
                      {preset >= 1000 ? `${preset / 1000} km` : `${preset} m`}
                    </button>
                  ))}
                  {circleCenter && (
                    <button
                      onClick={() => setCircleCenter(null)}
                      className="ml-auto px-2 py-1 rounded-lg text-[11px] font-semibold bg-[#333333]/40 hover:bg-[#333333] text-rose-400 border border-[#333333] flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Limpar
                    </button>
                  )}
                </div>

                {/* Slider fino de raio */}
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={50}
                    max={3000}
                    step={50}
                    value={circleRadius}
                    onChange={(e) => setCircleRadius(Number(e.target.value))}
                    className="w-full accent-[#EB6410] cursor-pointer h-1.5 bg-[#333333] rounded-lg"
                  />
                  <span className="text-[11px] font-mono font-bold text-[#EB6410] shrink-0 min-w-[54px] text-right">
                    {circleRadius >= 1000
                      ? `${(circleRadius / 1000).toFixed(2).replace(/\.?0+$/, "")} km`
                      : `${circleRadius} m`}
                  </span>
                </div>
              </div>
            ) : areaMode === "poligono" ? (
              <div className="space-y-2">
                <p className="text-[11px] text-[#D2D2D2] leading-snug">
                  {polygonPoints.length < 3
                    ? `👆 Toque no mapa para marcar os cantos da área (${polygonPoints.length}/3 pontos mínimos).`
                    : `Área fechada com ${polygonPoints.length} pontos. Continue tocando para expandir.`}
                </p>
                {polygonPoints.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPolygonPoints((prev) => prev.slice(0, -1))}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#333333]/50 hover:bg-[#333333] text-[#D2D2D2] border border-[#333333] flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" /> Desfazer ponto
                    </button>
                    <button
                      onClick={() => setPolygonPoints([])}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#333333]/50 hover:bg-[#333333] text-rose-400 border border-[#333333] flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Limpar
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Modo Rua */
              <div className="space-y-2.5">
                {/* Campo de busca de rua */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#EB6410] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={streetQuery}
                    onChange={(e) => {
                      setStreetQuery(e.target.value);
                      if (selectedStreetKey) setSelectedStreetKey(null);
                      if (osmResults.length > 0) setOsmResults([]);
                    }}
                    placeholder="Pesquisar rua ou bairro..."
                    className="w-full bg-[#000000] border border-[#333333] focus:border-[#EB6410] text-xs text-[#FFFFFF] rounded-xl pl-8 pr-8 py-2 outline-none focus:ring-1 focus:ring-[#EB6410] transition-all placeholder:text-[#D2D2D2]/40"
                  />
                  {(streetQuery || selectedStreetKey) && (
                    <button
                      onClick={() => {
                        setStreetQuery("");
                        setSelectedStreetKey(null);
                        setOsmLocation(null);
                        setOsmResults([]);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#D2D2D2] hover:text-[#FFFFFF] p-0.5 rounded cursor-pointer"
                      title="Limpar busca de rua"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Se nenhuma rua estiver fixada, exibe a lista de sugestões do SGP */}
                {!selectedStreetKey ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] text-[#D2D2D2] font-semibold uppercase tracking-wider px-0.5">
                      <span>
                        {streetQuery.trim()
                          ? `Ruas encontradas (${filteredStreets.length})`
                          : `Principais ruas no filtro (${streetCatalog.length})`}
                      </span>
                      <span>PONs / Clientes</span>
                    </div>

                    {filteredStreets.length > 1 && streetQuery.trim().length >= 3 && (
                      <button
                        onClick={handleAnalyzeAllMatchedStreets}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-[#EB6410]/15 hover:bg-[#EB6410]/25 border border-[#EB6410]/40 text-[11px] font-bold text-[#DFDAC6] transition-all cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <Sparkles className="w-3.5 h-3.5 text-[#EB6410] shrink-0" />
                          Analisar todas as {filteredStreets.length} ruas para &ldquo;{streetQuery.trim()}&rdquo;
                        </span>
                        <span className="text-[#EB6410] shrink-0 ml-2">
                          {filteredStreets.reduce((acc, s) => acc + s.onus.length, 0)} ONUs
                        </span>
                      </button>
                    )}

                    {filteredStreets.length === 0 ? (
                      <div className="bg-[#333333]/25 border border-[#333333] rounded-xl p-3 text-center space-y-2">
                        <p className="text-xs text-[#D2D2D2]">
                          Nenhuma rua cadastrada no SGP com <strong className="text-[#FFFFFF]">&ldquo;{streetQuery}&rdquo;</strong> neste filtro.
                        </p>
                        {streetQuery.trim().length >= 3 && (
                          <button
                            onClick={searchStreetOnOsm}
                            disabled={isSearchingOsm}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EB6410] hover:brightness-110 text-[#FFFFFF] text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50"
                          >
                            {isSearchingOsm ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <MapPin className="w-3.5 h-3.5" />
                            )}
                            Localizar rua no mapa (GPS)
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                        {filteredStreets.map((st) => (
                          <button
                            key={st.key}
                            onClick={() => handleSelectStreet(st)}
                            className="w-full text-left flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-[#333333]/30 hover:bg-[#333333]/60 border border-[#333333] hover:border-[#EB6410]/60 transition-all cursor-pointer group"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-[#FFFFFF] group-hover:text-[#EB6410] truncate transition-colors">
                                {st.logradouro}
                              </div>
                              <div className="text-[10px] text-[#D2D2D2]/80 truncate flex items-center gap-1.5 mt-0.5">
                                {st.bairro ? <span>{st.bairro}</span> : <span>Sem bairro</span>}
                                {st.pons.length > 0 && (
                                  <>
                                    <span className="text-[#333333]">&bull;</span>
                                    <span className="text-[#DFDAC6] font-mono">
                                      {st.pons
                                        .slice(0, 3)
                                        .map((p) => `S${p.slot}/P${p.pon}`)
                                        .join(", ")}
                                      {st.pons.length > 3 ? ` +${st.pons.length - 3}` : ""}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="shrink-0 flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded-md bg-[#EB6410]/20 border border-[#EB6410]/40 text-[#EB6410] text-[10px] font-extrabold">
                                {st.pons.length} PON{st.pons.length > 1 ? "s" : ""}
                              </span>
                              <span className="px-1.5 py-0.5 rounded-md bg-[#333333]/70 text-[#DFDAC6] text-[10px] font-bold">
                                {st.onus.length} cli
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Botão opcional para buscar por GPS no OpenStreetMap mesmo quando há resultados */}
                    {streetQuery.trim().length >= 3 && filteredStreets.length > 0 && (
                      <div className="pt-1 flex items-center justify-between gap-2">
                        <button
                          onClick={searchStreetOnOsm}
                          disabled={isSearchingOsm}
                          className="text-[11px] font-semibold text-[#DFDAC6] hover:text-[#EB6410] flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          {isSearchingOsm ? (
                            <Loader2 className="w-3 h-3 animate-spin text-[#EB6410]" />
                          ) : (
                            <MapPin className="w-3 h-3 text-[#EB6410]" />
                          )}
                          Não achou? Buscar endereço no mapa (GPS)
                        </button>
                      </div>
                    )}

                    {/* Resultados vindos do OpenStreetMap */}
                    {osmResults.length > 1 && (
                      <div className="space-y-1 pt-1 border-t border-[#333333]">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#EB6410] block">
                          Localizações no Mapa (OpenStreetMap):
                        </span>
                        {osmResults.map((r, idx) => (
                          <button
                            key={`osm-${idx}`}
                            onClick={() => {
                              const lat = parseFloat(r.lat);
                              const lng = parseFloat(r.lon);
                              if (Number.isFinite(lat) && Number.isFinite(lng)) {
                                const radius = streetBufferRadius > 0 ? streetBufferRadius : 200;
                                setOsmLocation({
                                  label: r.display_name.split(",").slice(0, 2).join(","),
                                  lat,
                                  lng,
                                  radius,
                                });
                                setSelectedStreetKey("__OSM__");
                                setFocusTarget({ point: [lat, lng], seq: Date.now() });
                              }
                            }}
                            className="w-full text-left text-[11px] text-[#DFDAC6] hover:text-[#FFFFFF] bg-[#333333]/30 hover:bg-[#333333]/60 border border-[#333333] rounded-lg px-2.5 py-1.5 truncate cursor-pointer"
                          >
                            📍 {r.display_name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Rua selecionada: mostra resumo compacto e ajuste de margem/proximidade */
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 bg-[#EB6410]/15 border border-[#EB6410]/40 rounded-xl px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-[#FFFFFF] truncate">
                          {areaSelection?.streetTitle}
                        </div>
                        {areaSelection?.streetSubtitle && (
                          <div className="text-[10px] text-[#DFDAC6] truncate">
                            {areaSelection.streetSubtitle}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setSelectedStreetKey(null);
                          setOsmLocation(null);
                        }}
                        className="shrink-0 px-2.5 py-1 rounded-lg bg-[#000000]/60 hover:bg-[#000000] text-[#DFDAC6] hover:text-[#FFFFFF] border border-[#333333] text-[11px] font-bold cursor-pointer transition-colors"
                      >
                        Trocar rua
                      </button>
                    </div>

                    {/* Raio complementar de proximidade ao redor da rua */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#D2D2D2] block">
                        Margem de proximidade no mapa:
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {STREET_BUFFER_PRESETS.map((buf) => (
                          <button
                            key={`buf-${buf}`}
                            onClick={() => setStreetBufferRadius(buf)}
                            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                              streetBufferRadius === buf
                                ? "bg-[#EB6410]/25 text-[#DFDAC6] border border-[#EB6410]"
                                : "bg-[#333333]/40 text-[#D2D2D2] hover:text-[#FFFFFF] border border-[#333333]"
                            }`}
                          >
                            {buf === 0 ? "Só cadastro da rua" : `+${buf} m ao redor`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Aviso caso não esteja com Toda a Rede selecionada */}
            {escopo && escopo !== "tudo" && onChangeEscopo && (
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#333333] text-[11px]">
                <span className="text-[#DFDAC6]">
                  Filtro atual: <strong>{escopo === "pon" ? "1 PON" : "1 Slot"}</strong>
                </span>
                <button
                  onClick={() => onChangeEscopo("tudo")}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EB6410]/20 hover:bg-[#EB6410]/30 text-[#EB6410] border border-[#EB6410]/40 font-bold cursor-pointer transition-colors"
                >
                  <Globe className="w-3 h-3" /> Ver todas as PONs da rede
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Canto Superior Direito: Botão de Tela Cheia + Aviso sem coordenada */}
      <div className="absolute top-3 right-3 z-[1000] flex items-center gap-2">
        {semCoordenada > 0 && (
          <div className="hidden sm:block bg-[#000000]/90 backdrop-blur-md border border-[#EB6410]/40 text-[#DFDAC6] text-xs font-semibold px-3 py-2 rounded-xl shadow-lg">
            {semCoordenada} ONU{semCoordenada > 1 ? "s" : ""} sem coordenada no SGP
          </div>
        )}

        <button
          onClick={() => setIsFullscreen((v) => !v)}
          className="flex items-center gap-1.5 bg-[#000000]/90 hover:bg-[#333333] text-[#FFFFFF] border border-[#333333] hover:border-[#EB6410] text-xs font-bold px-3 py-2.5 rounded-xl shadow-lg transition-all cursor-pointer"
          title={isFullscreen ? "Sair da Tela Cheia (Esc)" : "Expandir Mapa em Tela Cheia"}
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="w-4 h-4 text-[#EB6410]" />
              <span className="hidden sm:inline">Sair da Tela Cheia</span>
            </>
          ) : (
            <>
              <Maximize2 className="w-4 h-4 text-[#EB6410]" />
              <span className="hidden sm:inline">Tela Cheia</span>
            </>
          )}
        </button>
      </div>

      {/* Card de Resultado da Área ou Rua Selecionada */}
      {areaSelection && (
        <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-3 sm:top-16 sm:bottom-auto z-[1000] sm:w-88 bg-[#000000]/95 backdrop-blur-md border border-[#EB6410]/50 rounded-2xl p-3.5 shadow-2xl text-[#FFFFFF] max-h-[62vh] flex flex-col gap-3 overflow-y-auto custom-scrollbar">
          {/* Cabeçalho da Rua quando em modo Rua */}
          {areaMode === "rua" && areaSelection.streetTitle && (
            <div className="pb-2 border-b border-[#333333] flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[#EB6410]">
                  <Route className="w-3.5 h-3.5 shrink-0" />
                  Diagnóstico da Rua
                </div>
                <h4 className="text-sm font-extrabold text-[#FFFFFF] truncate mt-0.5" title={areaSelection.streetTitle}>
                  {areaSelection.streetTitle}
                </h4>
                {areaSelection.streetSubtitle && (
                  <p className="text-[11px] text-[#DFDAC6] truncate">
                    {areaSelection.streetSubtitle}
                  </p>
                )}
              </div>
              {areaSelection.plottedInside.length > 0 && (
                <button
                  onClick={() =>
                    setFocusTarget({
                      bounds: areaSelection.plottedInside.map(
                        (o) => [o.lat, o.lng] as [number, number]
                      ),
                      seq: Date.now(),
                    })
                  }
                  className="shrink-0 px-2 py-1 rounded-lg bg-[#333333]/50 hover:bg-[#333333] border border-[#333333] text-[10px] font-bold text-[#DFDAC6] hover:text-[#FFFFFF] flex items-center gap-1 cursor-pointer"
                  title="Centralizar rua no mapa"
                >
                  <MapPin className="w-3 h-3 text-[#EB6410]" /> Focar
                </button>
              )}
            </div>
          )}

          {/* Resumo de Clientes e PONs */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#333333]/35 border border-[#333333] rounded-xl p-2.5">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#D2D2D2]">
                <span>{areaMode === "rua" ? "Clientes na Rua" : "Clientes na Área"}</span>
                <Users className="w-3.5 h-3.5 text-[#EB6410]" />
              </div>
              <div className="text-xl font-extrabold text-[#FFFFFF] mt-0.5">
                {areaSelection.onusInside.length}
              </div>
              <div className="text-[11px] font-semibold mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span className="text-emerald-400">{areaSelection.onlineTotal} on</span>
                <span className="text-[#333333]">&bull;</span>
                <span className="text-rose-400">{areaSelection.offlineTotal} off</span>
                {areaSelection.weakSignalTotal > 0 && (
                  <>
                    <span className="text-[#333333]">&bull;</span>
                    <span className="text-amber-400" title="Clientes online com sinal RX abaixo de -25 dBm">
                      {areaSelection.weakSignalTotal} fraco
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="bg-[#333333]/35 border border-[#333333] rounded-xl p-2.5">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#D2D2D2]">
                <span>{areaMode === "rua" ? "PONs que Atendem" : "PONs na Área"}</span>
                <Layers className="w-3.5 h-3.5 text-[#EB6410]" />
              </div>
              <div className="text-xl font-extrabold text-[#EB6410] mt-0.5">
                {areaSelection.pons.length}
              </div>
              <div className="text-[11px] text-[#DFDAC6] font-medium mt-0.5">
                {areaSelection.ctosSummary.length} CTO
                {areaSelection.ctosSummary.length === 1 ? "" : "s"} vinculada
                {areaSelection.ctosSummary.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>

          {/* Avisos úteis de precisão (ex: clientes na rua sem pino GPS ou vizinhos por proximidade) */}
          {areaMode === "rua" && (areaSelection.semPinTotal > 0 || areaSelection.proximityAddedCount > 0) && (
            <div className="text-[11px] bg-[#333333]/30 border border-[#333333] rounded-xl px-2.5 py-1.5 text-[#DFDAC6] space-y-0.5">
              {areaSelection.semPinTotal > 0 && (
                <div>
                  ℹ️ <strong>{areaSelection.semPinTotal}</strong> cliente(s) desta rua não têm coordenada GPS, mas estão contabilizados nas PONs acima.
                </div>
              )}
              {areaSelection.proximityAddedCount > 0 && (
                <div>
                  📍 Inclui <strong>+{areaSelection.proximityAddedCount}</strong> cliente(s) próximo(s) no raio de +{streetBufferRadius}m.
                </div>
              )}
            </div>
          )}

          {/* Lista detalhada de PONs que atendem a rua / área */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#D2D2D2] flex items-center justify-between">
              <span>
                {areaMode === "rua" ? "PONs que Atendem esta Rua" : "Distribuição por Porta PON"}
              </span>
              <span>Clientes</span>
            </div>

            {areaSelection.pons.length === 0 ? (
              <p className="text-xs text-[#D2D2D2]/60 italic py-2 text-center">
                Nenhum cliente localizado para este filtro.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1 custom-scrollbar">
                {areaSelection.pons.map((p) => {
                  const pct =
                    areaSelection.onusInside.length > 0
                      ? Math.round((p.total / areaSelection.onusInside.length) * 100)
                      : 0;
                  return (
                    <div
                      key={`pon-${p.slot}-${p.pon}`}
                      onClick={() => onSelectPon?.(p.slot, p.pon)}
                      title={onSelectPon ? "Clique para filtrar apenas esta PON" : undefined}
                      className={`bg-[#333333]/30 border border-[#333333] rounded-xl px-2.5 py-2 text-xs space-y-1.5 ${
                        onSelectPon ? "hover:border-[#EB6410] cursor-pointer transition-colors" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-[#FFFFFF]">
                          Slot <span className="text-[#EB6410]">{p.slot}</span> &bull; PON{" "}
                          <span className="text-[#EB6410]">{p.pon}</span>
                          <span className="ml-1.5 text-[10px] font-semibold text-[#D2D2D2]">
                            ({pct}%)
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] font-semibold">
                          <span className="text-emerald-400">{p.online} on</span>
                          {p.offline > 0 && (
                            <span className="text-rose-400">{p.offline} off</span>
                          )}
                          {p.weakSignal > 0 && (
                            <span className="text-amber-400 flex items-center gap-0.5" title="Sinal fraco">
                              <Signal className="w-3 h-3" />
                              {p.weakSignal}
                            </span>
                          )}
                          <span className="px-1.5 py-0.5 rounded-md bg-[#EB6410]/20 text-[#DFDAC6] border border-[#EB6410]/40 font-extrabold">
                            {p.total}
                          </span>
                        </div>
                      </div>

                      {/* Barra de proporção da PON na rua/área */}
                      <div className="w-full h-1 bg-[#333333] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#EB6410] to-[#E84818]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      {/* CTOs vinculadas a esta PON na rua */}
                      {p.ctos.length > 0 && (
                        <div className="text-[10px] text-[#DFDAC6]/80 truncate">
                          CTOs: <span className="text-[#FFFFFF] font-medium">{p.ctos.join(", ")}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* CTOs vinculadas aos clientes da rua / área */}
          {areaSelection.ctosSummary.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#D2D2D2] flex items-center gap-1">
                <Box className="w-3 h-3 text-[#EB6410]" />
                {areaMode === "rua" ? "CTOs que Atendem a Rua" : "CTOs na Região"} (
                {areaSelection.ctosSummary.length})
              </div>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto custom-scrollbar">
                {areaSelection.ctosSummary.map((c) => (
                  <span
                    key={c.ident}
                    className="text-[10px] font-semibold bg-[#333333]/40 border border-[#333333] text-[#DFDAC6] px-2 py-0.5 rounded-lg"
                    title={`Vinculada à ${c.ponLabel}`}
                  >
                    {c.ident} <strong className="text-[#EB6410]">({c.count})</strong>{" "}
                    <span className="text-[#D2D2D2]/70 font-mono text-[9px]">{c.ponLabel}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Lista expansível dos clientes dentro da rua / área */}
          {areaSelection.onusInside.length > 0 && (
            <div className="pt-1 border-t border-[#333333]">
              <button
                onClick={() => setShowClientList((v) => !v)}
                className="w-full flex items-center justify-between text-[11px] font-bold text-[#EB6410] hover:text-[#DFDAC6] py-1 cursor-pointer"
              >
                <span>
                  {showClientList
                    ? areaMode === "rua"
                      ? "Ocultar clientes da rua"
                      : "Ocultar clientes da área"
                    : areaMode === "rua"
                      ? "Ver clientes da rua"
                      : "Ver clientes da área"}{" "}
                  ({areaSelection.onusInside.length})
                </span>
                {showClientList ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              {showClientList && (
                <div className="mt-1.5 space-y-1 max-h-44 overflow-y-auto pr-1 custom-scrollbar">
                  {areaSelection.onusInside.map((o) => {
                    const on = isOnline(o);
                    const hasCoords = o.lat !== null && o.lng !== null;
                    const numero = o.address?.numero ? `Nº ${o.address.numero}` : null;
                    return (
                      <div
                        key={`area-onu-${o.id}`}
                        onClick={() => {
                          if (o.lat !== null && o.lng !== null) {
                            setFocusTarget({ point: [o.lat, o.lng], seq: Date.now() });
                          }
                        }}
                        title={
                          hasCoords
                            ? "Clique para focar este cliente no mapa"
                            : "Cliente sem coordenada GPS no SGP"
                        }
                        className={`flex items-center justify-between gap-2 text-[11px] bg-[#333333]/30 border border-[#333333] rounded-lg px-2 py-1.5 ${
                          hasCoords ? "hover:border-[#EB6410]/60 cursor-pointer transition-colors" : "opacity-80"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                on ? "bg-emerald-500" : "bg-rose-500"
                              }`}
                            />
                            <span className="truncate text-[#FFFFFF] font-medium">
                              {o.service_cliente || `Contrato #${o.service_contrato}`}
                            </span>
                          </div>
                          <div className="text-[10px] text-[#D2D2D2]/80 pl-3.5 flex items-center gap-1.5 truncate">
                            {numero && <span className="text-[#DFDAC6] font-semibold">{numero}</span>}
                            {o.cto && (
                              <span>
                                {o.cto}
                                {o.ctoport ? `/P${o.ctoport}` : ""}
                              </span>
                            )}
                            {o.info_rx !== undefined && o.info_rx !== null && o.info_rx !== 0 && (
                              <span
                                className={
                                  o.info_rx < -25 ? "text-amber-400 font-semibold" : "text-emerald-400"
                                }
                              >
                                {o.info_rx} dBm
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-[#EB6410] bg-[#EB6410]/10 border border-[#EB6410]/30 px-1.5 py-0.5 rounded shrink-0">
                          S{o.slot}/P{o.pon}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <MapContainer
        key={mapKey}
        center={[-7.115, -34.861]}
        zoom={14}
        style={{
          height: "100%",
          width: "100%",
          cursor:
            areaToolActive && (areaMode === "raio" || areaMode === "poligono")
              ? "crosshair"
              : "grab",
        }}
        zoomControl={false}
        preferCanvas
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <InvalidateMapSize trigger={isFullscreen} />
        <FitBounds points={bounds} disabled={areaToolActive} />
        <MapFocusController target={focusTarget} />

        <AreaClickHandler
          active={areaToolActive}
          mode={areaMode}
          onSelectCenter={setCircleCenter}
          onAddPolygonVertex={(pt) => setPolygonPoints((prev) => [...prev, pt])}
        />

        {/* Desenho do Raio no Mapa */}
        {areaToolActive && areaMode === "raio" && circleCenter && (
          <>
            <Circle
              center={circleCenter}
              radius={circleRadius}
              pathOptions={{
                color: "#EB6410",
                weight: 2.5,
                fillColor: "#E84818",
                fillOpacity: 0.18,
              }}
            />
            <CircleMarker
              center={circleCenter}
              radius={5}
              pathOptions={{
                color: "#FFFFFF",
                weight: 2,
                fillColor: "#E84818",
                fillOpacity: 1,
              }}
            />
          </>
        )}

        {/* Desenho do Polígono no Mapa */}
        {areaToolActive && areaMode === "poligono" && polygonPoints.length > 0 && (
          <>
            {polygonPoints.length >= 3 ? (
              <Polygon
                positions={polygonPoints}
                pathOptions={{
                  color: "#EB6410",
                  weight: 2.5,
                  fillColor: "#E84818",
                  fillOpacity: 0.18,
                }}
              />
            ) : (
              <Polyline
                positions={polygonPoints}
                pathOptions={{
                  color: "#EB6410",
                  weight: 2.5,
                  dashArray: "6 6",
                }}
              />
            )}
            {polygonPoints.map((pt, idx) => (
              <CircleMarker
                key={`poly-pt-${idx}`}
                center={pt}
                radius={5}
                pathOptions={{
                  color: "#FFFFFF",
                  weight: 2,
                  fillColor: "#E84818",
                  fillOpacity: 1,
                }}
              />
            ))}
          </>
        )}

        {/* Destaque Visual da Rua no Mapa */}
        {areaToolActive && areaMode === "rua" && areaSelection && (
          <>
            {selectedStreetKey === "__OSM__" && osmLocation && (
              <Circle
                center={[osmLocation.lat, osmLocation.lng]}
                radius={streetBufferRadius > 0 ? streetBufferRadius : osmLocation.radius}
                pathOptions={{
                  color: "#EB6410",
                  weight: 2.5,
                  fillColor: "#E84818",
                  fillOpacity: 0.18,
                }}
              />
            )}
            {areaSelection.plottedInside.map((o) => (
              <CircleMarker
                key={`street-halo-${o.id}`}
                center={[o.lat, o.lng]}
                radius={15}
                pathOptions={{
                  color: "#EB6410",
                  weight: 2,
                  fillColor: "#EB6410",
                  fillOpacity: 0.22,
                }}
              />
            ))}
          </>
        )}

        {plotted.map((onu) => {
          const online = isOnline(onu);
          const aproximado = onu.coordSource === "cto";
          const destacado = areaSelection?.selectedIds.has(onu.id) ?? false;

          return (
            <Marker
              key={onu.id}
              position={[onu.lat, onu.lng]}
              icon={createCustomIcon(online, onu.info_rx, aproximado, destacado)}
            >
              <Popup className="custom-popup">
                <div className="p-1 min-w-[220px]">
                  <div className="flex items-center gap-2 mb-1 pb-2 border-b border-slate-200">
                    <div className={`w-2.5 h-2.5 rounded-full ${!online ? "bg-red-500" : "bg-emerald-500"}`} />
                    <h3 className="font-bold text-slate-900 text-base leading-none">
                      {onu.service_cliente || "Sem Nome Definido"}
                    </h3>
                  </div>

                  {onu.enderecoLinha && (
                    <div className="mt-2 text-xs text-slate-700 leading-snug">
                      {onu.enderecoLinha}
                      {onu.address?.pontoreferencia && (
                        <div className="text-slate-500 italic mt-0.5">
                          Ref.: {onu.address.pontoreferencia}
                        </div>
                      )}
                    </div>
                  )}

                  {aproximado && (
                    <div className="mt-2 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      Posição aproximada (da CTO)
                    </div>
                  )}

                  <div className="space-y-2 mt-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">OLT/PON:</span>
                      <span className="font-semibold text-slate-800">{onu.olt_id} / {onu.pon}</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">Slot:</span>
                      <span className="font-semibold text-slate-800">{onu.slot}</span>
                    </div>

                    {onu.cto && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 font-medium">CTO:</span>
                        <span className="font-semibold text-slate-800 text-xs text-right">
                          {onu.cto}{onu.ctoport ? ` / P${onu.ctoport}` : ""}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">MAC:</span>
                      <span className="font-mono text-xs text-slate-700 bg-slate-100 px-1 py-0.5 rounded">
                        {onu.phy_addr}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">Sinal (RX):</span>
                      <span className={`font-semibold ${onu.info_rx && onu.info_rx < -25 ? "text-amber-600" : "text-slate-800"}`}>
                        {onu.info_rx ? `${onu.info_rx} dBm` : "N/A"}
                      </span>
                    </div>

                    <div className="flex justify-between items-start pt-1">
                      <span className="text-slate-500 font-medium mt-0.5">Observações:</span>
                      <span className="text-xs text-slate-600 line-clamp-2 max-w-[130px] text-right" title={onu.notes}>
                        {onu.notes || "Sem observações"}
                      </span>
                    </div>

                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${onu.lat},${onu.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-center mt-2 px-3 py-1.5 bg-gradient-to-r from-[#EB6410] to-[#E84818] hover:brightness-110 text-[#FFFFFF] text-xs font-bold rounded-lg transition-all"
                    >
                      Traçar rota
                    </a>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
