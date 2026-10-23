import { NextResponse } from "next/server";
import type { CoordSource, GeoIssue, OnuAddress } from "@/types";
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
} from "@/lib/sgp";
import { endWarmup, getEntry, getWarmup, startWarmup, tickWarmup } from "@/lib/geoCache";

/**
 * Concorrência por lote. Alta o suficiente para resolver 80 contratos em ~2s,
 * compatível com funções Serverless (Vercel) que encerram o processo após o return.
 */
const BATCH_CONCURRENCY = 20;

export interface ResolvedContractGeo {
  address: OnuAddress | null;
  cto: string | null;
  ctoport: number | null;
  cto_latlng: string | null;
  cto_note: string | null;
  enderecoLinha?: string;
  lat: number | null;
  lng: number | null;
  coordSource: CoordSource;
  geoIssue: GeoIssue;
}

export async function GET() {
  return NextResponse.json(getWarmup());
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    // Modo em lote síncrono (compatível com Vercel Serverless):
    // O cliente envia uma lista de contratos pendentes e recebe as coordenadas resolvidas na resposta.
    if (body && Array.isArray(body.contratos)) {
      const contratos: number[] = body.contratos
        .map((c: unknown) => Number(c))
        .filter((c: number) => Number.isFinite(c) && c > 0)
        .slice(0, 100);

      const resolved: Record<number, ResolvedContractGeo> = {};

      await mapPool(contratos, BATCH_CONCURRENCY, async (contrato) => {
        const geo = await fetchContratoGeo(contrato);
        let coords = geo.coords;
        let coordSource: CoordSource = coords ? "endereco" : null;

        const ctoInfo = geo.cto ? getCto(geo.cto) : null;
        if (!coords && ctoInfo) {
          const fromCto = parseLatLng(ctoInfo.ll);
          if (fromCto) {
            coords = fromCto;
            coordSource = "cto";
          }
        }

        let geoIssue: GeoIssue = null;
        if (!coords) {
          geoIssue = !geo.ok ? "falha_sgp" : "sem_pin";
        } else if (coordSource === "cto") {
          geoIssue = "aproximado_cto";
        }

        resolved[contrato] = {
          address: geo.address,
          cto: geo.cto,
          ctoport: geo.ctoPorta,
          cto_latlng: ctoInfo?.ll ?? null,
          cto_note: ctoInfo?.nota ?? null,
          enderecoLinha: formatEndereco(geo.address),
          lat: coords ? coords[0] : null,
          lng: coords ? coords[1] : null,
          coordSource,
          geoIssue,
        };
      });

      return NextResponse.json({ resolved });
    }

    // Fallback legado (execução em processo local)
    if (getWarmup().rodando) {
      return NextResponse.json({ ...getWarmup(), jaRodando: true });
    }

    const data = await fetchJson<SgpOnu[]>(
      `${SGP_BASE}/api/fttx/onu/list/?${auth()}`
    );
    if (!Array.isArray(data)) {
      return NextResponse.json(
        { error: "Não foi possível listar as ONUs para o aquecimento." },
        { status: 502 }
      );
    }

    const contratos = [
      ...new Set(
        data
          .map((o) => o.service_contrato)
          .filter((c): c is number => typeof c === "number" && !getEntry(c))
      ),
    ];

    if (contratos.length === 0) {
      return NextResponse.json({ ...getWarmup(), nada: true });
    }

    if (!startWarmup(contratos.length)) {
      return NextResponse.json({ ...getWarmup(), jaRodando: true });
    }

    void (async () => {
      try {
        await mapPool(contratos, BATCH_CONCURRENCY, async (contrato) => {
          await fetchContratoGeo(contrato);
          tickWarmup();
        });
      } catch (error) {
        console.error("Falha no aquecimento do cache de endereços:", error);
      } finally {
        endWarmup();
      }
    })();

    return NextResponse.json(getWarmup());
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao processar lote de endereços", details: String(error) },
      { status: 500 }
    );
  }
}
