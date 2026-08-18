import { parseRegulation, buildTableOfContents } from "./src/lib/regulation-parse";

const SAMPLE = `
취 업 규 칙

제1장 총칙

제1조(목적) 이 규칙은 SG한국삼공 주식회사 직원의 근로조건과 복무규율에
관한 사항을 정함을 목적으로 한다.

제2조(적용범위)
① 이 규칙은 회사에 근무하는 모든 직원에게 적용한다.
② 다만, 촉탁직 및 일용직에 대하여는 별도로 정하는 바에 따른다.

제 3 조 （ 정의 ）  이 규칙에서 사용하는 용어의 뜻은 다음과 같다.
1. "직원"이란 회사와 근로계약을 체결한 자를 말한다.
2. "임원"이란 이사회에서 선임된 자를 말한다.

-- 1 of 12 --

제2장 근로시간

제23조(연차유급휴가)
① 회사는 1년간 80퍼센트 이상 출근한 직원에게 15일의 유급휴가를 준다.
② 3년 이상 계속하여 근로한 직원에게는 최초 1년을 초과하는 계속근로연수
매 2년에 대하여 1일을 가산한 유급휴가를 준다.

제23조의2(연차휴가의 사용촉진) 회사는 근로기준법 제61조에 따라 연차유급
휴가의 사용을 촉진할 수 있다.

제24조 회사는 직원의 청구가 있는 경우 생리휴가를 부여한다.

부칙

제1조(시행일) 이 규칙은 2026년 1월 1일부터 시행한다.

[별표 1] 직급별 호봉표
1호봉 ... 2호봉 ...
`;

const articles = parseRegulation(SAMPLE);
console.log(`=== 조문 ${articles.length}건 ===`);
for (const a of articles) {
  console.log(
    `[${a.order}] ${a.label} | 제목=${a.title ?? "(없음)"} | 장=${a.chapter ?? "-"} | 부칙=${a.isAddenda}`,
  );
  console.log(`     본문: ${JSON.stringify(a.body.slice(0, 70))}`);
}
console.log("\n=== 목차 ===");
console.log(buildTableOfContents(articles));
