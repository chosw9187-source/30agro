import { prisma } from "@/lib/prisma";

/** 한 번에 돌려주는 조문 수 상한. */
export const SEARCH_RESULT_LIMIT = 50;

export type ArticleRow = {
  id: string;
  label: string;
  title: string | null;
  chapter: string | null;
  body: string;
  regulationTitle: string;
};

/**
 * 띄어쓰기를 걷어낸 사본. 사규는 같은 말을 '태아검진'과 '태아 검진'처럼
 * 문서마다 다르게 띄어 써서, 글자 그대로 비교하면 띄어쓰기 하나 때문에
 * 결과가 통째로 사라진다. 질문하는 쪽도 마찬가지라 양쪽 다 걷어내고 본다.
 */
export function stripSpaces(text: string): string {
  return text.replace(/\s+/g, "");
}

/** LIKE 메타문자를 글자 그대로 찾도록 막는다. '50%' 같은 입력이 와일드카드가 되면 안 된다. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * 공백을 뺀 사본에서 찾은 위치를 원문 위치로 되돌린다. 미리보기는 원문에서
 * 잘라내야 하는데 검색은 공백 없는 사본에서 이뤄져 위치가 어긋나기 때문이다.
 * 못 찾으면 -1.
 */
export function findMatchIndex(body: string, needle: string): number {
  let stripped = "";
  const positions: number[] = [];

  for (let i = 0; i < body.length; i += 1) {
    if (!/\s/.test(body[i])) {
      stripped += body[i];
      positions.push(i);
    }
  }

  const at = stripped.toLowerCase().indexOf(needle.toLowerCase());
  return at < 0 ? -1 : positions[at];
}

/**
 * 조문 검색. 한국어는 Postgres 기본 전문검색 사전이 없어 형태소 분석이
 * 안 되므로, 조문 제목·본문·조 번호에 대한 부분일치로 간다. 규정 전체가
 * 수천 조 규모라 인덱스 없이도 응답이 충분히 빠르다.
 *
 * 비교는 양쪽에서 공백을 뺀 뒤에 한다. Prisma의 contains로는 열 값을
 * 가공할 수 없어 raw SQL로 간다 — regexp_replace로 공백을 지운 사본과
 * 맞춰본다.
 */
export async function findArticleRows(needle: string): Promise<ArticleRow[]> {
  const pattern = `%${escapeLike(needle)}%`;

  return prisma.$queryRaw<ArticleRow[]>`
    SELECT a."id", a."label", a."title", a."chapter", a."body",
           r."title" AS "regulationTitle"
    FROM "RegulationArticle" a
    JOIN "Regulation" r ON r."id" = a."regulationId"
    WHERE r."isActive"
      AND (
        regexp_replace(a."body", '[[:space:]]', '', 'g') ILIKE ${pattern}
        OR regexp_replace(COALESCE(a."title", ''), '[[:space:]]', '', 'g') ILIKE ${pattern}
        OR regexp_replace(a."label", '[[:space:]]', '', 'g') ILIKE ${pattern}
        OR regexp_replace(COALESCE(a."chapter", ''), '[[:space:]]', '', 'g') ILIKE ${pattern}
      )
    ORDER BY a."regulationId" ASC, a."order" ASC
    LIMIT ${SEARCH_RESULT_LIMIT}
  `;
}
