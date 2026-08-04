import { PDFParse } from "pdf-parse";

const PURPOSE_MAX_LENGTH = 450;
const RESPONSIBILITIES_MAX_ITEMS = 30;

const PURPOSE_PATTERN =
  /\[ .*? \] 직 무 기 술 서\s*\n\s*(?:직무목적|직무목표\s*\(성과책임\))\s*([\s\S]*?)\n\n-- \d+ of \d+ --/;

// 담당업무(단위업무) rows in the NCS-style skill-matrix table read back as
// "<단위업무 이름>\t<적정직급>" once the surrounding 지식/기술/태도 bullet
// columns are stripped out.
const TASK_ROW_PATTERN =
  /^(.{1,25})\t([^\t]{0,15}(?:주임|대리|사원|과장|차장|부장|수석|대졸|팀장|매니저)[^\t]{0,15})$/;

export type JobDescriptionExtraction = {
  purpose: string | null;
  responsibilities: string | null;
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

/**
 * Best-effort extraction of "직무목적" and "담당업무" from a 직무기술서 PDF.
 * The source document's internal text order isn't fully consistent across
 * pages, so a handful of teams either don't match at all or capture a few
 * extra/missing lines — callers should treat this as a starting draft, not
 * a guaranteed-correct parse, and let an admin review/edit it.
 */
export async function extractJobDescriptionFieldsFromPdf(
  buffer: Buffer
): Promise<JobDescriptionExtraction> {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return {
      purpose: extractPurpose(result.text),
      responsibilities: extractResponsibilities(result.text),
    };
  } catch {
    return { purpose: null, responsibilities: null };
  }
}
