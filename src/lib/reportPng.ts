import { OnuData } from "@/types";

export interface DiagnosticReportPon {
  slot: number;
  pon: number;
  total: number;
  online: number;
  offline: number;
  weakSignal: number;
  ctos: string[];
}

export interface DiagnosticReportCto {
  ident: string;
  count: number;
  ponLabel: string;
}

export interface DiagnosticReportData {
  mode: "rua" | "raio" | "poligono";
  title: string;
  subtitle?: string | null;
  totalClients: number;
  onlineTotal: number;
  offlineTotal: number;
  weakSignalTotal: number;
  semPinTotal?: number;
  pons: DiagnosticReportPon[];
  ctos: DiagnosticReportCto[];
  clients: OnuData[];
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 0 && ctx.measureText(clipped + "…").width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return clipped + "…";
}

function loadLogo(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const isOnline = (o: OnuData) =>
  o.online === true || o.online === 1 || o.online === "1";

export async function generateDiagnosticPngBlob(
  data: DiagnosticReportData
): Promise<Blob> {
  const scale = 2; // Alta resolução (Retina)
  const width = 920;
  const pad = 32;
  const contentWidth = width - pad * 2;

  const maxClientsToShow = Math.min(data.clients.length, 65);
  const extraClients = Math.max(0, data.clients.length - maxClientsToShow);

  // Calcula a altura dinâmica necessária para nunca cortar conteúdo
  const headerH = 82;
  const bannerH = data.subtitle ? 84 : 66;
  const kpiH = 92;

  // Altura da seção de PONs
  const ponRowH = 56;
  const ponsSectionH =
    42 + Math.max(1, data.pons.length) * (ponRowH + 8) + 12;

  // Altura da seção de CTOs (chips em linhas de até 4 por linha)
  const ctoRows = data.ctos.length > 0 ? Math.ceil(data.ctos.length / 4) : 0;
  const ctosSectionH = ctoRows > 0 ? 40 + ctoRows * 34 + 12 : 0;

  // Altura da tabela de clientes
  const clientRowH = 32;
  const clientsSectionH =
    data.clients.length > 0
      ? 48 + 30 + maxClientsToShow * clientRowH + (extraClients > 0 ? 34 : 0) + 16
      : 0;

  const footerH = 48;
  const gaps = 20 * 5;

  const totalHeight =
    pad +
    headerH +
    bannerH +
    kpiH +
    ponsSectionH +
    ctosSectionH +
    clientsSectionH +
    footerH +
    gaps +
    pad;

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = totalHeight * scale;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Contexto 2D indisponível");
  ctx.scale(scale, scale);

  const fontSans = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const fontMono = "ui-monospace, SFMono-Regular, Consolas, monospace";

  // Fundo principal escuro (#080808)
  ctx.fillStyle = "#080808";
  ctx.fillRect(0, 0, width, totalHeight);

  // Borda externa laranja sutil
  drawRoundedRect(ctx, 8, 8, width - 16, totalHeight - 16, 20);
  ctx.strokeStyle = "rgba(235, 100, 16, 0.45)";
  ctx.lineWidth = 2;
  ctx.stroke();

  let curY = pad;

  // 1. CABEÇALHO
  const logo = await loadLogo("/logo-sys3.png");
  let titleX = pad;
  if (logo && logo.width > 0) {
    const targetH = 44;
    const targetW = (logo.width / logo.height) * targetH;
    ctx.drawImage(logo, pad, curY + 6, targetW, targetH);
    titleX = pad + targetW + 18;
  }

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 20px ${fontSans}`;
  ctx.fillText("Diagnóstico de Campo FTTH", titleX, curY + 26);

  ctx.fillStyle = "#EB6410";
  ctx.font = `700 12px ${fontSans}`;
  ctx.fillText(
    data.mode === "rua"
      ? "RELATÓRIO DE ATENDIMENTO POR RUA / LOGRADOURO"
      : "RELATÓRIO DE ANÁLISE DE ÁREA / RAIO",
    titleX,
    curY + 46
  );

  // Data/hora no canto direito
  const nowStr = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  ctx.font = `600 12px ${fontSans}`;
  const dateLabel = `Emitido em ${nowStr}`;
  const dateW = ctx.measureText(dateLabel).width + 24;
  drawRoundedRect(ctx, width - pad - dateW, curY + 12, dateW, 30, 8);
  ctx.fillStyle = "#181818";
  ctx.fill();
  ctx.strokeStyle = "#333333";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#DFDAC6";
  ctx.fillText(dateLabel, width - pad - dateW + 12, curY + 31);

  curY += headerH;

  // 2. BANNER DO LOGRADOURO / ÁREA
  drawRoundedRect(ctx, pad, curY, contentWidth, bannerH, 14);
  const grad = ctx.createLinearGradient(pad, curY, pad + contentWidth, curY);
  grad.addColorStop(0, "rgba(235, 100, 16, 0.22)");
  grad.addColorStop(1, "rgba(232, 72, 24, 0.06)");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "rgba(235, 100, 16, 0.6)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#EB6410";
  ctx.font = `800 11px ${fontSans}`;
  ctx.fillText(
    data.mode === "rua" ? "RUA / LOGRADOURO SELECIONADO" : "PERÍMETRO ANALISADO",
    pad + 18,
    curY + 22
  );

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 20px ${fontSans}`;
  ctx.fillText(
    truncateText(ctx, data.title, contentWidth - 36),
    pad + 18,
    curY + 48
  );

  if (data.subtitle) {
    ctx.fillStyle = "#DFDAC6";
    ctx.font = `600 13px ${fontSans}`;
    ctx.fillText(
      truncateText(ctx, data.subtitle, contentWidth - 36),
      pad + 18,
      curY + 69
    );
  }

  curY += bannerH + 18;

  // 3. CARDS DE KPI (4 COLUNAS)
  const kpiGap = 14;
  const kpiW = (contentWidth - kpiGap * 3) / 4;
  const kpis = [
    {
      label: data.mode === "rua" ? "CLIENTES NA RUA" : "CLIENTES NA ÁREA",
      value: String(data.totalClients),
      sub: `${data.onlineTotal} Online • ${data.offlineTotal} Offline`,
      color: "#FFFFFF",
      border: "#333333",
    },
    {
      label: "PORTAS PON ATENDENDO",
      value: String(data.pons.length),
      sub:
        data.pons.length > 0
          ? `Principal: S${data.pons[0].slot}/P${data.pons[0].pon}`
          : "Nenhuma PON",
      color: "#EB6410",
      border: "rgba(235, 100, 16, 0.5)",
    },
    {
      label: "CAIXAS CTO NA RUA",
      value: String(data.ctos.length),
      sub:
        data.ctos.length > 0
          ? `Principal: ${data.ctos[0].ident} (${data.ctos[0].count})`
          : "Sem CTO informada",
      color: "#DFDAC6",
      border: "#333333",
    },
    {
      label: "SAÚDE DE SINAL / STATUS",
      value:
        data.offlineTotal > 0
          ? `${data.offlineTotal} OFF`
          : data.weakSignalTotal > 0
            ? `${data.weakSignalTotal} Fraco`
            : "100% OK",
      sub:
        data.weakSignalTotal > 0
          ? `${data.weakSignalTotal} cliente(s) < -25 dBm`
          : "Sinal óptico normal",
      color:
        data.offlineTotal > 0
          ? "#f43f5e"
          : data.weakSignalTotal > 0
            ? "#f59e0b"
            : "#10b981",
      border: "#333333",
    },
  ];

  kpis.forEach((k, idx) => {
    const kx = pad + idx * (kpiW + kpiGap);
    drawRoundedRect(ctx, kx, curY, kpiW, kpiH, 12);
    ctx.fillStyle = "#141414";
    ctx.fill();
    ctx.strokeStyle = k.border;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = "#D2D2D2";
    ctx.font = `700 10px ${fontSans}`;
    ctx.fillText(k.label, kx + 14, curY + 22);

    ctx.fillStyle = k.color;
    ctx.font = `800 26px ${fontSans}`;
    ctx.fillText(k.value, kx + 14, curY + 54);

    ctx.fillStyle = "#DFDAC6";
    ctx.font = `600 11px ${fontSans}`;
    ctx.fillText(truncateText(ctx, k.sub, kpiW - 24), kx + 14, curY + 76);
  });

  curY += kpiH + 22;

  // 4. SEÇÃO: DISTRIBUIÇÃO POR PORTA PON
  ctx.fillStyle = "#EB6410";
  ctx.font = `800 13px ${fontSans}`;
  ctx.fillText(
    "PORTAS PON QUE ATENDEM ESTA RUA / REGIÃO",
    pad,
    curY + 14
  );
  curY += 26;

  if (data.pons.length === 0) {
    drawRoundedRect(ctx, pad, curY, contentWidth, 48, 10);
    ctx.fillStyle = "#141414";
    ctx.fill();
    ctx.fillStyle = "#D2D2D2";
    ctx.font = `600 13px ${fontSans}`;
    ctx.fillText("Nenhuma PON encontrada.", pad + 16, curY + 29);
    curY += 56;
  } else {
    for (const p of data.pons) {
      const pct =
        data.totalClients > 0
          ? Math.round((p.total / data.totalClients) * 100)
          : 0;

      drawRoundedRect(ctx, pad, curY, contentWidth, ponRowH, 10);
      ctx.fillStyle = "#141414";
      ctx.fill();
      ctx.strokeStyle = "#2A2A2A";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Nome do Slot / PON
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `800 15px ${fontSans}`;
      ctx.fillText(`Slot ${p.slot}  •  PON ${p.pon}`, pad + 16, curY + 24);

      // Percentual
      ctx.fillStyle = "#EB6410";
      ctx.font = `700 12px ${fontSans}`;
      ctx.fillText(`(${pct}% da rua)`, pad + 160, curY + 24);

      // CTOs vinculadas à PON
      const ctosText =
        p.ctos.length > 0
          ? `CTOs: ${p.ctos.join(", ")}`
          : "CTOs: não informada no contrato";
      ctx.fillStyle = "#DFDAC6";
      ctx.font = `500 11px ${fontSans}`;
      ctx.fillText(
        truncateText(ctx, ctosText, contentWidth - 290),
        pad + 16,
        curY + 44
      );

      // Contadores à direita (Online, Offline, Total)
      const rightEdge = pad + contentWidth - 16;
      const totalBadge = `${p.total} cli`;
      ctx.font = `800 12px ${fontSans}`;
      const tbW = ctx.measureText(totalBadge).width + 18;
      drawRoundedRect(ctx, rightEdge - tbW, curY + 11, tbW, 24, 6);
      ctx.fillStyle = "rgba(235, 100, 16, 0.2)";
      ctx.fill();
      ctx.strokeStyle = "#EB6410";
      ctx.stroke();
      ctx.fillStyle = "#DFDAC6";
      ctx.fillText(totalBadge, rightEdge - tbW + 9, curY + 27);

      let statsX = rightEdge - tbW - 14;
      if (p.weakSignal > 0) {
        const wsTxt = `${p.weakSignal} fraco`;
        ctx.font = `700 12px ${fontSans}`;
        const wsW = ctx.measureText(wsTxt).width;
        ctx.fillStyle = "#f59e0b";
        ctx.fillText(wsTxt, statsX - wsW, curY + 27);
        statsX -= wsW + 14;
      }
      if (p.offline > 0) {
        const offTxt = `${p.offline} off`;
        ctx.font = `700 12px ${fontSans}`;
        const offW = ctx.measureText(offTxt).width;
        ctx.fillStyle = "#f43f5e";
        ctx.fillText(offTxt, statsX - offW, curY + 27);
        statsX -= offW + 14;
      }
      const onTxt = `${p.online} on`;
      ctx.font = `700 12px ${fontSans}`;
      const onW = ctx.measureText(onTxt).width;
      ctx.fillStyle = "#10b981";
      ctx.fillText(onTxt, statsX - onW, curY + 27);

      // Barra de proporção no rodapé do card da PON
      const barW = 180;
      const barX = rightEdge - barW;
      drawRoundedRect(ctx, barX, curY + 41, barW, 5, 2.5);
      ctx.fillStyle = "#2A2A2A";
      ctx.fill();

      drawRoundedRect(
        ctx,
        barX,
        curY + 41,
        Math.max(6, (barW * pct) / 100),
        5,
        2.5
      );
      ctx.fillStyle = "#EB6410";
      ctx.fill();

      curY += ponRowH + 8;
    }
  }

  curY += 14;

  // 5. SEÇÃO: CAIXAS CTO VINCULADAS
  if (data.ctos.length > 0) {
    ctx.fillStyle = "#EB6410";
    ctx.font = `800 13px ${fontSans}`;
    ctx.fillText(
      `CAIXAS CTO QUE ATENDEM A RUA (${data.ctos.length})`,
      pad,
      curY + 14
    );
    curY += 26;

    const cols = 4;
    const chipGap = 10;
    const chipW = (contentWidth - chipGap * (cols - 1)) / cols;
    const chipH = 28;

    data.ctos.forEach((c, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cx = pad + col * (chipW + chipGap);
      const cy = curY + row * (chipH + 6);

      drawRoundedRect(ctx, cx, cy, chipW, chipH, 7);
      ctx.fillStyle = "#161616";
      ctx.fill();
      ctx.strokeStyle = "#333333";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#FFFFFF";
      ctx.font = `700 11px ${fontSans}`;
      const label = `${c.ident} (${c.count}) • ${c.ponLabel}`;
      ctx.fillText(truncateText(ctx, label, chipW - 16), cx + 8, cy + 18);
    });

    curY += ctoRows * 34 + 18;
  }

  // 6. TABELA DE CLIENTES DA RUA
  if (data.clients.length > 0) {
    ctx.fillStyle = "#EB6410";
    ctx.font = `800 13px ${fontSans}`;
    ctx.fillText(
      `CLIENTES VINCULADOS NESTA RUA (${data.clients.length})`,
      pad,
      curY + 14
    );
    curY += 24;

    // Cabeçalho da tabela
    drawRoundedRect(ctx, pad, curY, contentWidth, 28, 8);
    ctx.fillStyle = "#1F1F1F";
    ctx.fill();

    const colStatus = pad + 12;
    const colNum = pad + 82;
    const colCliente = pad + 165;
    const colPon = pad + 495;
    const colCto = pad + 605;
    const colRx = pad + 765;

    ctx.fillStyle = "#DFDAC6";
    ctx.font = `800 10px ${fontSans}`;
    ctx.fillText("STATUS", colStatus, curY + 18);
    ctx.fillText("Nº", colNum, curY + 18);
    ctx.fillText("ASSINANTE / CONTRATO", colCliente, curY + 18);
    ctx.fillText("SLOT / PON", colPon, curY + 18);
    ctx.fillText("CTO / PORTA", colCto, curY + 18);
    ctx.fillText("SINAL RX", colRx, curY + 18);

    curY += 32;

    const list = data.clients.slice(0, maxClientsToShow);
    list.forEach((o, i) => {
      if (i % 2 === 0) {
        drawRoundedRect(ctx, pad, curY, contentWidth, clientRowH - 2, 6);
        ctx.fillStyle = "#121212";
        ctx.fill();
      }

      const on = isOnline(o);
      const rx = o.info_rx;
      const weak = on && rx !== undefined && rx !== null && rx !== 0 && rx < -25;

      // Status pill
      ctx.fillStyle = !on ? "#f43f5e" : weak ? "#f59e0b" : "#10b981";
      ctx.font = `800 11px ${fontSans}`;
      ctx.fillText(!on ? "OFFLINE" : weak ? "FRACO" : "ONLINE", colStatus, curY + 19);

      // Número
      ctx.fillStyle = "#DFDAC6";
      ctx.font = `700 11px ${fontSans}`;
      const numStr = o.address?.numero ? `Nº ${o.address.numero}` : "S/N";
      ctx.fillText(truncateText(ctx, numStr, 75), colNum, curY + 19);

      // Cliente
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `600 11px ${fontSans}`;
      const cliName = o.service_cliente || `Contrato #${o.service_contrato ?? o.id}`;
      ctx.fillText(truncateText(ctx, cliName, 318), colCliente, curY + 19);

      // Slot / PON
      ctx.fillStyle = "#EB6410";
      ctx.font = `700 11px ${fontMono}`;
      ctx.fillText(`S${o.slot} / P${o.pon}`, colPon, curY + 19);

      // CTO / Porta
      ctx.fillStyle = "#D2D2D2";
      ctx.font = `600 11px ${fontSans}`;
      const ctoStr = o.cto ? `${o.cto}${o.ctoport ? ` / P${o.ctoport}` : ""}` : "—";
      ctx.fillText(truncateText(ctx, ctoStr, 150), colCto, curY + 19);

      // Sinal RX
      ctx.fillStyle =
        rx !== undefined && rx !== null && rx !== 0
          ? rx < -25
            ? "#f59e0b"
            : "#10b981"
          : "#777777";
      ctx.font = `700 11px ${fontMono}`;
      ctx.fillText(
        rx !== undefined && rx !== null && rx !== 0 ? `${rx} dBm` : "Sem sinal",
        colRx,
        curY + 19
      );

      curY += clientRowH;
    });

    if (extraClients > 0) {
      ctx.fillStyle = "#DFDAC6";
      ctx.font = `600 11px ${fontSans}`;
      ctx.fillText(
        `+ ${extraClients} cliente(s) adicionais omitidos na imagem para manter a legibilidade.`,
        pad + 12,
        curY + 20
      );
      curY += 30;
    }
  }

  // 7. RODAPÉ
  const footerY = totalHeight - pad - 10;
  ctx.strokeStyle = "#262626";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, footerY - 22);
  ctx.lineTo(width - pad, footerY - 22);
  ctx.stroke();

  ctx.fillStyle = "#888888";
  ctx.font = `600 11px ${fontSans}`;
  ctx.fillText(
    "Sys3 Conecta • Diagnóstico de Campo FTTH — Relatório para Equipe Técnica",
    pad,
    footerY
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Falha ao exportar PNG"));
    }, "image/png");
  });
}
