import { NextResponse } from "next/server";
import { SGP_BASE, SgpOnu, auth, fetchContratoGeo, fetchJson, mapPool } from "@/lib/sgp";
import { endWarmup, getEntry, getWarmup, startWarmup, tickWarmup } from "@/lib/geoCache";

/**
 * Aquecimento do cache de endereços.
 *
 * Resolver os ~3 mil contratos da rede leva minutos, o que não cabe em um
 * request. Este endpoint dispara o trabalho em background e responde na hora;
 * a UI acompanha o progresso por GET até `rodando` virar false.
 */

/** Concorrência do aquecimento. Mais alta que a do request, porém sem afogar o SGP. */
const CONCURRENCY = 10;

export async function GET() {
  return NextResponse.json(getWarmup());
}

export async function POST() {
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

  // Só o que ainda não está em cache.
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

  // Deliberadamente sem await: o trabalho segue depois da resposta.
  void (async () => {
    try {
      await mapPool(contratos, CONCURRENCY, async (contrato) => {
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
}
