"use client";

import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { CtoPonto, OnuData, OnusResponse, WarmupState } from "@/types";
import {
  Activity,
  Router,
  AlertTriangle,
  Users,
  Filter,
  Search,
  RefreshCw,
  Wifi,
  WifiOff,
  Signal,
  Clipboard,
  HardDrive,
  Copy,
  Check,
  Map as MapIcon,
  LayoutGrid,
  MapPin,
  MapPinOff,
  Loader2
} from "lucide-react";
import GeoAudit from "@/components/GeoAudit";

// Leaflet acessa `window` na importação, então o mapa só pode carregar no cliente.
const MapComponent = dynamic(() => import("@/components/MapComponent"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-slate-900/40 flex items-center justify-center rounded-2xl">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

// Sub-componente para o Card da ONU para isolar o estado do botão "Copiar MAC"
function OnuCard({ onu }: { onu: OnuData }) {
  const [copied, setCopied] = useState(false);
  
  const isOnline = onu.online === true || onu.online === 1 || onu.online === "1";
  
  const handleCopyMac = () => {
    if (onu.phy_addr) {
      navigator.clipboard.writeText(onu.phy_addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const hasSignal = onu.info_rx !== undefined && onu.info_rx !== null && onu.info_rx !== 0;
  const signalValue = onu.info_rx;
  const isSignalGood = hasSignal && signalValue !== undefined && signalValue > -25;
  // O modo de operação não é problema — só status e sinal merecem destaque.
  const isWarning = !isOnline || (hasSignal && !isSignalGood);

  return (
    <div 
      className={`flex flex-col bg-slate-900/40 backdrop-blur-md rounded-2xl border transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
        isWarning 
          ? "border-amber-500/25 hover:border-amber-500/50 hover:bg-slate-900/60" 
          : "border-slate-800/80 hover:border-indigo-500/50 hover:bg-slate-900/60"
      }`}
    >
      {/* Cabeçalho do Card */}
      <div className="p-5 flex justify-between items-start gap-3 border-b border-slate-800/40">
        <div className="flex-1 min-w-0">
          <span className="font-bold text-white text-base tracking-tight block truncate" title={onu.service_cliente}>
            {onu.service_cliente || "Sem Nome Definido"}
          </span>
          <span className="text-[10px] text-slate-500 mt-0.5 block truncate">
            ID: #{onu.id} {onu.service_contrato ? `| Contrato: ${onu.service_contrato}` : ''}
          </span>
        </div>
        
        <div className="shrink-0 flex items-center gap-1.5">
          {isWarning && !isOnline && <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 animate-pulse" />}
          {isOnline ? (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.05)]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
              Online
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-[0_0_8px_rgba(244,63,94,0.05)]">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_6px_rgba(244,63,94,0.8)]" />
              Offline
            </span>
          )}
        </div>
      </div>

      {/* Corpo do Card */}
      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
        <div className="space-y-3">
          {/* Endereço MAC */}
          <div className="space-y-1.5">
            <span className="text-slate-500 font-medium text-xs block">Endereço MAC</span>
            <div className="flex items-center justify-between bg-slate-950/60 rounded-xl px-3 py-2 border border-slate-800/80 group transition-all hover:border-slate-700">
              <span className="font-mono text-xs text-slate-300 tracking-wider font-semibold select-all">
                {onu.phy_addr || "N/A"}
              </span>
              {onu.phy_addr && (
                <button 
                  onClick={handleCopyMac}
                  className="text-slate-500 hover:text-white p-1 rounded-lg hover:bg-slate-900 transition-all cursor-pointer relative"
                  title="Copiar MAC"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-400 transition-colors" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Detalhes de Conexão */}
          <div className="grid grid-cols-2 gap-3">
            {/* Sinal RX */}
            <div className="bg-slate-950/25 border border-slate-800/60 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block mb-1">Sinal RX</span>
              {hasSignal ? (
                <span className={`text-sm font-extrabold flex items-center gap-1.5 ${
                  isSignalGood 
                    ? "text-emerald-400" 
                    : "text-amber-500"
                }`}>
                  <Signal className="w-3.5 h-3.5 shrink-0" />
                  {signalValue} dBm
                </span>
              ) : (
                <span className="text-slate-500 text-xs font-semibold italic">Sem Sinal</span>
              )}
            </div>

            {/* Modo de Operação */}
            <div className="bg-slate-950/25 border border-slate-800/60 rounded-xl p-3 flex flex-col justify-between">
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block mb-1">Modo</span>
              <span className="text-xs font-extrabold flex items-center justify-center py-0.5 rounded-lg border bg-slate-800/60 text-slate-300 border-slate-700/60">
                {onu.mode}
              </span>
            </div>
          </div>

          {/* OLT Localização */}
          <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-950/30 rounded-xl px-3 py-2 border border-slate-800/60">
            <HardDrive className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="font-medium">
              Slot <strong className="text-white">{onu.slot}</strong> &bull; PON <strong className="text-white">{onu.pon}</strong> &bull; ONU <strong className="text-white">{onu.onu}</strong>
            </span>
          </div>

          {/* Endereço do assinante */}
          {onu.enderecoLinha && (
            <div className="flex items-start gap-2 text-xs bg-slate-950/30 rounded-xl px-3 py-2 border border-slate-800/60">
              <MapPin className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <span className="text-slate-300 font-medium leading-snug block">
                  {onu.enderecoLinha}
                </span>
                {onu.address?.pontoreferencia && (
                  <span className="text-slate-500 italic text-[11px] block mt-0.5">
                    Ref.: {onu.address.pontoreferencia}
                  </span>
                )}
                {onu.lat !== null && onu.lng !== null && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${onu.lat},${onu.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-400 hover:text-indigo-300 font-semibold text-[11px] mt-1 inline-block underline underline-offset-2"
                  >
                    Traçar rota
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Rodapé: Observações de Campo / CTO */}
        <div className="pt-3 border-t border-slate-800/60">
          <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
            <Clipboard className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            INSTRUÇÕES DE RUA / CTO
          </div>
          <div className="p-3 bg-slate-800 text-xs text-slate-200 leading-relaxed font-medium rounded-xl border border-slate-700/60 shadow-inner whitespace-pre-wrap break-words min-h-[60px]">
            {onu.notes && onu.notes.trim() !== "" ? (
              onu.notes
            ) : (
              <span className="text-slate-500 italic font-normal">Sem observações registradas.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const AVAILABLE_SLOTS = [8, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const AVAILABLE_PONS = Array.from({ length: 16 }, (_, i) => i); // 0 a 15

export default function DashboardLayout() {
  const [onus, setOnus] = useState<OnuData[]>([]);
  const [ctos, setCtos] = useState<CtoPonto[]>([]);
  const [meta, setMeta] = useState<OnusResponse["meta"] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [escopo, setEscopo] = useState<'pon' | 'slot' | 'tudo'>('pon');
  const [aquecendo, setAquecendo] = useState<WarmupState | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string>("17");
  const [selectedPon, setSelectedPon] = useState<string>("2");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ONLINE' | 'OFFLINE'>('ALL');
  const [viewMode, setViewMode] = useState<'MAPA' | 'LISTA' | 'PENDENCIAS'>('MAPA');

  const fetchOnus = async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      const res = await fetch(
        `/api/onus?escopo=${escopo}&slot=${selectedSlot}&pon=${selectedPon}`
      );
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || data.detail || `Erro ao carregar dados da rede (HTTP ${res.status})`);
        return;
      }

      const payload = data as OnusResponse;
      const validOnus = (payload.onus ?? []).filter(onu => !!onu.service_contrato);
      setOnus(validOnus);
      setCtos(payload.ctos ?? []);
      setMeta(payload.meta ?? null);
    } catch (error) {
      console.warn("Erro ao buscar dados do NOC:", error);
      setErrorMsg("Ocorreu uma falha inesperada na comunicação com a API local.");
    } finally {
      setIsLoading(false);
    }
  };

  /** Dispara o preenchimento do cache de endereços da rede inteira. */
  const iniciarAquecimento = async () => {
    try {
      const res = await fetch("/api/onus/warmup", { method: "POST" });
      const estado: WarmupState = await res.json();
      setAquecendo(estado);
    } catch (error) {
      console.warn("Falha ao iniciar aquecimento:", error);
    }
  };

  useEffect(() => {
    // Busca inicial e a cada mudança de escopo, slot ou PON
    fetchOnus();

    // Auto-refresh a cada 60 segundos
    const intervalId = setInterval(fetchOnus, 60000);

    return () => clearInterval(intervalId); // Limpa o intervalo ao desmontar ou atualizar dependências
  }, [escopo, selectedSlot, selectedPon]);

  // Acompanha o aquecimento e recarrega os dados quando ele termina.
  useEffect(() => {
    if (!aquecendo?.rodando) return;

    const id = setInterval(async () => {
      try {
        const estado: WarmupState = await (await fetch("/api/onus/warmup")).json();
        setAquecendo(estado);
        if (!estado.rodando) {
          clearInterval(id);
          fetchOnus();
        }
      } catch {
        clearInterval(id);
      }
    }, 2000);

    return () => clearInterval(id);
  }, [aquecendo?.rodando]);

  // Lógica de Busca de Assinantes
  const filteredOnus = useMemo(() => {
    return onus.filter((onu) => {
      // Busca dinâmica (Nome, MAC, Login ou Contrato)
      const nameStr = (onu.service_cliente || "").toLowerCase();
      const macStr = (onu.phy_addr || "").toLowerCase();
      const loginStr = (onu.service_login || "").toLowerCase();
      const contractStr = (onu.service_contrato || "").toString();
      const searchLower = searchQuery.toLowerCase().trim();
      
      const matchSearch = searchQuery === "" || 
        nameStr.includes(searchLower) ||
        macStr.includes(searchLower) ||
        loginStr.includes(searchLower) ||
        contractStr.includes(searchLower);

      return matchSearch;
    });
  }, [searchQuery, onus]);

  // Lógica de Renderização do Grid (Cruzamento de Status com Pesquisa de Texto)
  const displayedOnus = useMemo(() => {
    return onus.filter(onu => {
      // 1. Filtro de Status
      const isOnline = onu.online === true || onu.online === 1 || String(onu.online) === "1";
      const matchesStatus = 
        statusFilter === 'ALL' ? true :
        statusFilter === 'ONLINE' ? isOnline :
        !isOnline; // OFFLINE

      // 2. Filtro de Pesquisa de Texto (Nome, MAC, Login ou Contrato)
      const nameStr = (onu.service_cliente || "").toLowerCase();
      const macStr = (onu.phy_addr || "").toLowerCase();
      const loginStr = (onu.service_login || "").toLowerCase();
      const contractStr = (onu.service_contrato || "").toString();
      const searchLower = searchQuery.toLowerCase().trim();
      
      const matchesSearch = searchQuery === "" || 
        nameStr.includes(searchLower) ||
        macStr.includes(searchLower) ||
        loginStr.includes(searchLower) ||
        contractStr.includes(searchLower);

      return matchesStatus && matchesSearch;
    });
  }, [onus, statusFilter, searchQuery]);

  // KPIs calculados com base no conjunto filtrado atual
  const totalCount = filteredOnus.length;
  const onlineCount = useMemo(() => {
    return filteredOnus.filter(o => o.online === true || o.online === 1 || o.online === "1").length;
  }, [filteredOnus]);
  const offlineCount = totalCount - onlineCount;

  // Quantas das ONUs exibidas o SGP consegue posicionar no mapa.
  const geoCount = useMemo(
    () => displayedOnus.filter(o => o.lat !== null && o.lng !== null).length,
    [displayedOnus]
  );

  // Pendências que valem uma conferida no cadastro do SGP. ONU sem contrato fica
  // de fora da contagem: não há endereço a preencher, então não é pendência.
  const pendenciasCount = useMemo(
    () => displayedOnus.filter(o =>
      o.geoIssue === 'sem_pin' || o.geoIssue === 'falha_sgp' || o.geoIssue === 'aproximado_cto'
    ).length,
    [displayedOnus]
  );

  if (isLoading) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-slate-950 font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-indigo-400 font-medium animate-pulse tracking-wide">
            Buscando dados da rede SGP...
          </p>
        </div>
      </main>
    );
  }

  if (errorMsg) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-slate-950 font-sans p-6">
        <div className="bg-red-500/10 border border-red-500/20 p-8 rounded-2xl max-w-lg text-center shadow-2xl">
          <h2 className="text-2xl font-bold text-red-400 mb-4">Falha na Comunicação</h2>
          <p className="text-slate-300 mb-6">{errorMsg}</p>
          <button 
            onClick={fetchOnus}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-all border border-slate-800 hover:border-slate-700 shadow-md font-medium cursor-pointer"
          >
            Tentar Novamente
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full bg-slate-950 font-sans text-slate-200 flex flex-col pb-12">
      {/* Cabeçalho Fixo / Sticky */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 px-4 py-4 md:px-8 flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)]">
            <Activity className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-extrabold bg-gradient-to-r from-indigo-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent tracking-tight">
              Sys3 Telecom &bull; Diagnóstico de Campo
            </h1>
            <p className="text-xs text-slate-400 font-medium hidden sm:block mt-0.5">
              Monitoramento rápido e autônomo para técnicos de rua
            </p>
            <p className="text-xs text-slate-400 font-medium sm:hidden mt-0.5">
              Diagnóstico Autônomo FTTH
            </p>
          </div>
        </div>
        
        <button 
          onClick={fetchOnus}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 hover:border-slate-700 transition-all font-semibold text-sm shadow-md cursor-pointer group disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 text-indigo-400 group-hover:rotate-180 transition-transform duration-500 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Atualizar</span>
        </button>
      </header>

      {/* Container Principal */}
      <div className="max-w-7xl w-full mx-auto px-4 md:px-8 mt-6 space-y-6 flex-1 flex flex-col">
        {/* Painel Superior: Filtros & KPIs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-slate-900/30 border border-slate-905 rounded-2xl p-6 backdrop-blur-md shadow-xl shrink-0">
          {/* Filtros e Busca */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Filter className="w-4 h-4 text-indigo-450" /> Busca & Filtros de Rede
              </h2>

              {/* Escopo: quanto da rede entra na visão */}
              <div className="flex bg-slate-950/60 border border-slate-800 rounded-xl p-1 gap-1">
                {([
                  { v: 'pon', label: 'Esta PON' },
                  { v: 'slot', label: 'Slot inteiro' },
                  { v: 'tudo', label: 'Toda a rede' },
                ] as const).map(op => (
                  <button
                    key={op.v}
                    onClick={() => setEscopo(op.v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      escopo === op.v
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : 'text-slate-500 hover:text-slate-300 border border-transparent'
                    }`}
                  >
                    {op.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Pesquisa Livre */}
              <div className="relative">
                <label className="block text-[11px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5">Pesquisar Assinante</label>
                <div className="relative">
                  <input 
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Nome, MAC ou Login..."
                    className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-sm text-slate-200 rounded-xl pl-9 pr-3 py-2.5 outline-none focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-500"
                  />
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>
              
              {/* Select Slot */}
              <div>
                <label className="block text-[11px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5">Slot da OLT</label>
                <select
                  value={selectedSlot}
                  onChange={(e) => setSelectedSlot(e.target.value)}
                  disabled={escopo === 'tudo'}
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-sm text-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-1 focus:ring-indigo-500 transition-all appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {AVAILABLE_SLOTS.map(slot => (
                    <option key={`slot-${slot}`} value={slot.toString()}>Slot {slot}</option>
                  ))}
                </select>
              </div>
              
              {/* Select PON */}
              <div>
                <label className="block text-[11px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5">Porta PON</label>
                <select
                  value={selectedPon}
                  onChange={(e) => setSelectedPon(e.target.value)}
                  disabled={escopo !== 'pon'}
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-sm text-slate-200 rounded-xl px-3 py-2.5 outline-none focus:ring-1 focus:ring-indigo-500 transition-all appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {AVAILABLE_PONS.map(pon => (
                    <option key={`pon-${pon}`} value={pon.toString()}>Porta PON {pon}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Cards de KPIs */}
          <div className="grid grid-cols-3 gap-3 h-full items-end">
            {/* Total */}
            <div 
              onClick={() => setStatusFilter('ALL')}
              className={`bg-slate-950/40 rounded-xl p-4 flex flex-col justify-between min-h-[92px] cursor-pointer transition-all hover:brightness-110 ${
                statusFilter === 'ALL' 
                  ? 'ring-2 ring-blue-500 border-transparent shadow-[0_0_12px_rgba(59,130,246,0.15)] opacity-100' 
                  : 'border border-slate-800/80 opacity-70 hover:opacity-100'
              }`}
            >
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Total</span>
                <span className="text-2xl font-extrabold text-white mt-1 block tracking-tight">
                  {totalCount}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2">
                <span>ONUs</span>
                <Users className="w-3.5 h-3.5 text-indigo-400" />
              </div>
            </div>

            {/* Online */}
            <div 
              onClick={() => setStatusFilter('ONLINE')}
              className={`bg-emerald-500/5 rounded-xl p-4 flex flex-col justify-between min-h-[92px] cursor-pointer transition-all hover:brightness-110 ${
                statusFilter === 'ONLINE' 
                  ? 'ring-2 ring-emerald-500 border-transparent shadow-[0_0_12px_rgba(16,185,129,0.15)] opacity-100' 
                  : 'border border-emerald-500/10 opacity-70 hover:opacity-100'
              }`}
            >
              <div>
                <span className="text-[10px] font-bold text-emerald-500/80 uppercase tracking-widest block">Online</span>
                <span className="text-2xl font-extrabold text-emerald-400 mt-1 block tracking-tight">
                  {onlineCount}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-emerald-400/80 mt-2">
                <span>Ativos</span>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              </div>
            </div>

            {/* Offline */}
            <div 
              onClick={() => setStatusFilter('OFFLINE')}
              className={`bg-rose-500/5 rounded-xl p-4 flex flex-col justify-between min-h-[92px] cursor-pointer transition-all hover:brightness-110 ${
                statusFilter === 'OFFLINE' 
                  ? 'ring-2 ring-rose-500 border-transparent shadow-[0_0_12px_rgba(244,63,94,0.15)] opacity-100' 
                  : 'border border-rose-500/10 opacity-70 hover:opacity-100'
              }`}
            >
              <div>
                <span className="text-[10px] font-bold text-rose-500/80 uppercase tracking-widest block">Offline</span>
                <span className="text-2xl font-extrabold text-rose-400 mt-1 block tracking-tight">
                  {offlineCount}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-rose-400/80 mt-2">
                <span>Inativos</span>
                <WifiOff className="w-3.5 h-3.5 text-rose-450" />
              </div>
            </div>
          </div>
        </div>

        {/* Aquecimento do cache de endereços (escopos grandes) */}
        {(aquecendo?.rodando || (meta?.pendentes ?? 0) > 0) && (
          <div className="flex items-center justify-between gap-4 px-5 py-3.5 bg-indigo-500/5 border border-indigo-500/25 rounded-2xl shrink-0 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              {aquecendo?.rodando ? (
                <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
              ) : (
                <MapPinOff className="w-4 h-4 text-indigo-400 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-xs font-bold text-indigo-200">
                  {aquecendo?.rodando
                    ? `Buscando endereços no SGP — ${aquecendo.feitos} de ${aquecendo.total}`
                    : `${meta?.pendentes} ONUs ainda sem endereço carregado`}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  {aquecendo?.rodando
                    ? "O mapa se completa sozinho quando terminar. Pode continuar usando."
                    : "O SGP responde um contrato por vez; carregue uma vez e fica em cache por 12h."}
                </p>
              </div>
            </div>

            {aquecendo?.rodando ? (
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-40 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-500"
                    style={{
                      width: `${aquecendo.total ? Math.round((aquecendo.feitos / aquecendo.total) * 100) : 0}%`,
                    }}
                  />
                </div>
                <span className="text-xs font-bold text-indigo-300 tabular-nums">
                  {aquecendo.total ? Math.round((aquecendo.feitos / aquecendo.total) * 100) : 0}%
                </span>
              </div>
            ) : (
              <button
                onClick={iniciarAquecimento}
                className="shrink-0 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Carregar endereços
              </button>
            )}
          </div>
        )}

        {/* Listagem de ONUs (Grid Responsivo) */}
        <div className="flex-1 flex flex-col">
          <div className="flex justify-between items-center gap-3 mb-4 px-1 shrink-0 flex-wrap">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Router className="w-4 h-4 text-indigo-400" /> Clientes Filtrados ({displayedOnus.length})
              {displayedOnus.length > 0 && (
                <span className="flex items-center gap-1 text-[11px] normal-case tracking-normal font-medium text-slate-500">
                  <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                  {geoCount} no mapa
                </span>
              )}
            </h2>

            <div className="flex items-center gap-3">
              {(searchQuery || statusFilter !== 'ALL') && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("ALL");
                  }}
                  className="text-xs text-indigo-450 hover:text-indigo-300 font-semibold cursor-pointer underline underline-offset-4"
                >
                  Limpar Filtros
                </button>
              )}

              {/* Alternador Mapa / Lista */}
              <div className="flex bg-slate-950/60 border border-slate-800 rounded-xl p-1 gap-1">
                <button
                  onClick={() => setViewMode('MAPA')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'MAPA'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-500 hover:text-slate-300 border border-transparent'
                  }`}
                >
                  <MapIcon className="w-3.5 h-3.5" /> Mapa
                </button>
                <button
                  onClick={() => setViewMode('LISTA')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'LISTA'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-500 hover:text-slate-300 border border-transparent'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" /> Lista
                </button>
                <button
                  onClick={() => setViewMode('PENDENCIAS')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'PENDENCIAS'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-slate-500 hover:text-slate-300 border border-transparent'
                  }`}
                >
                  <MapPinOff className="w-3.5 h-3.5" /> Pendências
                  {pendenciasCount > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-extrabold">
                      {pendenciasCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {displayedOnus.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/10 border border-slate-800/80 rounded-2xl p-8 backdrop-blur-sm flex-1 flex flex-col items-center justify-center">
              <AlertTriangle className="w-12 h-12 text-amber-500/80 mb-4 animate-pulse" />
              <h3 className="text-lg font-bold text-white mb-2">Nenhum assinante localizado</h3>
              <p className="text-slate-400 max-w-md mx-auto text-sm leading-relaxed">
                Não encontramos nenhuma ONU correspondente aos filtros de Slot/PON, status <strong className="text-slate-200">"{statusFilter}"</strong> ou ao termo de pesquisa {searchQuery ? <strong className="text-slate-200">"{searchQuery}"</strong> : "digitado"}. 
                Experimente limpar os termos de busca, alterar o filtro de status ou selecionar outro Slot.
              </p>
            </div>
          ) : viewMode === 'MAPA' ? (
            <div className="space-y-3">
              <div className="h-[calc(100vh-420px)] min-h-[460px] rounded-2xl overflow-hidden border border-slate-800/80 shadow-xl">
                <MapComponent onus={displayedOnus} ctos={ctos} />
              </div>

              {/* Legenda */}
              <div className="flex items-center gap-x-5 gap-y-2 flex-wrap px-4 py-3 bg-slate-900/30 border border-slate-800/60 rounded-2xl text-[11px] font-medium text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full border-2 border-indigo-400 bg-indigo-950" />
                  CTO / Splitter
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                  ONU online
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-amber-500 border-2 border-white" />
                  Sinal fraco
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-rose-500 border-2 border-white" />
                  ONU offline
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full border-2 border-dashed border-slate-300" />
                  Posição da CTO
                </span>
              </div>
            </div>
          ) : viewMode === 'PENDENCIAS' ? (
            <GeoAudit onus={displayedOnus} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {displayedOnus.map((onu) => (
                <OnuCard key={onu.id} onu={onu} />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
