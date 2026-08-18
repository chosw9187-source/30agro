import AdmZip from "adm-zip";
import { PDFParse } from "pdf-parse";

/**
 * 규정 파일에서 조문 파싱용 원문 텍스트를 뽑는다. 규정은 부서마다
 * PDF/Word/텍스트가 섞여 있어서 형식별로 다른 경로를 탄다.
 *
 * 여기서는 조문 구조를 건드리지 않고 "줄바꿈이 살아있는 평문"까지만
 * 만든다 — 제N장/제N조를 인식하는 일은 regulation-parse.ts 담당이다.
 */

export type RegulationFileType = "pdf" | "docx" | "txt";

export function detectFileType(fileName: string): RegulationFileType | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "txt";
  return null;
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text;
}

/**
 * .docx는 실제로는 zip이고 본문은 word/document.xml 한 장에 들어있다.
 * 문단(<w:p>)을 줄바꿈으로 바꿔야 "제23조"가 앞 문단 끝에 붙어버리지
 * 않는다 — 조문 파서가 줄 단위로 조 머리글을 찾기 때문에 이 경계가
 * 무너지면 조문이 통째로 하나로 합쳐진다.
 */
function extractDocx(buffer: Buffer): string {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry("word/document.xml");
  if (!entry) throw new Error("Word 문서 본문(word/document.xml)을 찾을 수 없습니다.");

  return entry
    .getData()
    .toString("utf8")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export async function extractRegulationText(
  fileName: string,
  buffer: Buffer,
): Promise<string> {
  const type = detectFileType(fileName);
  if (!type) {
    throw new Error(
      "지원하지 않는 형식입니다. PDF·Word(.docx)·텍스트(.txt)만 올릴 수 있습니다.",
    );
  }

  const text =
    type === "pdf"
      ? await extractPdf(buffer)
      : type === "docx"
        ? extractDocx(buffer)
        : buffer.toString("utf8");

  // 스캔본 PDF는 텍스트 레이어가 없어 빈 문자열이 나온다. 여기서 걸러야
  // "조문 0건"이라는 애매한 결과 대신 원인을 짚어줄 수 있다.
  if (text.trim().length < 50) {
    throw new Error(
      type === "pdf"
        ? "PDF에서 글자를 찾지 못했습니다. 스캔한 이미지 PDF일 수 있습니다 — 원본 문서 파일(.docx)이 있으면 그쪽이 정확합니다."
        : "파일에서 읽어낸 내용이 거의 없습니다.",
    );
  }

  return text;
}
