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
  mode: "raio" | "poligono";
  onSelectCenter: (latlng: [number, number]) => void;
  onAddPolygonVertex: (latlng: [number, number]) => void;
}) {
  useMapEvents({
    click(e) {
      if (!active) return;
      const coords: [number, number] = [e.latlng.lat, e.latlng.lng];
      if (mode === "raio") {
        onSelectCenter(coords);
      } else {
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

  // Estados da ferramenta de Análise de Área / Raio
  const [areaToolActive, setAreaToolActive] = useState(false);
  const [areaMode, setAreaMode] = useState<"raio" | "poligono">("raio");
  const [circleCenter, setCircleCenter] = useState<[number, number] | null>(null);
  const [circleRadius, setCircleRadius] = useState<number>(300); // metros
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);
  const [showClientList, setShowClientList] = useState(false);

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

  // Calcula quais ONUs estão dentro da área demarcada (Raio ou Polígono)
  const areaSelection = useMemo(() => {
    if (!areaToolActive) return null;

    const hasValidArea =
      (areaMode === "raio" && circleCenter !== null) ||
      (areaMode === "poligono" && polygonPoints.length >= 3);

    if (!hasValidArea) return null;

    const centerLatLng = circleCenter ? L.latLng(circleCenter[0], circleCenter[1]) : null;

    const onusInside = plotted.filter((o) => {
      if (areaMode === "raio" && centerLatLng) {
        return centerLatLng.distanceTo(L.latLng(o.lat, o.lng)) <= circleRadius;
      }
      return isPointInPolygon([o.lat, o.lng], polygonPoints);
    });

    // Agrupa por Slot/PON
    const ponMap = new Map<
      string,
      { slot: number; pon: number; total: number; online: number; offline: number }
    >();

    for (const o of onusInside) {
      const key = `${o.slot}-${o.pon}`;
      const cur = ponMap.get(key) ?? {
        slot: o.slot,
        pon: o.pon,
        total: 0,
        online: 0,
        offline: 0,
      };
      cur.total += 1;
      if (isOnline(o)) cur.online += 1;
      else cur.offline += 1;
      ponMap.set(key, cur);
    }

    const pons = Array.from(ponMap.values()).sort((a, b) => b.total - a.total);

    // Agrupa CTOs que atendem os clientes da área
    const ctoMap = new Map<string, number>();
    for (const o of onusInside) {
      if (o.cto) {
        ctoMap.set(o.cto, (ctoMap.get(o.cto) ?? 0) + 1);
      }
    }
    const ctosSummary = Array.from(ctoMap.entries())
      .map(([ident, count]) => ({ ident, count }))
      .sort((a, b) => b.count - a.count);

    const onlineTotal = onusInside.filter(isOnline).length;
    const offlineTotal = onusInside.length - onlineTotal;
    const selectedIds = new Set(onusInside.map((o) => o.id));

    return {
      onusInside,
      pons,
      ctosSummary,
      onlineTotal,
      offlineTotal,
      selectedIds,
    };
  }, [areaToolActive, areaMode, circleCenter, circleRadius, polygonPoints, plotted]);

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
      {/* Barra Superior Esquerda: Botão e Controles de Análise de Área */}
      <div className="absolute top-3 left-3 right-16 sm:right-auto z-[1000] flex flex-col gap-2 max-w-md pointer-events-none">
        {!areaToolActive ? (
          <button
            onClick={() => setAreaToolActive(true)}
            className="pointer-events-auto self-start flex items-center gap-2 bg-gradient-to-r from-[#EB6410] to-[#E84818] hover:brightness-110 text-[#FFFFFF] text-xs font-bold px-3.5 py-2.5 rounded-xl shadow-lg border border-[#EB6410]/50 transition-all cursor-pointer"
          >
            <Radar className="w-4 h-4" />
            Analisar Área / Raio
          </button>
        ) : (
          <div className="pointer-events-auto bg-[#000000]/95 backdrop-blur-md border border-[#EB6410]/60 rounded-2xl p-3 shadow-2xl space-y-2.5 text-[#FFFFFF]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#EB6410] uppercase tracking-wider">
                <Radar className="w-4 h-4 text-[#EB6410]" />
                Análise de Área
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
                  onClick={handleCloseTool}
                  className="ml-1 p-1 text-[#D2D2D2] hover:text-[#FFFFFF] rounded-lg hover:bg-[#333333] transition-colors cursor-pointer"
                  title="Fechar análise de área"
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
            ) : (
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

      {/* Card de Resultado da Área Selecionada */}
      {areaSelection && (
        <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-3 sm:top-16 sm:bottom-auto z-[1000] sm:w-80 bg-[#000000]/95 backdrop-blur-md border border-[#EB6410]/50 rounded-2xl p-3.5 shadow-2xl text-[#FFFFFF] max-h-[55vh] flex flex-col gap-3 overflow-y-auto custom-scrollbar">
          {/* Resumo de Clientes e PONs */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#333333]/35 border border-[#333333] rounded-xl p-2.5">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#D2D2D2]">
                <span>Clientes na Área</span>
                <Users className="w-3.5 h-3.5 text-[#EB6410]" />
              </div>
              <div className="text-xl font-extrabold text-[#FFFFFF] mt-0.5">
                {areaSelection.onusInside.length}
              </div>
              <div className="text-[11px] font-semibold mt-0.5 flex items-center gap-2">
                <span className="text-emerald-400">{areaSelection.onlineTotal} on</span>
                <span className="text-[#333333]">&bull;</span>
                <span className="text-rose-400">{areaSelection.offlineTotal} off</span>
              </div>
            </div>

            <div className="bg-[#333333]/35 border border-[#333333] rounded-xl p-2.5">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#D2D2D2]">
                <span>PONs na Área</span>
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

          {/* Lista detalhada de PONs que atendem a área */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#D2D2D2] flex items-center justify-between">
              <span>Distribuição por Porta PON</span>
              <span>Clientes</span>
            </div>

            {areaSelection.pons.length === 0 ? (
              <p className="text-xs text-[#D2D2D2]/60 italic py-2 text-center">
                Nenhum cliente posicionado dentro deste perímetro.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
                {areaSelection.pons.map((p) => (
                  <div
                    key={`pon-${p.slot}-${p.pon}`}
                    onClick={() => onSelectPon?.(p.slot, p.pon)}
                    title={onSelectPon ? "Clique para filtrar apenas esta PON" : undefined}
                    className={`flex items-center justify-between bg-[#333333]/30 border border-[#333333] rounded-xl px-2.5 py-1.5 text-xs ${
                      onSelectPon ? "hover:border-[#EB6410] cursor-pointer transition-colors" : ""
                    }`}
                  >
                    <div className="font-bold text-[#FFFFFF]">
                      Slot <span className="text-[#EB6410]">{p.slot}</span> &bull; PON{" "}
                      <span className="text-[#EB6410]">{p.pon}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-semibold">
                      <span className="text-emerald-400">{p.online} on</span>
                      {p.offline > 0 && (
                        <span className="text-rose-400">{p.offline} off</span>
                      )}
                      <span className="px-1.5 py-0.5 rounded-md bg-[#EB6410]/20 text-[#DFDAC6] border border-[#EB6410]/40 font-extrabold">
                        {p.total}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CTOs vinculadas aos clientes da área */}
          {areaSelection.ctosSummary.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#D2D2D2] flex items-center gap-1">
                <Box className="w-3 h-3 text-[#EB6410]" />
                CTOs na Região ({areaSelection.ctosSummary.length})
              </div>
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto custom-scrollbar">
                {areaSelection.ctosSummary.map((c) => (
                  <span
                    key={c.ident}
                    className="text-[10px] font-semibold bg-[#333333]/40 border border-[#333333] text-[#DFDAC6] px-2 py-0.5 rounded-lg"
                  >
                    {c.ident} <strong className="text-[#EB6410]">({c.count})</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Lista expansível dos clientes dentro da área */}
          {areaSelection.onusInside.length > 0 && (
            <div className="pt-1 border-t border-[#333333]">
              <button
                onClick={() => setShowClientList((v) => !v)}
                className="w-full flex items-center justify-between text-[11px] font-bold text-[#EB6410] hover:text-[#DFDAC6] py-1 cursor-pointer"
              >
                <span>
                  {showClientList ? "Ocultar clientes da área" : "Ver clientes da área"} (
                  {areaSelection.onusInside.length})
                </span>
                {showClientList ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              {showClientList && (
                <div className="mt-1.5 space-y-1 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
                  {areaSelection.onusInside.map((o) => {
                    const on = isOnline(o);
                    return (
                      <div
                        key={`area-onu-${o.id}`}
                        className="flex items-center justify-between gap-2 text-[11px] bg-[#333333]/30 border border-[#333333] rounded-lg px-2 py-1"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              on ? "bg-emerald-500" : "bg-rose-500"
                            }`}
                          />
                          <span className="truncate text-[#FFFFFF] font-medium">
                            {o.service_cliente || `Contrato #${o.service_contrato}`}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-[#DFDAC6] shrink-0">
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
          cursor: areaToolActive ? "crosshair" : "grab",
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
