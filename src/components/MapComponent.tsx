"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { CtoPonto, OnuData } from "@/types";
import L from "leaflet";

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
}

/** Ajusta o enquadramento sempre que o conjunto de pontos muda. */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 17);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [56, 56], maxZoom: 18 });
  }, [map, points]);

  return null;
}

export default function MapComponent({ onus, ctos }: MapComponentProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [mapKey, setMapKey] = useState("map-init");

  useEffect(() => {
    initIconFix();
    setIsMounted(true);
    // HMR Fix: Atualiza a key para forçar o React-Leaflet a recriar a instância do mapa
    // durante o Fast Refresh do Next.js, evitando o erro 'appendChild'
    setMapKey(Date.now().toString());
  }, []);

  // Só entra no mapa quem realmente tem posição vinda do SGP.
  const plotted = useMemo(
    () => onus.filter((o): o is OnuData & { lat: number; lng: number } =>
      o.lat !== null && o.lng !== null
    ),
    [onus]
  );

  const semCoordenada = onus.filter((o) => o.lat === null && !o.aguardandoGeo).length;

  const bounds = useMemo<[number, number][]>(
    () => [
      ...plotted.map((o) => [o.lat, o.lng] as [number, number]),
      ...ctos.map((c) => [c.lat, c.lng] as [number, number]),
    ],
    [plotted, ctos]
  );

  if (!isMounted) {
    return (
      <div className="h-full w-full bg-slate-900 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Verde online, vermelho offline, âmbar quando o sinal está fraco. O modo de
  // operação (Bridge/PPPoE) não entra na cor — não muda o diagnóstico de campo.
  const createCustomIcon = (online: boolean, infoRx: number | undefined, aproximado: boolean) => {
    let color = "#10b981";
    if (!online) color = "#ef4444";
    else if (infoRx !== undefined && infoRx < -25) color = "#f59e0b";

    // Borda sólida x tracejada distingue posição própria de herdada da CTO.
    const border = aproximado ? "3px dashed #cbd5e1" : "3px solid white";

    return L.divIcon({
      className: "custom-div-icon",
      html: `<div style="background-color:${color};width:18px;height:18px;border-radius:50%;border:${border}"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  };

  return (
    <div className="h-full w-full relative z-0">
      {semCoordenada > 0 && (
        <div className="absolute top-3 right-3 z-[1000] bg-slate-950/85 backdrop-blur-md border border-amber-500/30 text-amber-300 text-xs font-semibold px-3 py-2 rounded-xl shadow-lg">
          {semCoordenada} ONU{semCoordenada > 1 ? "s" : ""} sem coordenada no SGP
        </div>
      )}

      <MapContainer
        key={mapKey}
        center={[-7.115, -34.861]}
        zoom={14}
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
        // CTOs viram desenho em canvas: um elemento no DOM em vez de um por
        // círculo, o que sustenta a rede inteira sem travar.
        preferCanvas
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png"
        />

        <FitBounds points={bounds} />

        {ctos.map((cto) => {
          const filhas = plotted.filter((o) => o.cto === cto.ident);
          const ativas = filhas.filter(isOnline).length;
          return (
            <CircleMarker
              key={`cto-${cto.ident}`}
              center={[cto.lat, cto.lng]}
              radius={8}
              pathOptions={{
                color: ativas > 0 ? "#818cf8" : "#64748b",
                weight: 2.5,
                fillColor: "#1e1b4b",
                fillOpacity: 0.85,
              }}
            >
              <Popup>
                <div className="p-1 min-w-[190px]">
                  <h3 className="font-bold text-slate-800 text-sm mb-1">{cto.ident}</h3>
                  <p className="text-xs text-slate-600 mb-1.5">
                    {cto.nota || "Sem referência cadastrada"}
                  </p>
                  <p className="text-xs font-semibold text-slate-700">
                    {ativas} de {filhas.length} ONU{filhas.length === 1 ? "" : "s"} online
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {plotted.map((onu) => {
          const online = isOnline(onu);
          const aproximado = onu.coordSource === "cto";

          return (
            <Marker
              key={onu.id}
              position={[onu.lat, onu.lng]}
              icon={createCustomIcon(online, onu.info_rx, aproximado)}
            >
              <Popup className="custom-popup">
                <div className="p-1 min-w-[220px]">
                  <div className="flex items-center gap-2 mb-1 pb-2 border-b border-slate-100">
                    <div className={`w-2.5 h-2.5 rounded-full ${!online ? "bg-red-500" : "bg-emerald-500"}`} />
                    <h3 className="font-bold text-slate-800 text-base leading-none">
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
                    <div className="mt-2 text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      Posição aproximada (da CTO)
                    </div>
                  )}

                  <div className="space-y-2 mt-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">OLT/PON:</span>
                      <span className="font-semibold text-slate-700">{onu.olt_id} / {onu.pon}</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">Slot:</span>
                      <span className="font-semibold text-slate-700">{onu.slot}</span>
                    </div>

                    {onu.cto && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 font-medium">CTO:</span>
                        <span className="font-semibold text-slate-700 text-xs text-right">
                          {onu.cto}{onu.ctoport ? ` / P${onu.ctoport}` : ""}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">MAC:</span>
                      <span className="font-mono text-xs text-slate-600 bg-slate-100 px-1 py-0.5 rounded">
                        {onu.phy_addr}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">Sinal (RX):</span>
                      <span className={`font-semibold ${onu.info_rx && onu.info_rx < -25 ? "text-amber-500" : "text-slate-700"}`}>
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
                      className="block text-center mt-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors"
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
