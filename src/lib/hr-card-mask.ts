import sharp from "sharp";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";

/**
 * 인사기록카드 PDF는 [기본이력]→[개인사항]→[발령사항]→[학력사항]→
 * [가족사항]→[병역사항]→[외부경력사항]→(2페이지)[상벌사항] 순서로
 * 섹션이 고정된 회사 양식이다. 우리가 실제로 필요한 건 발령사항/
 * 학력사항/외부경력사항이고, [개인사항](주소·연락처)과 [가족사항]/
 * [병역사항](가족 이름·생년월일 등)은 민감정보라 AI에 보내기 전에
 * 흰색으로 가린다. 2페이지([상벌사항])는 필요 없으니 아예 렌더링하지
 * 않는다. 발령사항 행 수가 사람마다 달라서 아래 섹션들의 위치가
 * 밀리기 때문에, 고정 좌표 대신 OCR로 각 섹션 제목의 실제 위치를
 * 찾아서 그 구간만큼만 가린다.
 */
const SECTION_ORDER = [
  "기본이력",
  "개인사항",
  "발령사항",
  "학력사항",
  "가족사항",
  "병역사항",
  "외부경력사항",
];

// 이 구간은 AI에 보내지 않도록 흰색으로 덮는다.
const MASK_SECTIONS = new Set(["개인사항", "가족사항", "병역사항"]);

type Line = { text: string; y0: number; y1: number; x0: number };

async function detectHeaderLines(imageBuffer: Buffer): Promise<Line[]> {
  const worker = await createWorker("kor+eng");
  try {
    const result = await worker.recognize(imageBuffer, {}, { blocks: true });
    const lines: Line[] = [];
    for (const block of result.data.blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        for (const line of para.lines ?? []) {
          const text = line.text.trim();
          // 섹션 제목은 왼쪽 여백에 "[...]" 형태로 짧게 나온다.
          if (text.startsWith("[") && line.bbox.x0 < 200 && text.length < 20) {
            lines.push({ text, y0: line.bbox.y0, y1: line.bbox.y1, x0: line.bbox.x0 });
          }
        }
      }
    }
    return lines.sort((a, b) => a.y0 - b.y0);
  } finally {
    await worker.terminate();
  }
}

/**
 * 페이지 이미지에서 민감 섹션 구간을 흰색으로 덮는다. 섹션 제목을 예상한
 * 개수만큼 순서대로 못 찾으면(양식이 다르거나 인식 실패) null을 반환해서
 * 호출부가 이 파일을 건너뛰고 관리자에게 알리도록 한다 — 애매하면 아예
 * 처리하지 않는 쪽이 안전하다.
 */
async function maskPageOne(imageBuffer: Buffer, imageHeight: number): Promise<Buffer | null> {
  const headers = await detectHeaderLines(imageBuffer);
  if (headers.length < SECTION_ORDER.length) return null;

  // 앞에서부터 SECTION_ORDER 순서대로 매칭된다고 가정(고정 양식이므로).
  const bounds: { name: string; y0: number; y1: number }[] = [];
  for (let i = 0; i < SECTION_ORDER.length; i++) {
    const y0 = headers[i].y0;
    const y1 = i + 1 < headers.length ? headers[i + 1].y0 : imageHeight;
    bounds.push({ name: SECTION_ORDER[i], y0, y1 });
  }

  const rects = bounds
    .filter((b) => MASK_SECTIONS.has(b.name))
    .map((b) => ({ top: Math.max(0, b.y0 - 4), height: b.y1 - b.y0 + 4 }));

  const img = sharp(imageBuffer);
  const meta = await img.metadata();
  const width = meta.width ?? 1200;

  const overlays = rects.map((r) => ({
    input: {
      create: {
        width,
        height: Math.max(1, Math.min(r.height, imageHeight - r.top)),
        channels: 3 as const,
        background: { r: 255, g: 255, b: 255 },
      },
    },
    top: r.top,
    left: 0,
  }));

  return img.composite(overlays).png().toBuffer();
}

/**
 * PDF 1페이지만 렌더링해서(2페이지 [상벌사항]은 필요 없으니 렌더링 자체를
 * 안 함) 민감정보 구간을 가린 이미지를 반환한다.
 */
export async function renderMaskedHrCardImage(pdfBuffer: Buffer): Promise<Buffer> {
  const parser = new PDFParse({ data: pdfBuffer });
  try {
    const shot = await parser.getScreenshot({ scale: 2.0, partial: [1] });
    const raw = shot.pages[0]?.data as Buffer | undefined;
    if (!raw) {
      throw new Error("PDF 1페이지를 렌더링하지 못했습니다.");
    }
    const meta = await sharp(raw).metadata();
    const masked = await maskPageOne(raw, meta.height ?? 1683);
    if (!masked) {
      throw new Error(
        "PDF에서 민감정보 구간을 안전하게 가리지 못했습니다(양식 인식 실패) — 이 파일은 처리하지 않았습니다."
      );
    }
    return masked;
  } finally {
    await parser.destroy();
  }
}
