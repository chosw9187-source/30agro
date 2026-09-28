import Link from "next/link";

/**
 * **디자인 미리보기** — 고치기 전에 «지금»과 «바꾼 뒤»를 나란히 놓고 고르는 자리.
 *
 * 화면을 먼저 바꿔 놓고 물으면, 마음에 안 들 때 되돌리는 값이 크고 그사이 쓰던
 * 사람이 혼란스럽다. 그래서 여기서는 **아무것도 저장하지 않는다** — 실제 화면은
 * 그대로 두고, 그림만 그려 둔 방이다. 고른 것만 실제 화면에 옮긴다.
 *
 * 여기 그려진 것은 진짜 부품이 아니라 «그림»이다. 일부러 그렇게 둔다 — 진짜
 * 부품을 끌어다 쓰면 이 화면을 손볼 때마다 실제 화면이 흔들린다.
 */

export const dynamic = "force-dynamic";

const CARD = "rounded-xl border border-slate-200 bg-white shadow-sm";

/** 「지금 / 바꾼 뒤」 한 칸. 바꾼 뒤 쪽만 초록 테를 둘러 눈이 먼저 간다. */
function Pane({
  kind,
  children,
}: {
  kind: "now" | "next";
  children: React.ReactNode;
}) {
  const next = kind === "next";
  return (
    <div
      className={`flex min-w-0 flex-col overflow-hidden rounded-xl border ${
        next
          ? "border-brand-green/50 bg-brand-green-light/20"
          : "border-slate-200 bg-slate-50/60"
      }`}
    >
      <p
        className={`px-3 py-1.5 text-[11px] font-semibold ${
          next
            ? "bg-brand-green/10 text-brand-green-dark"
            : "bg-slate-100 text-slate-500"
        }`}
      >
        {next ? "바꾼 뒤" : "지금"}
      </p>
      <div className="min-w-0 flex-1 p-3">{children}</div>
    </div>
  );
}

function Item({
  id,
  title,
  why,
  effort,
  scope,
  now,
  next,
}: {
  id: string;
  title: string;
  why: string;
  effort: string;
  scope: string;
  now: React.ReactNode;
  next: React.ReactNode;
}) {
  return (
    <section id={id} className={`${CARD} scroll-mt-4`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-100 px-4 py-2.5">
        <span className="rounded-md bg-goal-4/10 px-2 py-0.5 text-xs font-bold text-goal-4">
          {id.toUpperCase()}
        </span>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        <span className="text-xs break-keep text-slate-500">{why}</span>
      </div>
      <div className="grid gap-3 p-4 lg:grid-cols-2">
        <Pane kind="now">{now}</Pane>
        <Pane kind="next">{next}</Pane>
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-2 text-[11px] break-keep text-slate-500">
        <span>
          <b className="font-semibold text-slate-700">작업량</b> {effort}
        </span>
        <span>
          <b className="font-semibold text-slate-700">바뀌는 곳</b> {scope}
        </span>
      </p>
    </section>
  );
}

/* ── 그림 부품 — 실제 부품이 아니라 이 화면에서만 쓰는 모형 ─────────── */

function FakeField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      <span className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700">
        {value}
      </span>
    </div>
  );
}

function FakeMenu({
  items,
  flat,
}: {
  items: { group?: string; rows: string[] }[];
  flat?: boolean;
}) {
  return (
    <div className="rounded-lg bg-brand-green px-2 py-2 text-white">
      <div className="ml-1 border-l border-white/20 pl-2">
        {items.map((g, i) => (
          <div key={i} className={i === 0 ? "" : "mt-2"}>
            {/*
              묶음 이름은 **누를 수 없는 머리**다. 메뉴 줄과 같은 흰 글씨로 두면
              한 줄로 읽혀 묶음이 아무 일도 하지 않는다 — 브랜드의 노란빛 작은
              글씨에 가느다란 선을 붙여 눈으로 갈라 준다.
            */}
            {!flat && g.group && (
              <div className="mb-1 flex items-center gap-2 px-1">
                <span className="text-[10px] font-bold tracking-wider whitespace-nowrap text-amber-200">
                  {g.group}
                </span>
                <span className="h-px flex-1 bg-white/20" />
              </div>
            )}
            {g.rows.map((r) => (
              <p
                key={r}
                className="rounded px-2 py-[3px] text-[11px] text-white/90"
              >
                {r}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DesignPreviewPage() {
  return (
    <div className="flex flex-col gap-4">
      <section className={CARD}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
          <h1 className="text-lg font-bold text-slate-900">디자인 미리보기</h1>
          <span className="text-xs break-keep text-slate-500">
            고치기 전에 「지금」과 「바꾼 뒤」를 나란히 봅니다 — 이 화면은
            그림일 뿐, 아무것도 저장하지 않습니다.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2">
          {[
            ["d1", "D-1 용어 통일"],
            ["d2", "D-2 결과지 인쇄"],
            ["d3", "D-3 관리 메뉴 묶기"],
            ["d4", "D-4 홈 «할 일»"],
            ["d5", "D-5 모바일 자기평가"],
          ].map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              {label}
            </a>
          ))}
          <span className="ml-auto text-[11px] break-keep text-slate-400">
            마음에 드는 번호를 알려 주시면 그것만 실제 화면에 옮깁니다
          </span>
        </div>
      </section>

      {/* ── D-1 ─────────────────────────────────────────────── */}
      <Item
        id="d1"
        title="용어를 하나로"
        why="DB 한 칸을 화면마다 다르게 부르고 있습니다 — 값은 그대로, 글자만 바꿉니다."
        effort="반나절 (라벨·안내문 교체)"
        scope="팀 관리 · 사용자 관리 · 조직도 안내문 · 평가2 안내문"
        now={
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              <FakeField label="팀 이름" value="인사팀" />
              <FakeField label="사업단위" value="재무경영관리" />
              <FakeField label="본부" value="경영관리" />
            </div>
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
              <p className="text-[11px] text-slate-500">
                평가2에서는 같은 값을
              </p>
              <p className="text-xs text-slate-700">
                「오동률 <b>운영책임 라인</b>」 · 「경영관리 <b>부문</b>」
              </p>
            </div>
            <p className="text-[11px] break-keep text-status-critical">
              같은 칸을 팀 관리는 「본부」, 평가2는 「부문」이라 부릅니다 —
              안내를 읽고도 어디를 채워야 할지 찾지 못합니다.
            </p>
          </div>
        }
        next={
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              <FakeField label="팀 이름" value="인사팀" />
              <FakeField label="본부" value="재무경영관리" />
              <FakeField label="부문" value="경영관리" />
            </div>
            <div className="rounded-md border border-brand-green/40 bg-white px-3 py-2">
              <p className="text-[11px] text-slate-500">
                평가2에서도 같은 말로
              </p>
              <p className="text-xs text-slate-700">
                「오동률 운영책임 — <b>본부</b>」 · 「경영관리 <b>부문</b>의
                책임」
              </p>
            </div>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="py-0.5 font-medium">저장되는 값</th>
                  <th className="py-0.5 font-medium">지금</th>
                  <th className="py-0.5 font-medium">바꾼 뒤</th>
                </tr>
              </thead>
              <tbody className="text-slate-600">
                <tr className="border-t border-slate-100">
                  <td className="py-0.5">businessUnit</td>
                  <td>사업단위</td>
                  <td className="font-semibold text-brand-green-dark">본부</td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="py-0.5">division</td>
                  <td>본부</td>
                  <td className="font-semibold text-brand-green-dark">부문</td>
                </tr>
              </tbody>
            </table>
          </div>
        }
      />

      {/* ── D-2 ─────────────────────────────────────────────── */}
      <Item
        id="d2"
        title="결과지 인쇄 · PDF"
        why="면담 때 종이로 주거나 보관해야 하는데, 지금 인쇄하면 사이드바와 단추까지 같이 나옵니다."
        effort="반나절 (인쇄 전용 스타일 한 벌 + 「인쇄」 단추)"
        scope="평가결과 화면"
        now={
          <div className="flex gap-1">
            <div className="w-1/4 rounded bg-brand-green-dark px-1 py-2">
              <p className="text-[8px] text-white/80">홈</p>
              <p className="text-[8px] text-white/80">조직도</p>
              <p className="text-[8px] text-white/80">평가2</p>
            </div>
            <div className="flex-1 rounded border border-slate-200 bg-white p-2">
              <p className="text-[10px] font-bold text-slate-800">
                2026년 인사평가 결과지
              </p>
              <p className="mt-1 text-[9px] text-slate-500">
                성과 96 · 역량 90 · 종합 93.6
              </p>
              <div className="mt-2 flex gap-1">
                <span className="rounded bg-brand-green px-1.5 py-0.5 text-[8px] text-white">
                  평가결과 동의
                </span>
                <span className="rounded border border-slate-300 px-1.5 py-0.5 text-[8px] text-slate-600">
                  이의신청
                </span>
              </div>
              <p className="mt-2 text-[9px] break-keep text-status-critical">
                ↑ 종이에도 메뉴와 단추가 그대로 찍힙니다
              </p>
            </div>
          </div>
        }
        next={
          <div className="flex flex-col gap-2">
            <div className="flex justify-end">
              <span className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-700">
                🖨 인쇄 · PDF로 저장
              </span>
            </div>
            <div className="mx-auto w-[72%] rounded border border-slate-300 bg-white p-3 shadow-sm">
              <p className="text-center text-[10px] font-bold text-slate-900">
                2026년 인사평가 결과지
              </p>
              <p className="mt-0.5 text-center text-[8px] text-slate-500">
                한담당 담당 · 영업고객관리팀
              </p>
              <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                {[
                  ["성과", "96"],
                  ["역량", "90"],
                  ["종합", "93.6"],
                ].map(([k, v]) => (
                  <div key={k} className="rounded bg-slate-50 py-1">
                    <p className="text-[8px] text-slate-500">{k}</p>
                    <p className="text-[11px] font-bold text-slate-900">{v}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 border-t border-slate-200 pt-1 text-[8px] text-slate-400">
                메뉴 · 단추 · 배경색은 빠지고, A4 한 장에 맞춰 나옵니다
              </p>
            </div>
          </div>
        }
      />

      {/* ── D-3 ─────────────────────────────────────────────── */}
      <Item
        id="d3"
        title="관리 메뉴를 네 묶음으로"
        why="열세 개가 평평하게 놓여 있어, 인사팀이 아닌 사람은 어디로 가야 할지 찾지 못합니다."
        effort="적용 완료 — 왼쪽 메뉴에서 바로 보입니다"
        scope="왼쪽 「관리」 메뉴"
        now={
          <FakeMenu
            flat
            items={[
              {
                rows: [
                  "사용자 관리",
                  "팀 관리",
                  "데이터 업로드",
                  "평가 템플릿",
                  "평가 사이클",
                  "결과 다운로드",
                  "권한 매트릭스",
                  "화면 구성",
                  "일일 트래픽",
                  "조직 목표 관리",
                  "평가대상자 관리",
                  "역량평가 문항",
                  "등급 · 정원 관리",
                ],
              },
            ]}
          />
        }
        next={
          <FakeMenu
            items={[
              {
                group: "조직",
                rows: ["사용자 관리", "팀 관리", "데이터 업로드"],
              },
              {
                group: "평가 설계",
                rows: ["조직 목표 관리", "역량평가 문항", "등급 · 정원 관리"],
              },
              {
                group: "평가 운영",
                rows: ["평가대상자 관리", "결과 다운로드", "평가 사이클"],
              },
              {
                group: "시스템",
                rows: [
                  "권한 매트릭스",
                  "화면 구성",
                  "일일 트래픽",
                  "평가 템플릿",
                ],
              },
            ]}
          />
        }
      />

      {/* ── D-4 ─────────────────────────────────────────────── */}
      <Item
        id="d4"
        title="홈에 「지금 할 일」"
        why="로그인 직후 «내가 무엇을 해야 하는지»가 없어, 시즌마다 문의 전화를 받습니다."
        effort="1~2일 (사람마다 남은 일을 세는 셈은 이미 있습니다)"
        scope="홈 화면"
        now={
          <div className="grid grid-cols-2 gap-2">
            {["조직도", "직원정보 조회", "평가2", "온보딩"].map((t) => (
              <div
                key={t}
                className="rounded-lg border border-slate-200 bg-white px-3 py-4 text-center text-xs text-slate-600"
              >
                {t}
              </div>
            ))}
            <p className="col-span-2 text-[11px] break-keep text-status-critical">
              바로가기만 있고, 지금이 평가 시즌인지 · 내가 무엇을 안 했는지는
              말해 주지 않습니다.
            </p>
          </div>
        }
        next={
          <div className="flex flex-col gap-2">
            <div className="rounded-lg border border-brand-green/40 bg-white p-3">
              <p className="text-xs font-bold text-slate-900">
                지금 할 일{" "}
                <span className="ml-1 rounded bg-status-critical/10 px-1.5 py-0.5 text-[10px] font-medium text-status-critical">
                  2건
                </span>
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                {[
                  ["역량평가 자기평가", "10칸 중 4칸", "12/15까지"],
                  ["팀원 평가 (2명)", "한담당 · 계약담당", "12/20까지"],
                ].map(([t, sub, due]) => (
                  <div
                    key={t}
                    className="flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-critical" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-medium text-slate-800">
                        {t}
                      </span>
                      <span className="block text-[10px] text-slate-500">
                        {sub}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-400">
                      {due}
                    </span>
                  </div>
                ))}
                <div className="flex items-center gap-2 rounded-md border border-slate-100 px-2 py-1.5 opacity-60">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-green" />
                  <span className="text-[11px] text-slate-500">
                    목표 자기평가 — 끝냈습니다
                  </span>
                </div>
              </div>
            </div>
            <p className="text-[11px] break-keep text-slate-500">
              시즌이 아니면 이 카드는 뜨지 않습니다 — 평소 홈은 지금
              그대로입니다.
            </p>
          </div>
        }
      />

      {/* ── D-5 ─────────────────────────────────────────────── */}
      <Item
        id="d5"
        title="휴대폰에서 자기평가 끝내기"
        why="현장·영업 인원이 많은데, 지금 폼은 한 화면에 칸이 열 개라 폰에서 끝내기 어렵습니다."
        effort="2~3일 (목표 한 건씩 넘기는 걸음 + 큰 고르개)"
        scope="평가2 목표 편집 · 역량평가 입력"
        now={
          <div className="mx-auto w-[58%] rounded-xl border border-slate-300 bg-white p-2">
            <p className="text-[9px] font-bold text-slate-800">목표 수정</p>
            <div className="mt-1 flex flex-col gap-1">
              {[
                "상위 목표",
                "목표 구분",
                "목표 유형",
                "목표명",
                "Key Results",
                "가중치",
                "달성률",
                "본인 평가점수",
              ].map((l) => (
                <div key={l}>
                  <p className="text-[7px] text-slate-400">{l}</p>
                  <div className="h-3 rounded border border-slate-300" />
                </div>
              ))}
            </div>
            <p className="mt-1 text-[8px] break-keep text-status-critical">
              스크롤 세 번, 칸 여덟 개 — 폰에서는 중간에 포기합니다
            </p>
          </div>
        }
        next={
          <div className="mx-auto w-[58%] rounded-xl border border-brand-green/50 bg-white p-2">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-bold text-slate-800">
                자기평가 <span className="text-slate-400">2 / 5</span>
              </p>
              <span className="text-[8px] text-slate-400">건너뛰기</span>
            </div>
            <div className="mt-1 h-1 rounded-full bg-slate-200">
              <div className="h-1 w-2/5 rounded-full bg-brand-green" />
            </div>
            <p className="mt-2 text-[9px] font-medium break-keep text-slate-800">
              성과 중심 인사체계 개편
            </p>
            <p className="text-[8px] text-slate-400">가중치 30% · 하반기</p>
            <p className="mt-2 text-[8px] text-slate-500">달성률</p>
            <div className="mt-0.5 flex gap-1">
              {["0", "50", "80", "100", "110"].map((v) => (
                <span
                  key={v}
                  className={`flex-1 rounded-md border py-1 text-center text-[8px] ${
                    v === "100"
                      ? "border-brand-green bg-brand-green text-white"
                      : "border-slate-300 text-slate-600"
                  }`}
                >
                  {v}
                </span>
              ))}
            </div>
            <div className="mt-2 rounded-md bg-brand-green py-1.5 text-center text-[9px] font-medium text-white">
              다음 목표 →
            </div>
            <p className="mt-1 text-[8px] break-keep text-slate-500">
              한 화면에 목표 하나. 자주 쓰는 값은 눌러서 고릅니다.
            </p>
          </div>
        }
      />

      <p className="px-1 pb-4 text-xs break-keep text-slate-500">
        고르실 것만 알려 주세요 — 번호로 말씀하셔도 됩니다(예: 「D-1, D-3
        진행」). 고르지 않은 것은 그대로 둡니다.{" "}
        <Link
          href="/platform/evaluation2?phase=hrreport"
          className="text-brand-green-dark underline"
        >
          HR REPORT로 돌아가기
        </Link>
      </p>
    </div>
  );
}
