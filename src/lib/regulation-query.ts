/**
 * 질문 문장에서 규정 검색에 쓸 낱말을 뽑아낸다.
 *
 * 검색은 낱말 부분일치라서 "연차 규정이 어떻게 돼?"를 통째로 넣으면
 * 아무것도 못 찾는다. 사람은 문장으로 묻는데 검색은 낱말을 받으므로,
 * 그 사이를 여기서 메운다. LLM 없이 규칙만 쓴다.
 */

/**
 * 낱말 뒤에 붙는 조사와 물음 어미. 떼어낸 줄기가 2글자 미만이면 떼지 않는다 —
 * "추가"에서 "가"를 떼면 "추"가 되어 엉뚱한 조문이 쏟아진다.
 * 긴 것부터 시도해야 "인가요"가 "요"보다 먼저 걸린다.
 */
const SUFFIXES = [
  "하나요", "인가요", "일까요", "할까요", "되나요", "되는지", "이라고", "으로는",
  "에서는", "에게는", "까지는", "부터는", "합니까", "합니다", "해줘요",
  "하면", "해서", "하는", "해요", "하지", "되면", "된다",
  "나요", "가요", "인가", "이야", "라고", "으로", "에서", "에게", "한테", "까지",
  "부터", "보다", "처럼", "이나", "이란", "이는",
  "은", "는", "이", "가", "을", "를", "의", "에", "로", "와", "과", "도", "만", "랑",
].sort((a, b) => b.length - a.length);

/**
 * 질문에만 있고 규정에는 없는 말. 이걸 안 걸러내면 "규정"이 들어간 조문이
 * 전부 걸려서 결과가 무의미해진다.
 */
const STOPWORDS = new Set([
  "규정", "규칙", "사규", "내용", "부분", "관련", "대해", "대한", "경우", "사항",
  "어떻게", "어떤", "어디", "언제", "누가", "무엇", "얼마", "몇일", "며칠", "얼마나",
  "알려줘", "알려주세요", "알려", "궁금해", "궁금해요", "궁금합니다", "궁금",
  "있나요", "있어요", "있어", "있는지", "되나요", "되요", "돼요", "인가요", "일까요",
  "해줘", "해주세요", "주세요", "봐줘", "찾아줘", "찾아", "말해줘",
  "그리고", "그런데", "하지만", "이거", "저거", "그거", "이것", "저것", "그것",
  "우리", "회사", "직원", "저는", "제가", "내가",
]);

/**
 * 사람이 쓰는 말 → 규정에 실제로 쓰인 말. 규정은 "산전후휴가"라고 적는데
 * 사람은 "출산휴가"라고 묻는다. 이 표가 없으면 그 질문은 영영 못 찾는다.
 * 사내 용어가 바뀌면 여기만 고치면 된다.
 */
const SYNONYMS: Record<string, string[]> = {
  휴가: ["연차", "월차"],
  반차: ["연차"],
  월차: ["연차"],
  연가: ["연차"],
  출산휴가: ["산전후휴가", "출산전후휴가", "출산"],
  출산: ["산전후휴가", "출산전후휴가"],
  육아휴직: ["육아"],
  야근: ["시간외", "연장근로", "연장"],
  잔업: ["시간외", "연장근로"],
  특근: ["휴일근로", "시간외"],
  월급: ["임금", "급여", "보수"],
  급여: ["임금", "보수"],
  임금: ["급여", "보수"],
  연봉: ["임금", "급여", "보수"],
  퇴직금: ["퇴직급여"],
  경조금: ["경조사"],
  경조사비: ["경조사", "경조금"],
  축의금: ["경조사", "경조금"],
  조의금: ["경조사", "경조금"],
  출장비: ["여비", "출장"],
  교통비: ["여비", "출장"],
  식대: ["급식", "중식"],
  병가: ["질병", "요양"],
  지각: ["결근", "근태"],
  결근: ["근태"],
  승진: ["승격", "승급"],
  징계: ["제재", "징계"],
  해고: ["해고", "면직", "퇴직"],
  정년: ["정년", "퇴직"],
  수습: ["수습", "시용"],
  교육: ["교육", "연수"],
  건강검진: ["건강진단", "검진"],
  태아검진: ["태아검진", "임신"],
};

export type SearchTerm = {
  term: string;
  /** 질문에 그대로 나온 낱말은 2, 유의어·앞머리로 넓힌 낱말은 1. 정수여야 한다 — 소수는 SQL에서 깨진다. */
  weight: number;
};

/**
 * 조사·어미를 떼어낸 줄기. 2글자 미만으로 줄어들면 원형을 그대로 둔다.
 *
 * 이 판단은 원래 틀릴 수밖에 없다 — "출산휴가"의 "가"는 조사가 아니라
 * 낱말의 일부인데 글자만 봐서는 구분이 안 된다. 그래서 호출부는 줄기와
 * 원형을 모두 검색한다. 여기서는 "그럴듯한 줄기"만 만들면 된다.
 */
function stripSuffix(token: string): string {
  for (const suffix of SUFFIXES) {
    if (token.length > suffix.length && token.endsWith(suffix)) {
      const stem = token.slice(0, -suffix.length);
      if (stem.length >= 2) return stem;
    }
  }
  return token;
}

/** 질문을 한글·영문·숫자 덩어리로 자르고 질문에만 쓰는 말을 버린다. */
function tokenize(question: string): string[] {
  const tokens = question.match(/[가-힣]+|[A-Za-z]+|\d+/g) ?? [];
  return tokens.filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/**
 * 질문에서 뽑은 낱말들. 결과가 없을 때 "이 낱말로 찾아봤다"고 알리는 데 쓴다.
 * 검색 자체는 buildSearchTerms가 더 넓게 잡는다.
 */
export function extractKeywords(question: string): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const token of tokenize(question)) {
    const stem = stripSuffix(token);
    if (stem.length < 2 || STOPWORDS.has(stem) || seen.has(stem)) continue;
    seen.add(stem);
    keywords.push(stem);
  }

  return keywords;
}

/**
 * 질문 → 검색어 목록.
 *
 * 낱말 하나에서 최대 네 갈래를 만든다 — 원형, 조사를 뗀 줄기, 합성어의
 * 앞머리, 그리고 유의어. 어느 갈래가 맞는지 미리 알 수 없으니 다 넣고
 * 점수로 가린다.
 *
 * 낱말을 하나도 못 뽑으면(예: "규정 알려줘") 질문을 그대로 쓴다 — 빈손으로
 * 돌려보내는 것보다는 원래 방식대로라도 찾아보는 편이 낫다.
 */
export function buildSearchTerms(question: string): SearchTerm[] {
  const tokens = tokenize(question);
  if (tokens.length === 0) {
    const fallback = question.trim();
    return fallback.length >= 2 ? [{ term: fallback, weight: 2 }] : [];
  }

  const terms: SearchTerm[] = [];
  const seen = new Set<string>();

  const add = (term: string, weight: number) => {
    if (term.length < 2 || STOPWORDS.has(term) || seen.has(term)) return;
    seen.add(term);
    terms.push({ term, weight });
  };

  for (const token of tokens) {
    const stem = stripSuffix(token);

    // 원형과 줄기를 모두 넣는다. "연차휴가는"은 줄기가, "출산휴가"는 원형이 맞다.
    add(stem, 2);
    add(token, 2);

    for (const base of new Set([stem, token])) {
      for (const synonym of SYNONYMS[base] ?? []) add(synonym, 1);

      // 합성어의 앞머리도 함께 찾는다. 검색이 부분일치라 "연차휴가"로는
      // "연차유급휴가"가 안 걸린다 — 가운데에 글자가 끼기 때문이다.
      // "연차휴가"→"연차", "육아휴직"→"육아", "시간외근로"→"시간외".
      if (base.length >= 4) {
        const head = base.slice(0, Math.ceil(base.length / 2));
        add(head, 1);
        for (const synonym of SYNONYMS[head] ?? []) add(synonym, 1);
      }
    }
  }

  return terms;
}
