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

/** 표 한 행을 한 줄로 적을 때 쓰는 칸 구분 문자. 화면에서 표로 되살릴 때도 이 표시를 본다. */
const CELL_MARK = "|";

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
 * 태그를 걷어내고 글자만 남긴다. &amp;를 마지막에 풀어야 "&amp;lt;"가
 * "<"로 두 번 풀리지 않는다.
 */
function stripXml(xml: string): string {
  return xml
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<w:tab\s*\/>/g, " ")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** 셀 안에서는 줄을 바꾸지 않는다 — 한 행은 반드시 한 줄이어야 표로 되살릴 수 있다. */
function cellText(xml: string): string {
  return stripXml(xml)
    .replace(/\s+/g, " ")
    .replace(/\|/g, "/") // 칸 구분 문자와 충돌하므로 바꾼다. 사규 표에는 거의 없다.
    .trim();
}

/**
 * <w:tbl> 한 덩어리를 행당 한 줄로 편다.
 *
 * 표를 문단처럼 풀면 셀 하나가 곧 문단 하나라서 "본인결혼 / 6일 / 50만원"이
 * 세 줄로 흩어진다 — 경조금 기준표가 읽을 수 없게 되는 원인이 이것이다.
 * 병합된 셀은 빈 칸으로 남겨 열 위치를 지킨다.
 *
 * 셀 안에 또 표가 든 경우는 바깥 행이 안쪽 </w:tr>에서 잘린다. 사규에서는
 * 거의 없는 형태라 감수한다.
 */
function tableToLines(tableXml: string): string {
  const lines: string[] = [];

  for (const row of tableXml.matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)) {
    const cells = [...row[0].matchAll(/<w:tc[\s>]([\s\S]*?)<\/w:tc>/g)].map((c) =>
      cellText(c[1]),
    );
    if (cells.length === 0 || cells.every((c) => c === "")) continue;
    lines.push(`${CELL_MARK} ${cells.join(` ${CELL_MARK} `)} ${CELL_MARK}`);
  }

  return lines.length > 0 ? lines.join("\n") + "\n" : "";
}

/** <w:tbl ...> 여는 태그 위치. <w:tblPr>·<w:tblGrid>에 걸리지 않게 다음 글자까지 본다. */
function findTableStart(xml: string, from: number): number {
  const match = /<w:tbl[\s>]/.exec(xml.slice(from));
  return match ? from + match.index : -1;
}

/** 중첩된 표까지 세어 바깥 </w:tbl> 다음 위치를 돌려준다. */
function findTableEnd(xml: string, start: number): number {
  const token = /<w:tbl[\s>]|<\/w:tbl>/g;
  token.lastIndex = start;

  let depth = 0;
  let match: RegExpExecArray | null;
  while ((match = token.exec(xml)) !== null) {
    if (match[0] === "</w:tbl>") {
      depth -= 1;
      if (depth === 0) return match.index + match[0].length;
    } else {
      depth += 1;
    }
  }
  return xml.length;
}

/**
 * .docx는 실제로는 zip이고 본문은 word/document.xml 한 장에 들어있다.
 * 문단(<w:p>)을 줄바꿈으로 바꿔야 "제23조"가 앞 문단 끝에 붙어버리지
 * 않는다 — 조문 파서가 줄 단위로 조 머리글을 찾기 때문에 이 경계가
 * 무너지면 조문이 통째로 하나로 합쳐진다.
 *
 * 표는 문단 규칙을 그대로 적용하면 안 되므로 따로 떼어 행 단위로 편다.
 */
function extractDocx(buffer: Buffer): string {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry("word/document.xml");
  if (!entry) throw new Error("Word 문서 본문(word/document.xml)을 찾을 수 없습니다.");

  const xml = entry.getData().toString("utf8");
  const parts: string[] = [];

  let cursor = 0;
  for (;;) {
    const start = findTableStart(xml, cursor);
    if (start < 0) {
      parts.push(stripXml(xml.slice(cursor)));
      break;
    }
    parts.push(stripXml(xml.slice(cursor, start)));
    const end = findTableEnd(xml, start);
    parts.push(tableToLines(xml.slice(start, end)));
    cursor = end;
  }

  return parts.join("");
}

/**
 * 텍스트 파일 디코딩. 한국 사무환경에서 메모장 "ANSI"로 저장한 파일은
 * UTF-8이 아니라 CP949라서, UTF-8로 읽으면 한글이 통째로 깨진다.
 * 대체문자(U+FFFD)가 섞여 나오면 CP949로 다시 읽는다.
 */
function decodeText(buffer: Buffer): string {
  const utf8 = buffer.toString("utf8");
  if (!utf8.includes("�")) return utf8;

  try {
    return new TextDecoder("euc-kr").decode(buffer);
  } catch {
    return utf8;
  }
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
        : decodeText(buffer);

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
