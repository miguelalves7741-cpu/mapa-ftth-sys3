import type { OnuAddress } from "@/types";

/**
 * Cache de endereço por contrato, vivo no processo do servidor.
 *
 * Consultar o endereço custa uma chamada por contrato (~1s) e a rede toda tem
 * mais de 3 mil contratos — inviável a cada request. Como endereço de instalação
 * praticamente não muda, guardamos em memória e revalidamos só depois do TTL.
 */

export interface GeoEntry {
  address: OnuAddress | null;
  coords: [number, number] | null;
  cto: string | null;
  ctoPorta: number | null;
  /** `false` quando o SGP respondeu mas não tinha o dado — evita re-tentar em loop. */
  ok: boolean;
  ts: number;
}

const TTL_MS = 12 * 60 * 60 * 1000; // 12h
const cache = new Map<number, GeoEntry>();

export function getEntry(contrato: number): GeoEntry | null {
  const hit = cache.get(contrato);
  if (!hit) return null;
  if (Date.now() - hit.ts > TTL_MS) {
    cache.delete(contrato);
    return null;
  }
  return hit;
}

export function setEntry(contrato: number, entry: Omit<GeoEntry, "ts">): void {
  cache.set(contrato, { ...entry, ts: Date.now() });
}

export function cacheSize(): number {
  return cache.size;
}

/**
 * Cache das CTOs por identificador. Mesma lógica: a posição de uma caixa muda
 * muito raramente, e varrer todas as PONs custa caro.
 */
const ctoCache = new Map<string, { ll: string | null; nota: string | null }>();
const ctoScanned = new Set<string>();

export function getCto(ident: string) {
  return ctoCache.get(ident) ?? null;
}

export function setCto(ident: string, val: { ll: string | null; nota: string | null }): void {
  ctoCache.set(ident, val);
}

export function allCtos(): { ident: string; ll: string | null; nota: string | null }[] {
  return [...ctoCache.entries()].map(([ident, v]) => ({ ident, ...v }));
}

/** Marca uma combinação olt/slot/pon como já varrida, para não repetir a busca. */
export function markScanned(key: string): void {
  ctoScanned.add(key);
}

export function wasScanned(key: string): boolean {
  return ctoScanned.has(key);
}

/** Estado do aquecimento em background, para a UI mostrar progresso. */
export interface WarmupState {
  rodando: boolean;
  feitos: number;
  total: number;
  iniciadoEm: number | null;
}

const warmup: WarmupState = { rodando: false, feitos: 0, total: 0, iniciadoEm: null };

export function getWarmup(): WarmupState {
  return { ...warmup };
}

export function startWarmup(total: number): boolean {
  if (warmup.rodando) return false;
  warmup.rodando = true;
  warmup.feitos = 0;
  warmup.total = total;
  warmup.iniciadoEm = Date.now();
  return true;
}

export function tickWarmup(): void {
  warmup.feitos += 1;
}

export function endWarmup(): void {
  warmup.rodando = false;
}
