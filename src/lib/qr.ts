import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { env } from "@/lib/env";

export const qrUrl = (token: string) => new URL(`/q/${token}`, env().APP_URL).toString();
export const qrPng = (token: string) => QRCode.toBuffer(qrUrl(token), { type: "png", width: 720, margin: 3, errorCorrectionLevel: "M" });
export const qrSvg = (token: string) => QRCode.toString(qrUrl(token), { type: "svg", width: 720, margin: 3, errorCorrectionLevel: "M" });

export async function qrPdf(items: Array<{ token: string; name: string; description?: string | null }>) {
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = 595.28; const height = 841.89; const cols = 2; const rows = 3; const cellW = width / cols; const cellH = height / rows;
  for (let start = 0; start < items.length; start += cols * rows) {
    const page = pdf.addPage([width, height]); const batch = items.slice(start, start + cols * rows);
    for (const [position, item] of batch.entries()) {
      const col = position % cols; const row = Math.floor(position / cols); const x = col * cellW; const y = height - (row + 1) * cellH;
      page.drawRectangle({ x: x + 10, y: y + 10, width: cellW - 20, height: cellH - 20, borderColor: rgb(.75, .78, .82), borderWidth: .7, borderDashArray: [4, 4] });
      const image = await pdf.embedPng(await qrPng(item.token)); page.drawImage(image, { x: x + cellW / 2 - 74, y: y + 84, width: 148, height: 148 });
      page.drawText(item.name.slice(0, 38), { x: x + 22, y: y + 61, size: 12, font: bold, maxWidth: cellW - 44 });
      if (item.description) page.drawText(item.description.slice(0, 58), { x: x + 22, y: y + 43, size: 8, font, color: rgb(.25, .3, .36), maxWidth: cellW - 44 });
      page.drawText(qrUrl(item.token), { x: x + 22, y: y + 25, size: 6.5, font, color: rgb(.35, .4, .46), maxWidth: cellW - 44 });
    }
  }
  return Buffer.from(await pdf.save());
}
