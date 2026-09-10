import { NextResponse } from "next/server";
import type { CoordSource, GeoIssue } from "@/types";
import {
  SGP_BASE,
  SgpOnu,
  auth,
  fetchContratoGeo,
  fetchJson,
  formatEndereco,
  getCto,
  mapPool,
  parseLatLng,
  scanCtos,
} from "@/lib/sgp";
import { allCtos, getEntry, getWarmup } from "@/lib/geoCache";

/** Quantas ONUs enriquecemos em paralelo. O SGP degrada com muita concorrência. */
const CONCURRENCY = 8;

/**
 * Teto de consultas novas ao SGP por request, por escopo. Cada endereço custa
 * ~1s, então sem teto "toda a rede" faria 3 mil chamadas e estouraria o tempo.
 * O que passa do teto volta como pendente e é resolvido pelo aquecimento em
 * background — no escopo maior, onde a espera seria longa demais, o request nem
 * tenta e serve só o que já está em cache.
 */
const TETO_POR_ESCOPO: Record<string, number> = {
  pon: 400,
  slot: 220,
  tudo: 0,
};

export async function GET(request: Request) {
  try {
    const apiToken = process.env.SGP_API_TOKEN;
    const appId = process.env.SGP_APP_ID;

    if (!apiToken || !appId) {
      return NextResponse.json(
        { error: "Credenciais do SGP não configuradas no ambiente." },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const escopo = searchParams.get("escopo") || "pon";
    const slot = searchParams.get("slot") || "17";
    const pon = searchParams.get("pon") || "2";

    // Passo 1: lista base. Sem `address` esta chamada nunca falha, então ela é a
    // fonte da verdade sobre QUAIS ONUs existem. Sem slot/pon o SGP devolve a
    // rede inteira em uma única resposta.
    const filtro =
      escopo === "tudo"
        ? ""
        : escopo === "slot"
          ? `slot=${encodeURIComponent(slot)}&`
          : `slot=${encodeURIComponent(slot)}&pon=${encodeURIComponent(pon)}&`;

    const listUrl = `${SGP_BASE}/api/fttx/onu/list/?${filtro}connection=1&signal=1&${auth()}`;

    const data = await fetchJson<SgpOnu[] | { results?: SgpOnu[]; error?: string; detail?: string }>(
      listUrl
    );
    if (data === null) {
      return NextResponse.json(
        { error: "O SGP não retornou JSON para a lista de ONUs (slot/PON inválido ou instabilidade)." },
        { status: 502 }
      );
    }
    if (!Array.isArray(data) && (data.error || data.detail)) {
      return NextResponse.json(
        { error: `Falha na API SGP: ${data.detail || data.error}` },
        { status: 502 }
      );
    }

    const onus: SgpOnu[] = Array.isArray(data) ? data : data.results || [];

    // Passo 2: CTOs das PONs em jogo, uma chamada por PON e só na primeira vez.
    const combos = new Map<string, { oltId: number; slot: number; pon: number }>();
    for (const o of onus) {
      if (o.olt_id === undefined || o.slot === undefined || o.pon === undefined) continue;
      combos.set(`${o.olt_id}/${o.slot}/${o.pon}`, {
        oltId: o.olt_id,
        slot: o.slot,
        pon: o.pon,
      });
    }
    await scanCtos([...combos.values()]);

    // Passo 3: endereço por contrato, servido do cache quando possível. O teto de
    // consultas novas mantém o request rápido mesmo no escopo "toda a rede".
    const teto = TETO_POR_ESCOPO[escopo] ?? 220;
    let novas = 0;
    let pendentes = 0;

    const enriched = await mapPool(onus, CONCURRENCY, async (onu) => {
      let address = null;
      let cto: string | null = null;
      let ctoPorta: number | null = null;
      let coords: [number, number] | null = null;
      let coordSource: CoordSource = null;
      let consultaOk = false;
      let aguardando = false;

      if (onu.service_contrato) {
        const emCache = getEntry(onu.service_contrato);

        if (emCache) {
          address = emCache.address;
          cto = emCache.cto;
          ctoPorta = emCache.ctoPorta;
          coords = emCache.coords;
          consultaOk = emCache.ok;
          if (coords) coordSource = "endereco";
        } else if (novas < teto) {
          novas++;
          const geo = await fetchContratoGeo(onu.service_contrato);
          address = geo.address;
          cto = geo.cto;
          ctoPorta = geo.ctoPorta;
          coords = geo.coords;
          consultaOk = geo.ok;
          if (coords) coordSource = "endereco";
        } else {
          // Passou do teto: entra no mapa quando o aquecimento terminar.
          aguardando = true;
          pendentes++;
        }
      }

      // O nome da CTO também vem da lista base, útil quando o contrato não resolveu.
      if (!cto && typeof onu.cto === "string") cto = onu.cto;
      if (ctoPorta === null && typeof onu.ctoport === "number") ctoPorta = onu.ctoport;

      const ctoInfo = cto ? getCto(cto) : null;

      // Fallback: posição da CTO. Não é a casa do cliente, mas põe o técnico na
      // rua certa — melhor que sumir do mapa.
      if (!coords && ctoInfo) {
        const fromCto = parseLatLng(ctoInfo.ll);
        if (fromCto) {
          coords = fromCto;
          coordSource = "cto";
        }
      }

      // Classifica o que impediu a plotagem, para separar o que dá para corrigir
      // no cadastro do SGP do que é esperado (ONU sem cliente).
      let geoIssue: GeoIssue = null;
      if (!coords) {
        if (aguardando) geoIssue = null;
        else if (!onu.service_contrato) geoIssue = "sem_contrato";
        else if (!consultaOk) geoIssue = "falha_sgp";
        else geoIssue = "sem_pin";
      } else if (coordSource === "cto") {
        geoIssue = "aproximado_cto";
      }

      return {
        ...onu,
        address,
        cto,
        ctoport: ctoPorta,
        cto_latlng: ctoInfo?.ll ?? null,
        cto_note: ctoInfo?.nota ?? null,
        enderecoLinha: formatEndereco(address),
        lat: coords ? coords[0] : null,
        lng: coords ? coords[1] : null,
        coordSource,
        geoIssue,
        aguardandoGeo: aguardando,
      };
    });

    // CTOs com posição conhecida, para plotar junto das ONUs. `map_ll` pode vir
    // preenchido mas inválido, então o parse é quem decide.
    const ctosUsadas = new Set(enriched.map((o) => o.cto).filter(Boolean));
    const ctos = allCtos()
      .filter((c) => ctosUsadas.has(c.ident))
      .map((c) => {
        const ll = parseLatLng(c.ll);
        return ll ? { ident: c.ident, lat: ll[0], lng: ll[1], nota: c.nota } : null;
      })
      .filter((c): c is { ident: string; lat: number; lng: number; nota: string | null } => c !== null);

    return NextResponse.json({
      onus: enriched,
      ctos,
      meta: {
        escopo,
        total: enriched.length,
        plotadas: enriched.filter((o) => o.lat !== null).length,
        pendentes,
        warmup: getWarmup(),
      },
    });
  } catch (error) {
    console.error("Erro no proxy SGP API:", error);
    return NextResponse.json(
      {
        error: "Erro interno ao cruzar dados da rede.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
