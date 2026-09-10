export interface OnuAddress {
  logradouro?: string;
  numero?: number | string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  complemento?: string;
  pontoreferencia?: string;
  map_ll?: string | null;
}

/** De onde saiu a coordenada usada para plotar a ONU no mapa. */
export type CoordSource = "endereco" | "cto" | "contrato" | null;

/**
 * Por que a ONU não entrou no mapa (ou entrou de forma imprecisa).
 * - `sem_contrato`: ONU sem cliente vinculado. Esperado, não há o que corrigir.
 * - `sem_pin`: endereço cadastrado, mas sem coordenada no SGP. Corrigível.
 * - `falha_sgp`: o SGP não conseguiu devolver o endereço desta ONU. Cadastro suspeito.
 * - `aproximado_cto`: plotada, mas na posição da CTO e não na casa do cliente.
 */
export type GeoIssue = "sem_contrato" | "sem_pin" | "falha_sgp" | "aproximado_cto" | null;

export interface OnuData {
  pon: number;
  olt_id: number;
  id: number;
  onu: number;
  slot: number;
  olt_name: string;
  type: string;
  phy_addr: string;
  mode: "Bridge" | "PPPoE";
  status: "online" | "offline";
  service_cliente?: string;
  service_contrato?: number;
  service_login?: string;
  notes?: string;
  info_rx?: number;
  service_status?: number;
  online?: boolean | number | string;

  // Enriquecimento de endereço (fttx/onu/list com address=1)
  address?: OnuAddress | null;
  cto?: string | null;
  cto_latlng?: string | null;
  cto_note?: string | null;
  ctoport?: number | null;

  /** Coordenadas resolvidas. `null` quando o SGP não tem posição para a ONU. */
  lat: number | null;
  lng: number | null;
  coordSource: CoordSource;
  /** Diagnóstico de geolocalização, para auditoria do cadastro no SGP. */
  geoIssue?: GeoIssue;
  /** `true` quando o endereço ainda não foi consultado (fila de aquecimento). */
  aguardandoGeo?: boolean;
  /** Endereço em uma linha, pronto para exibição. */
  enderecoLinha?: string;
}

/** CTO com posição conhecida, plotada no mapa junto das ONUs. */
export interface CtoPonto {
  ident: string;
  lat: number;
  lng: number;
  nota?: string | null;
}

export interface WarmupState {
  rodando: boolean;
  feitos: number;
  total: number;
  iniciadoEm: number | null;
}

export interface OnusResponse {
  onus: OnuData[];
  ctos: CtoPonto[];
  meta: {
    escopo: string;
    total: number;
    plotadas: number;
    pendentes: number;
    warmup: WarmupState;
  };
}
