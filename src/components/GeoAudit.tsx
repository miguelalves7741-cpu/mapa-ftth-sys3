"use client";

import { useMemo, useState } from "react";
import { OnuData, GeoIssue } from "@/types";
import { MapPinOff, Copy, Check, AlertTriangle, CircleSlash, MapPin } from "lucide-react";

/** Como cada motivo se apresenta e o que o técnico deve fazer no SGP. */
const ISSUE_INFO: Record<
  Exclude<GeoIssue, null>,
  { titulo: string; acao: string; cor: string; borda: string; icone: typeof MapPinOff }
> = {
  sem_pin: {
    titulo: "Sem coordenada no cadastro",
    acao: "Endereço está preenchido, mas falta marcar o ponto no mapa do contrato no SGP. É o caso corrigível.",
    cor: "text-amber-300",
    borda: "border-amber-500/30 bg-amber-500/5",
    icone: MapPinOff,
  },
  falha_sgp: {
    titulo: "SGP não devolveu o endereço",
    acao: "A API falha ao serializar este cadastro. Vale abrir o contrato no SGP e revisar os campos de endereço.",
    cor: "text-rose-300",
    borda: "border-rose-500/30 bg-rose-500/5",
    icone: AlertTriangle,
  },
  aproximado_cto: {
    titulo: "Plotada na CTO (aproximada)",
    acao: "Sem coordenada própria; usando a posição da caixa. Marcar o ponto do contrato deixa exato.",
    cor: "text-indigo-300",
    borda: "border-indigo-500/30 bg-indigo-500/5",
    icone: MapPin,
  },
  sem_contrato: {
    titulo: "Sem contrato vinculado",
    acao: "ONU sem cliente associado. Esperado — não há endereço a cadastrar.",
    cor: "text-slate-400",
    borda: "border-slate-700/60 bg-slate-950/30",
    icone: CircleSlash,
  },
};

/** Ordem de exibição: o que dá para corrigir aparece primeiro. */
const ORDEM: Exclude<GeoIssue, null>[] = ["sem_pin", "falha_sgp", "aproximado_cto", "sem_contrato"];

function linhaTexto(onu: OnuData): string {
  return [
    `ONU #${onu.id}`,
    onu.service_contrato ? `Contrato ${onu.service_contrato}` : "sem contrato",
    onu.service_cliente || "sem nome",
    `Slot ${onu.slot}/PON ${onu.pon}`,
    onu.phy_addr || "",
    onu.enderecoLinha || "sem endereço",
  ].join("\t");
}

export default function GeoAudit({ onus }: { onus: OnuData[] }) {
  const [copiedGroup, setCopiedGroup] = useState<string | null>(null);

  const grupos = useMemo(() => {
    return ORDEM.map((issue) => ({
      issue,
      info: ISSUE_INFO[issue],
      itens: onus.filter((o) => o.geoIssue === issue),
    })).filter((g) => g.itens.length > 0);
  }, [onus]);

  const copiarGrupo = (issue: string, itens: OnuData[]) => {
    const cabecalho = "ONU\tContrato\tCliente\tSlot/PON\tMAC\tEndereço";
    navigator.clipboard.writeText([cabecalho, ...itens.map(linhaTexto)].join("\n"));
    setCopiedGroup(issue);
    setTimeout(() => setCopiedGroup(null), 2000);
  };

  if (grupos.length === 0) {
    return (
      <div className="text-center py-16 bg-slate-900/10 border border-emerald-500/20 rounded-2xl p-8 flex-1 flex flex-col items-center justify-center">
        <MapPin className="w-12 h-12 text-emerald-500/80 mb-4" />
        <h3 className="text-lg font-bold text-white mb-2">Nenhuma pendência de cadastro</h3>
        <p className="text-slate-400 max-w-md mx-auto text-sm leading-relaxed">
          Todas as ONUs deste filtro têm coordenada própria vinda do endereço do contrato.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {grupos.map(({ issue, info, itens }) => {
        const Icone = info.icone;
        return (
          <div key={issue} className={`rounded-2xl border ${info.borda} overflow-hidden`}>
            <div className="px-5 py-4 flex items-start justify-between gap-4 border-b border-slate-800/60">
              <div className="flex items-start gap-3 min-w-0">
                <Icone className={`w-5 h-5 shrink-0 mt-0.5 ${info.cor}`} />
                <div className="min-w-0">
                  <h3 className={`font-bold text-sm ${info.cor}`}>
                    {info.titulo}
                    <span className="ml-2 text-xs font-semibold text-slate-500">
                      {itens.length} ONU{itens.length > 1 ? "s" : ""}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{info.acao}</p>
                </div>
              </div>

              <button
                onClick={() => copiarGrupo(issue, itens)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-800 hover:border-slate-700 transition-all text-xs font-semibold cursor-pointer"
                title="Copiar como tabela (colar em planilha)"
              >
                {copiedGroup === issue ? (
                  <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado</>
                ) : (
                  <><Copy className="w-3.5 h-3.5" /> Copiar</>
                )}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 text-[10px] uppercase tracking-wider">
                    <th className="text-left font-bold px-5 py-2.5">ONU</th>
                    <th className="text-left font-bold px-3 py-2.5">Contrato</th>
                    <th className="text-left font-bold px-3 py-2.5">Cliente</th>
                    <th className="text-left font-bold px-3 py-2.5 whitespace-nowrap">Slot / PON</th>
                    <th className="text-left font-bold px-3 py-2.5">CTO</th>
                    <th className="text-left font-bold px-5 py-2.5">Endereço no SGP</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((onu) => (
                    <tr
                      key={onu.id}
                      className="border-t border-slate-800/40 hover:bg-slate-900/40 transition-colors"
                    >
                      <td className="px-5 py-2.5 font-mono text-slate-300 font-semibold whitespace-nowrap">
                        #{onu.id}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-300 whitespace-nowrap">
                        {onu.service_contrato ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-slate-300 max-w-[200px] truncate" title={onu.service_cliente}>
                        {onu.service_cliente || <span className="text-slate-600 italic">sem nome</span>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                        {onu.slot} / {onu.pon}
                      </td>
                      <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                        {onu.cto ? `${onu.cto}${onu.ctoport ? ` P${onu.ctoport}` : ""}` : "—"}
                      </td>
                      <td className="px-5 py-2.5 text-slate-400 max-w-[320px]">
                        {onu.enderecoLinha || <span className="text-slate-600 italic">não retornado</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
