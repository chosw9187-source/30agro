import { PDFParse } from "pdf-parse";

const PURPOSE_MAX_LENGTH = 450;
const RESPONSIBILITIES_MAX_ITEMS = 30;
const QUALIFICATIONS_MAX_ITEMS = 20;
const LANGUAGES_MAX_ITEMS = 10;

const PURPOSE_PATTERN =
  /\[ .*? \] 직 무 기 술 서\s*\n\s*(?:직무목적|직무목표\s*\(성과책임\))\s*([\s\S]*?)\n\n-- \d+ of \d+ --/;

// 담당업무(단위업무) rows in the NCS-style skill-matrix table read back as
// "<단위업무 이름>\t<적정직급>" once the surrounding 지식/기술/태도 bullet
// columns are stripped out.
const TASK_ROW_PATTERN =
  /^(.{1,25})\t([^\t]{0,15}(?:주임|대리|사원|과장|차장|부장|수석|대졸|팀장|매니저)[^\t]{0,15})$/;

// 관련자격사항/외국어 table: "선행직무(연한)\t후행직무(연한)\t자격증명\t발급기관
// [\t외국어요건]" for the first row of an entry, or just "자격증명\t발급기관"
// (or a bare "자격증명" ending in (필수)/(선택)) on continuation rows.
const QUALIFICATION_TABLE_START = "선행직무(연한)";
const QUALIFICATION_TABLE_END_MARKERS = ["직무이동(선/후행", "-- "];
const REQUIRED_OPTIONAL_SUFFIX = /\((필수|선택)\)\s*$/;
const LANGUAGE_KEYWORDS =
  /(TOEIC|OPIC|TOEFL|HSK|JPT|영어|일어|중국어|어학|외국어|독해|회화|구사|불어|스페인어)/;

export type JobDescriptionExtraction = {
  purpose: string | null;
  responsibilities: string | null;
  qualifications: string | null;
  languages: string | null;
};

function extractPurpose(text: string): string | null {
  const match = text.match(PURPOSE_PATTERN);
  if (!match) return null;

  let purpose = match[1].trim();
  if (purpose.length > PURPOSE_MAX_LENGTH) {
    const cut = purpose.lastIndexOf("\n", PURPOSE_MAX_LENGTH);
    purpose = purpose.slice(0, cut > 0 ? cut : PURPOSE_MAX_LENGTH).trim();
  }
  return purpose || null;
}

function extractResponsibilities(text: string): string | null {
  const tasks: string[] = [];
  const seen = new Set<string>();

  for (const line of text.split("\n")) {
    const match = line.match(TASK_ROW_PATTERN);
    if (!match) continue;
    const task = match[1].trim();
    if (!task || task.includes("•") || seen.has(task)) continue;
    seen.add(task);
    tasks.push(task);
    if (tasks.length >= RESPONSIBILITIES_MAX_ITEMS) break;
  }

  return tasks.length > 0 ? tasks.map((t) => `• ${t}`).join("\n") : null;
}

function extractQualificationsAndLanguages(text: string): {
  qualifications: string | null;
  languages: string | null;
} {
  const startIdx = text.indexOf(QUALIFICATION_TABLE_START);
  if (startIdx === -1) return { qualifications: null, languages: null };

  const afterHeader = text.indexOf("\n", startIdx) + 1;
  let endIdx = text.length;
  for (const marker of QUALIFICATION_TABLE_END_MARKERS) {
    const idx = text.indexOf(marker, afterHeader);
    if (idx !== -1 && idx < endIdx) endIdx = idx;
  }
  const block = text.slice(afterHeader, endIdx);

  const quals: string[] = [];
  const langs: string[] = [];
  const seenQual = new Set<string>();
  const seenLang = new Set<string>();

  for (const line of block.split("\n")) {
    const parts = line
      .split("\t")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) continue;

    if (parts.length >= 4) {
      const qual = parts[2];
      if (qual.length >= 2 && !/^\d+$/.test(qual) && !seenQual.has(qual)) {
        seenQual.add(qual);
        quals.push(qual);
      }
      if (parts.length >= 5) {
        const lang = parts[4];
        if (LANGUAGE_KEYWORDS.test(lang) && !seenLang.has(lang)) {
          seenLang.add(lang);
          langs.push(lang);
        }
      }
    } else if (parts.length <= 2 && REQUIRED_OPTIONAL_SUFFIX.test(parts[0])) {
      const qual = parts[0];
      if (!seenQual.has(qual)) {
        seenQual.add(qual);
        quals.push(qual);
      }
    }

    if (quals.length >= QUALIFICATIONS_MAX_ITEMS && langs.length >= LANGUAGES_MAX_ITEMS) break;
  }

  return {
    qualifications:
      quals.length > 0 ? quals.slice(0, QUALIFICATIONS_MAX_ITEMS).map((q) => `• ${q}`).join("\n") : null,
    languages:
      langs.length > 0 ? langs.slice(0, LANGUAGES_MAX_ITEMS).map((l) => `• ${l}`).join("\n") : null,
  };
}

/**
 * Best-effort extraction of "직무목적", "담당업무", "자격사항", "외국어"
 * from a 직무기술서 PDF. The source document's internal text order isn't
 * fully consistent across teams, so a handful either don't match at all or
 * capture a few extra/missing lines — callers should treat this as a
 * starting draft, not a guaranteed-correct parse, and let an admin
 * review/edit it. 직무역량(역량명) has no reliably extractable values in
 * this document format (the column header exists but rows are effectively
 * empty), so it isn't attempted here and stays a manual-entry field.
 */
export async function extractJobDescriptionFieldsFromPdf(
  buffer: Buffer
): Promise<JobDescriptionExtraction> {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const { qualifications, languages } = extractQualificationsAndLanguages(result.text);
    return {
      purpose: extractPurpose(result.text),
      responsibilities: extractResponsibilities(result.text),
      qualifications,
      languages,
    };
  } catch (err) {
    console.error("[job-description-extract] PDF parse failed:", err);
    return { purpose: null, responsibilities: null, qualifications: null, languages: null };
  }
}
