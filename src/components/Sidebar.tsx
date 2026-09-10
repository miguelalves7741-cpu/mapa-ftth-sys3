import { OnuData } from "@/types";
import { Activity, Router, AlertTriangle, Users, Filter } from "lucide-react";

interface SidebarProps {
  onus: OnuData[];
  slotFilter: string;
  setSlotFilter: (val: string) => void;
  ponFilter: string;
  setPonFilter: (val: string) => void;
  availableSlots: number[];
  availablePons: number[];
}

export default function Sidebar({ 
  onus, 
  slotFilter, 
  setSlotFilter, 
  ponFilter, 
  setPonFilter,
  availableSlots,
  availablePons 
}: SidebarProps) {
  const total = onus.length;
  // Atualização dos KPIs para status Online/Offline
  const onlineCount = onus.filter(o => o.online === true || o.online === 1 || o.online === "1").length;
  const offlineCount = onus.length - onlineCount;

  return (
    <aside className="h-full w-1/4 bg-slate-900 border-r border-slate-800 flex flex-col shadow-2xl z-10">
      {/* Header */}
      <div className="p-6 border-b border-slate-800 bg-slate-950/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
            <Activity className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Monitoramento FTTH</h1>
            <p className="text-sm text-slate-400 font-medium">Sys3 Telecom NOC</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="p-6 grid grid-cols-2 gap-4 shrink-0 border-b border-slate-800">
        <div className="col-span-2 bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-400 font-medium">Total de ONUs Filtradas</p>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-3xl font-bold text-white mt-1">{total}</p>
        </div>

        <div className="bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/20">
          <p className="text-xs text-emerald-400/80 font-semibold uppercase tracking-wider mb-1">Online</p>
          <p className="text-2xl font-bold text-emerald-400">{onlineCount}</p>
        </div>

        <div className="bg-red-500/10 rounded-xl p-4 border border-red-500/20">
          <p className="text-xs text-red-400/80 font-semibold uppercase tracking-wider mb-1">Offline</p>
          <p className="text-2xl font-bold text-red-400">{offlineCount}</p>
        </div>
      </div>

      {/* Filtros de Rede */}
      <div className="p-6 border-b border-slate-800 bg-slate-900 shrink-0">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Filter className="w-4 h-4" /> Filtros de Rede
        </h2>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs text-slate-500 font-medium mb-1">Slot</label>
            <select 
              value={slotFilter}
              onChange={(e) => setSlotFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-sm text-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            >
              <option value="Todos">Todos</option>
              {availableSlots.map(slot => (
                <option key={`slot-${slot}`} value={slot.toString()}>{slot}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-slate-500 font-medium mb-1">PON</label>
            <select 
              value={ponFilter}
              onChange={(e) => setPonFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-sm text-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            >
              <option value="Todos">Todas</option>
              {availablePons.map(pon => (
                <option key={`pon-${pon}`} value={pon.toString()}>{pon}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Alertas/Lista de ONUs */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider px-2 mb-4 flex items-center gap-2">
          <Router className="w-4 h-4" /> ONUs Ativas
        </h2>
        
        {onus.map((onu) => {
          const isOnline = onu.online === true || onu.online === 1 || onu.online === "1";
          const isWarning = onu.mode === "Bridge" || !onu.service_cliente || !isOnline;
          
          return (
            <div 
              key={onu.id} 
              className={`p-4 rounded-xl border transition-all duration-300 hover:-translate-y-0.5 ${
                isWarning 
                  ? "bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40 hover:bg-amber-500/10" 
                  : "bg-slate-800/30 border-slate-700/50 hover:border-slate-600 hover:bg-slate-800/50"
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${!isOnline ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" : (onu.info_rx && onu.info_rx < -25 ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]")}`} />
                  <span className="font-semibold text-slate-200">
                    {onu.service_cliente || "Sem Nome Definido"}
                  </span>
                </div>
                {isWarning && <AlertTriangle className="w-4 h-4 text-amber-500" />}
              </div>
              
              <div className="flex flex-col gap-1 text-sm text-slate-400 mt-3">
                <div className="flex justify-between">
                  <span className="text-slate-500">MAC:</span>
                  <span className="font-mono text-slate-300">{onu.phy_addr}</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-slate-500">Localização:</span>
                  <span className="text-slate-300 font-medium">Slot: {onu.slot} | PON: {onu.pon}</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-slate-500">Modo:</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    onu.mode === "PPPoE" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                  }`}>
                    {onu.mode}
                  </span>
                </div>
                <div className="flex justify-between items-start mt-2 pt-2 border-t border-slate-700/30">
                  <span className="text-slate-500 mt-0.5">Observações:</span>
                  <p className="text-xs text-slate-400 line-clamp-2 max-w-[160px] text-right" title={onu.notes}>
                    {onu.notes || "Sem observações"}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        {onus.length === 0 && (
          <div className="text-center p-8 text-slate-500">
            Nenhuma ONU encontrada para os filtros selecionados.
          </div>
        )}
      </div>
    </aside>
  );
}
