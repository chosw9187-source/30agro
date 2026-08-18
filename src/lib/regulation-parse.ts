/**
 * 사내규정 원문을 조(條) 단위로 쪼갠다.
 *
 * 규정 챗봇이 "그럴듯한 답" 대신 "근거 조항"을 내놓으려면 검색 단위가
 * 조문이어야 한다 — 고정 길이로 자르면 한 조가 두 청크로 갈리거나 서로
 * 다른 두 조가 한 청크에 섞여서, 답변에 "제23조 ②항" 같은 출처를 달 수
 * 없다. 한국 사규는 제N장 > 제N조(제목) > ①②③ 구조가 문서마다 거의
 * 동일해서 규칙 기반 파싱만으로 충분하다.
 */

/** "제3장 근로시간", "제 3 장  근로시간" — PDF 추출본은 글자 사이가 벌어진다. */
const CHAPTER_PATTERN = /^제\s*(\d+)\s*장\s*(.*)$/;
const SECTION_PATTERN = /^제\s*(\d+)\s*절\s*(.*)$/;

/**
 * "제23조(연차유급휴가) ① 사용자는..." — 제목과 본문 첫 항이 한 줄에
 * 붙어 나오는 경우가 흔하다. "제23조의2"처럼 가지번호가 붙기도 한다.
 * 괄호는 전각/반각이 섞여 들어온다.
 */
const ARTICLE_PATTERN =
  /^제\s*(\d+)\s*조(?:\s*의\s*(\d+))?\s*(?:[(（]\s*([^)）]*?)\s*[)）])?\s*(.*)$/;

/**
 * 부칙은 조 번호가 제1조부터 다시 시작한다. 본칙과 같은 네임스페이스에
 * 넣으면 "제1조"가 두 개가 되어 인용이 깨지므로 별도로 표시한다.
 */
const ADDENDA_PATTERN = /^부\s*칙/;

/** 별표/서식은 조문이 아니라 첨부물이라 조문 원장에 섞이면 안 된다. */
const ATTACHMENT_PATTERN = /^\[?\s*(별표|별지|서식)\s*\d*/;

/** PDF 추출본에 섞여 들어오는 페이지 머리말/꼬리말. */
const PAGE_NOISE_PATTERN = /^(-{2,}\s*\d+\s*of\s*\d+\s*-{2,}|-\s*\d+\s*-|\d+\s*\/\s*\d+)$/;

export type ParsedArticle = {
  /** 문서 내 순서. 목차를 원문 순으로 보여줄 때 쓴다. */
  order: number;
  /** 인용에 쓰는 표기. 예: "제23조", "제23조의2", "부칙 제1조" */
  label: string;
  articleNo: number;
  /** 가지번호(제23조의2의 "2"). 없으면 null. */
  branchNo: number | null;
  /** 괄호 안 제목. 예: "연차유급휴가". 제목 없는 조도 있어서 nullable. */
  title: string | null;
  chapter: string | null;
  section: string | null;
  isAddenda: boolean;
  /** 조문 본문 전문 (항·호 포함, 줄바꿈 유지). */
  body: string;
};

function normalizeLine(line: string): string {
  return line
    .replace(/ /g, " ") // PDF가 뱉는 non-breaking space
    .replace(/[ \t]+/g, " ")
    .trim();
}

function buildLabel(
  articleNo: number,
  branchNo: number | null,
  isAddenda: boolean,
): string {
  const base = branchNo === null ? `제${articleNo}조` : `제${articleNo}조의${branchNo}`;
  return isAddenda ? `부칙 ${base}` : base;
}

/**
 * 규정 원문 텍스트 → 조문 배열. 조문이 하나도 안 잡히면 빈 배열을
 * 돌려주므로, 호출부에서 "파싱 실패"로 보고 수동 검수를 태워야 한다.
 */
export function parseRegulation(text: string): ParsedArticle[] {
  const articles: ParsedArticle[] = [];

  let chapter: string | null = null;
  let section: string | null = null;
  let isAddenda = false;
  let current: ParsedArticle | null = null;
  let bodyLines: string[] = [];

  const flush = () => {
    if (!current) return;
    current.body = bodyLines.join("\n").trim();
    articles.push(current);
    current = null;
    bodyLines = [];
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = normalizeLine(rawLine);
    if (!line || PAGE_NOISE_PATTERN.test(line)) continue;

    if (ADDENDA_PATTERN.test(line)) {
      flush();
      isAddenda = true;
      chapter = null;
      section = null;
      continue;
    }

    // 별표부터는 조문이 아니므로 수집을 멈춘다.
    if (ATTACHMENT_PATTERN.test(line)) {
      flush();
      continue;
    }

    const chapterMatch = line.match(CHAPTER_PATTERN);
    if (chapterMatch) {
      flush();
      chapter = chapterMatch[2].trim() || `제${chapterMatch[1]}장`;
      section = null;
      continue;
    }

    const sectionMatch = line.match(SECTION_PATTERN);
    if (sectionMatch) {
      flush();
      section = sectionMatch[2].trim() || `제${sectionMatch[1]}절`;
      continue;
    }

    const articleMatch = line.match(ARTICLE_PATTERN);
    if (articleMatch) {
      flush();
      const articleNo = Number(articleMatch[1]);
      const branchNo = articleMatch[2] ? Number(articleMatch[2]) : null;
      current = {
        order: articles.length,
        label: buildLabel(articleNo, branchNo, isAddenda),
        articleNo,
        branchNo,
        title: articleMatch[3]?.trim() || null,
        chapter,
        section,
        isAddenda,
        body: "",
      };
      // 제목 뒤 같은 줄에 본문 첫 항이 붙어 있으면 본문으로 넘긴다.
      const trailing = articleMatch[4]?.trim();
      if (trailing) bodyLines.push(trailing);
      continue;
    }

    // 첫 조문 이전의 표지/목차 줄은 버린다.
    if (current) bodyLines.push(line);
  }

  flush();
  return articles;
}

/**
 * 조문 목차 — 챗봇 1차 호출에서 "질문과 관련된 조항 고르기"에 넣는 입력.
 * 본문 전체(수십만 토큰)를 매번 넣는 대신 목차만 주고 조문 label을 고르게
 * 한 뒤, 고른 조문의 전문만 2차 호출에 넣어 답변을 만든다.
 */
export function buildTableOfContents(articles: ParsedArticle[]): string {
  const lines: string[] = [];
  let lastChapter: string | null = null;

  for (const article of articles) {
    if (article.chapter && article.chapter !== lastChapter) {
      lines.push(`## ${article.chapter}`);
      lastChapter = article.chapter;
    }
    lines.push(
      article.title ? `${article.label}(${article.title})` : article.label,
    );
  }

  return lines.join("\n");
}
