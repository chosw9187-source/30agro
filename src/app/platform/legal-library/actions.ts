"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireRole } from "@/lib/auth-helpers";
import { checkModuleAccess } from "@/lib/permissions";
import { extractRegulationText, detectFileType } from "@/lib/regulation-extract";
import { parseRegulation, type ParsedArticle } from "@/lib/regulation-parse";
import {
  findArticleRows,
  findMatchIndex,
  stripSpaces,
} from "@/lib/regulation-search";

const SNIPPET_LENGTH = 160;

export type RegulationUploadResult = {
  fileName: string;
  regulationId?: string;
  title?: string;
  articleCount?: number;
  /** 파싱이 제대로 됐는지 화면에서 눈으로 확인할 수 있게 앞 몇 건을 돌려준다. */
  samples?: { label: string; title: string | null }[];
  error?: string;
};

function toTitle(fileName: string): string {
  return fileName.replace(/\.(pdf|docx|txt|md)$/i, "").trim() || fileName;
}

async function writeArticles(regulationId: string, articles: ParsedArticle[]) {
  await prisma.regulationArticle.deleteMany({ where: { regulationId } });
  if (articles.length > 0) {
    await prisma.regulationArticle.createMany({
      data: articles.map((a) => ({
        regulationId,
        order: a.order,
        label: a.label,
        articleNo: a.articleNo,
        branchNo: a.branchNo,
        title: a.title,
        chapter: a.chapter,
        section: a.section,
        isAddenda: a.isAddenda,
        body: a.body,
      })),
    });
  }
  await prisma.regulation.update({
    where: { id: regulationId },
    data: { articleCount: articles.length },
  });
}

/**
 * 규정 파일 여러 개를 한 번에 올려 조문 단위로 쪼개 저장한다.
 * 파싱은 정규식 기반이라 결과가 결정적이지만, 문서 편집 습관에 따라
 * 조문이 안 잡힐 수 있어서 결과에 인식 건수와 앞 조문 몇 개를 함께
 * 돌려준다 — 화면에서 바로 오파싱을 알아챌 수 있어야 한다.
 */
export async function uploadRegulations(
  formData: FormData,
): Promise<RegulationUploadResult[]> {
  const session = await requireRole("ADMIN");

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return [];

  const category = (formData.get("category") as string)?.trim() || null;

  const results: RegulationUploadResult[] = [];
  for (const file of files) {
    try {
      if (!detectFileType(file.name)) {
        throw new Error("PDF·Word(.docx)·텍스트(.txt)만 올릴 수 있습니다.");
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const sourceText = await extractRegulationText(file.name, buffer);
      const articles = parseRegulation(sourceText);

      if (articles.length === 0) {
        throw new Error(
          "조문(제N조)을 하나도 찾지 못했습니다. 문서 형식이 표준과 달라 파서 조정이 필요합니다.",
        );
      }

      const regulation = await prisma.regulation.create({
        data: {
          title: toTitle(file.name),
          category,
          fileName: file.name,
          fileType: file.type || null,
          fileData: buffer,
          sourceText,
          uploadedById: session.user.id,
        },
        select: { id: true, title: true },
      });

      await writeArticles(regulation.id, articles);

      results.push({
        fileName: file.name,
        regulationId: regulation.id,
        title: regulation.title,
        articleCount: articles.length,
        samples: articles.slice(0, 5).map((a) => ({ label: a.label, title: a.title })),
      });
    } catch (e) {
      results.push({
        fileName: file.name,
        error: e instanceof Error ? e.message : "처리 실패",
      });
    }
  }

  revalidatePath("/platform/legal-library");
  revalidatePath("/platform/data-upload");
  return results;
}

/**
 * 올렸던 파일에서 원문을 다시 뽑아 조문을 다시 쪼갠다. 파서나 추출기를
 * 고쳤을 때 파일을 다시 올리지 않고 반영하기 위한 것 — 실제 문서를 보고
 * 손볼 일이 반복되므로 재파싱 경로가 없으면 매번 재업로드해야 한다.
 *
 * 저장된 sourceText만 다시 쪼개면 옛 추출 결과에 갇힌다. 표 인식처럼
 * 추출 단계를 고친 경우가 그래서, 원본 파일이 남아 있으면 추출부터 다시
 * 한다. 원본이 없거나 추출이 실패하면 저장된 원문으로 물러선다.
 */
export async function reparseRegulation(id: string): Promise<{ articleCount: number }> {
  await requireRole("ADMIN");

  const regulation = await prisma.regulation.findUnique({
    where: { id },
    select: { sourceText: true, fileName: true, fileData: true },
  });
  if (!regulation) throw new Error("규정을 찾을 수 없습니다.");

  let sourceText = regulation.sourceText;

  if (regulation.fileData && regulation.fileName) {
    try {
      const extracted = await extractRegulationText(
        regulation.fileName,
        Buffer.from(regulation.fileData),
      );
      sourceText = extracted;
      await prisma.regulation.update({ where: { id }, data: { sourceText } });
    } catch {
      // 재추출 실패는 재파싱 자체를 막지 않는다 — 아래 저장된 원문으로 간다.
    }
  }

  if (!sourceText) {
    throw new Error("원문이 저장돼 있지 않습니다. 파일을 다시 올려주세요.");
  }

  const articles = parseRegulation(sourceText);
  await writeArticles(id, articles);

  revalidatePath("/platform/legal-library");
  revalidatePath("/platform/data-upload");
  return { articleCount: articles.length };
}

export async function deleteRegulation(id: string): Promise<void> {
  await requireRole("ADMIN");
  await prisma.regulation.delete({ where: { id } });
  revalidatePath("/platform/legal-library");
  revalidatePath("/platform/data-upload");
}

export async function setRegulationActive(id: string, isActive: boolean): Promise<void> {
  await requireRole("ADMIN");
  await prisma.regulation.update({ where: { id }, data: { isActive } });
  revalidatePath("/platform/legal-library");
  revalidatePath("/platform/data-upload");
}

export type ArticleSearchHit = {
  id: string;
  regulationTitle: string;
  label: string;
  title: string | null;
  chapter: string | null;
  snippet: string;
};

/**
 * 조문 검색. 실제 조회와 순수 계산은 lib/regulation-search에 있다 —
 * "use server" 파일은 async 함수만 내보낼 수 있어 여기 두면 테스트에서
 * 부를 수가 없다.
 */
export async function searchArticles(query: string): Promise<ArticleSearchHit[]> {
  if (!(await checkModuleAccess("LEGAL_LIBRARY"))) return [];

  const needle = stripSpaces(query);
  if (needle.length < 2) return [];

  const hits = await findArticleRows(needle);

  return hits.map((hit) => {
    // 본문 첫머리 대신 검색어 주변을 보여줘야 왜 걸렸는지 알 수 있다.
    const at = findMatchIndex(hit.body, needle);
    const from = at < 0 ? 0 : Math.max(0, at - 40);
    // 표 행의 칸 구분 문자는 미리보기에서 노이즈라 공백으로 편다.
    const snippet = hit.body
      .slice(from, from + SNIPPET_LENGTH)
      .replace(/\s*\|\s*/g, " ");

    return {
      id: hit.id,
      regulationTitle: hit.regulationTitle,
      label: hit.label,
      title: hit.title,
      chapter: hit.chapter,
      snippet: (from > 0 ? "…" : "") + snippet + (from + SNIPPET_LENGTH < hit.body.length ? "…" : ""),
    };
  });
}

export async function getArticle(id: string) {
  if (!(await checkModuleAccess("LEGAL_LIBRARY"))) return null;

  return prisma.regulationArticle.findUnique({
    where: { id },
    select: {
      label: true,
      title: true,
      chapter: true,
      section: true,
      body: true,
      regulation: { select: { title: true, revisedAt: true } },
    },
  });
}

export async function isRegulationAdmin(): Promise<boolean> {
  const session = await auth();
  return session?.user.role === "ADMIN";
}
