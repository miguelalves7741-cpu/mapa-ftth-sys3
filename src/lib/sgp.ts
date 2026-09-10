import type { OnuAddress } from "@/types";
import { getEntry, setEntry, getCto, setCto, markScanned, wasScanned } from "@/lib/geoCache";

export const SGP_BASE = "https://sgp.sys3telecom.com.br";

/** ONU como o SGP devolve em /api/fttx/onu/list/. */
export interface SgpOnu {
  id: number;
  olt_id?: number;
  slot?: number;
  pon?: number;
  service_contrato?: number;
  address?: OnuAddress | null;
  cto?: string | null;
  ctoport?: number | null;
  [key: string]: unknown;
}

/** Contrato como o SGP devolve em /api/suporte/contrato/list/ (campos achatados). */
interface SgpContratoSuporte {
  endereco_logradouro?: string;
  endereco_numero?: number | string;
  endereco_complemento?: string;
  endereco_bairro?: string;
  endereco_cidade?: string;
  endereco_uf?: string;
  endereco_pontoreferencia?: string;
  /** Coordenada do endereço de instalação — capturada em campo pelo técnico. */
  endereco_ll?: string | null;
  contrato_endereco_ll?: string | null;
  servico_onu_cto?: string | null;
  servico_onu_cto_porta?: number | null;
}

/** CTO como o SGP devolve em /api/fttx/olt/pon/{olt}/splitter/list/. */
export interface SgpSplitter {
  ident?: string | null;
  note?: string | null;
  localization?: string | null;
  map_ll?: string | null;
}

export function auth(): string {
  const token = process.env.SGP_API_TOKEN ?? "";
  const app = process.env.SGP_APP_ID ?? "";
  return `token=${encodeURIComponent(token)}&app=${encodeURIComponent(app)}`;
}

/**
 * O SGP responde HTTP 200 com uma página HTML de erro quando algo estoura no
 * servidor, então não dá para confiar no status: só o parse é conclusivo.
 */
export async function fetchJson<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

/** "-7.1598318,-34.8743628" -> [lat, lng]. Ignora string vazia e lixo. */
export function parseLatLng(raw: unknown): [number, number] | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const parts = raw.split(",");
  if (parts.length !== 2) return null;
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return [lat, lng];
}

export function formatEndereco(a: OnuAddress | null | undefined): string | undefined {
  if (!a) return undefined;
  const rua = [a.logradouro, a.numero].filter(Boolean).join(", ");
  return [rua, a.complemento, a.bairro, a.cidade].filter(Boolean).join(" - ") || undefined;
}

/** Roda `worker` sobre `items` com no máximo `limit` chamadas simultâneas. */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * Endereço de instalação de um contrato, com cache.
 *
 * `/api/suporte/contrato/list/` devolve `endereco_ll` — a coordenada que o
 * técnico registra em campo, resolvida POR CONTRATO. Cliente com dois contratos
 * em locais diferentes cai em pontos diferentes.
 */
export async function fetchContratoGeo(contrato: number) {
  const cached = getEntry(contrato);
  if (cached) return cached;

  const resp = await fetchJson<SgpContratoSuporte[]>(`${SGP_BASE}/api/suporte/contrato/list/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: process.env.SGP_API_TOKEN,
      app: process.env.SGP_APP_ID,
      contrato_id: contrato,
    }),
  });

  const c = Array.isArray(resp) ? resp[0] : null;
  if (!c) {
    const miss = { address: null, coords: null, cto: null, ctoPorta: null, ok: false };
    setEntry(contrato, miss);
    return { ...miss, ts: Date.now() };
  }

  const address: OnuAddress = {
    logradouro: c.endereco_logradouro,
    numero: c.endereco_numero,
    complemento: c.endereco_complemento,
    bairro: c.endereco_bairro,
    cidade: c.endereco_cidade,
    uf: c.endereco_uf,
    pontoreferencia: c.endereco_pontoreferencia,
    map_ll: c.endereco_ll ?? null,
  };

  const entry = {
    address,
    coords: parseLatLng(c.endereco_ll) || parseLatLng(c.contrato_endereco_ll),
    cto: c.servico_onu_cto ?? null,
    ctoPorta: c.servico_onu_cto_porta ?? null,
    ok: true,
  };

  setEntry(contrato, entry);
  return { ...entry, ts: Date.now() };
}

/**
 * Varre as PONs pedidas e alimenta o cache de CTOs. Combinações já varridas são
 * puladas, então trocar de PON no painel não repete trabalho.
 */
export async function scanCtos(
  alvos: { oltId: number; slot: number | string; pon: number | string }[]
): Promise<void> {
  const pendentes = alvos.filter(
    (a) => !wasScanned(`${a.oltId}/${a.slot}/${a.pon}`)
  );

  await mapPool(pendentes, 6, async ({ oltId, slot, pon }) => {
    const splitters = await fetchJson<SgpSplitter[]>(
      `${SGP_BASE}/api/fttx/olt/pon/${oltId}/splitter/list/` +
        `?slot=${encodeURIComponent(String(slot))}&pon=${encodeURIComponent(String(pon))}&${auth()}`
    );
    markScanned(`${oltId}/${slot}/${pon}`);
    if (!Array.isArray(splitters)) return;
    for (const s of splitters) {
      if (!s.ident) continue;
      setCto(s.ident, { ll: s.map_ll ?? null, nota: s.note || s.localization || null });
    }
  });
}

export { getCto };
