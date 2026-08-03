import { PDFParse } from "pdf-parse";

const PURPOSE_MAX_LENGTH = 450;

const PURPOSE_PATTERN =
  /\[ .*? \] 직 무 기 술 서\s*\n\s*(?:직무목적|직무목표\s*\(성과책임\))\s*([\s\S]*?)\n\n-- \d+ of \d+ --/;

/**
 * Best-effort extraction of the "직무목적" paragraph from a 직무기술서 PDF.
 * The source document's internal text order isn't fully consistent across
 * pages, so a handful of teams either don't match at all or capture a few
 * extra trailing lines — callers should treat this as a starting draft, not
 * a guaranteed-correct parse, and let an admin review/edit it.
 */
export async function extractPurposeFromPdf(buffer: Buffer): Promise<string | null> {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const match = result.text.match(PURPOSE_PATTERN);
    if (!match) return null;

    let text = match[1].trim();
    if (text.length > PURPOSE_MAX_LENGTH) {
      const cut = text.lastIndexOf("\n", PURPOSE_MAX_LENGTH);
      text = text.slice(0, cut > 0 ? cut : PURPOSE_MAX_LENGTH).trim();
    }
    return text || null;
  } catch {
    return null;
  }
}
