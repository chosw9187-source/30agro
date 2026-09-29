import Link from "next/link";

/**
 * **인사평가 디자인 미리보기** — 고치기 전에 «지금»과 «바꾼 뒤»를 나란히 놓고 고르는 자리.
 *
 * 화면을 먼저 바꿔 놓고 물으면, 마음에 안 들 때 되돌리는 값이 크고 그사이 쓰던
 * 사람이 혼란스럽다. 그래서 여기서는 **아무것도 저장하지 않는다** — 실제 화면은
 * 그대로 두고, 그림만 그려 둔 방이다. 고른 것만 실제 화면에 옮긴다.
 *
 * 여기 담는 것은 **인사평가 화면뿐**이다(목표 목록 · 역량평가 · 결과지). 다른 모듈의
 * 디자인은 이 방에서 다루지 않는다.
 *
 * 그려진 것은 진짜 부품이 아니라 «그림»이다. 일부러 그렇게 둔다 — 진짜 부품을
 * 끌어다 쓰면 이 화면을 손볼 때마다 실제 화면이 흔들린다.
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
  where,
  title,
  why,
  effort,
  now,
  next,
}: {
  id: string;
  where: string;
  title: string;
  why: string;
  effort: string;
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
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-slate-600">
          {where}
        </span>
        <span className="text-xs break-keep text-slate-500">{why}</span>
      </div>
      <div className="grid gap-3 p-4 lg:grid-cols-2">
        <Pane kind="now">{now}</Pane>
        <Pane kind="next">{next}</Pane>
      </div>
      <p className="border-t border-slate-100 px-4 py-2 text-[11px] break-keep text-slate-500">
        <b className="font-semibold text-slate-700">작업량</b> {effort}
      </p>
    </section>
  );
}

/* ── 그림 부품 — 실제 부품이 아니라 이 화면에서만 쓰는 모형 ─────────── */

/** 지금의 목표 한 줄 — 제목줄 + 막대줄로 두 줄을 먹는다. */
function NowGoalRow({
  title,
  weight,
  progress,
  done,
}: {
  title: string;
  weight: number;
  progress: number;
  done?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-slate-400">▸</span>
        <span className="text-[11px] font-medium text-slate-800">{title}</span>
        {done && (
          <span className="rounded bg-brand-green-light px-1 py-px text-[9px] text-brand-green-dark">
            완료
          </span>
        )}
        <span className="text-[9px] font-medium text-status-critical">
          상위 목표 미연결
        </span>
        <span className="text-[9px] text-slate-500">가중치 {weight}%</span>
        <span className="ml-auto text-[11px] font-bold text-slate-900">
          {progress}%
        </span>
      </div>
      <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <span
          className="block h-full rounded-full bg-brand-green"
          style={{ width: `${progress}%` }}
        />
      </span>
    </div>
  );
}

/** 바꾼 뒤의 목표 한 줄 — 표의 한 행. */
function NextGoalRow({
  title,
  weight,
  progress,
  score,
  max,
}: {
  title: string;
  weight: number;
  progress: number;
  score: number | null;
  max: number;
}) {
  return (
    <tr className="border-t border-slate-100">
      <td className="py-1 pr-2 text-[11px] font-medium whitespace-nowrap text-slate-800">
        {title}
      </td>
      <td className="py-1 pr-2 text-right text-[11px] tabular-nums text-slate-500">
        {weight}%
      </td>
      <td className="py-1 pr-2">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-10 overflow-hidden rounded-full bg-slate-200">
            <span
              className="block h-full rounded-full bg-brand-green"
              style={{ width: `${progress}%` }}
            />
          </span>
          <span className="text-[10px] tabular-nums text-slate-600">
            {progress}%
          </span>
        </span>
      </td>
      <td className="py-1 text-right text-[11px] tabular-nums whitespace-nowrap">
        {score == null ? (
          <span className="text-status-critical">미입력</span>
        ) : (
          <>
            <b className="font-bold text-slate-900">{score}</b>
            <span className="text-slate-400"> / {max}</span>
          </>
        )}
      </td>
    </tr>
  );
}

/* ── E-4 전용 그림 부품 — 역량 문항 한 칸 ────────────────────────── */

/**
 * 묶음마다 «색 한 가지»를 정해 둔다. 핵심가치와 직무역량은 문항 수도 같고 표
 * 모양도 같아서, 표제만 다르면 스쳐 읽을 때 한 덩어리로 보인다. 왼쪽 색 막대 ·
 * 딱지 · 고른 점수의 색을 묶음마다 다르게 두면 «지금 어느 묶음을 적는 중인지»가
 * 눈으로 먼저 들어온다.
 */
const COMPETENCY_GROUP_STYLE = {
  core: {
    bar: "bg-goal-4",
    chip: "bg-goal-4 text-white",
    tint: "bg-goal-4/5",
    no: "bg-goal-4/10 text-goal-4",
    pick: "bg-goal-4 text-white",
  },
  job: {
    bar: "bg-goal-2",
    chip: "bg-goal-2 text-white",
    tint: "bg-goal-2/5",
    no: "bg-goal-2/10 text-goal-2",
    pick: "bg-goal-2 text-white",
  },
} as const;

type CompetencyGroupKind = keyof typeof COMPETENCY_GROUP_STYLE;

/** 1~10 한 줄. 고른 칸만 묶음 색으로 찬다. 아직 안 고른 줄은 붉게 남는다. */
function ScoreButtons({
  label,
  picked,
  meaning,
  kind,
}: {
  label: string;
  picked: number | null;
  meaning: string;
  kind: CompetencyGroupKind;
}) {
  const style = COMPETENCY_GROUP_STYLE[kind];
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="w-12 shrink-0 text-[10px] font-medium whitespace-nowrap text-slate-500">
        {label}
      </span>
      <span className="flex min-w-0 flex-1 gap-[2px]">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
          <span
            key={n}
            className={`flex-1 rounded py-[3px] text-center text-[10px] tabular-nums ${
              n === picked
                ? `font-bold ${style.pick}`
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {n}
          </span>
        ))}
      </span>
      <span className="w-full text-[9px] break-keep text-slate-500 sm:w-auto sm:shrink-0">
        {picked == null ? (
          <b className="font-semibold text-status-critical">아직 안 골랐음</b>
        ) : (
          meaning
        )}
      </span>
    </div>
  );
}

/** 문항 한 칸 — 영역 딱지 + 질문 전문 + 점수 두 줄. */
function NextCompetencyItem({
  no,
  area,
  question,
  self,
  selfMeaning,
  lead,
  leadMeaning,
  kind,
}: {
  no: number;
  area: string;
  question: string;
  self: number | null;
  selfMeaning: string;
  lead: number | null;
  leadMeaning: string;
  kind: CompetencyGroupKind;
}) {
  const style = COMPETENCY_GROUP_STYLE[kind];
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-2">
      <div className="flex items-baseline gap-1.5">
        <span
          className={`rounded px-1 text-[9px] font-bold tabular-nums ${style.no}`}
        >
          {no}
        </span>
        <span className="text-[11px] font-bold break-keep text-slate-900">
          {area}
        </span>
      </div>
      {/* 질문은 줄이지 않는다 — 점수를 매기는 기준이 이 문장이다. */}
      <p className="text-[10px] leading-relaxed break-keep text-slate-600">
        {question}
      </p>
      <ScoreButtons
        label="자기평가"
        picked={self}
        meaning={selfMeaning}
        kind={kind}
      />
      <ScoreButtons
        label="팀장평가"
        picked={lead}
        meaning={leadMeaning}
        kind={kind}
      />
    </div>
  );
}

/** 묶음 한 덩어리 — 머리에 색 막대와 딱지, 그리고 그 묶음만의 남은 칸. */
function NextCompetencyGroup({
  kind,
  badge,
  name,
  items,
  selfDone,
  leadDone,
  children,
}: {
  kind: CompetencyGroupKind;
  badge: string;
  name: string;
  items: number;
  selfDone: number;
  leadDone: number;
  children: React.ReactNode;
}) {
  const style = COMPETENCY_GROUP_STYLE[kind];
  return (
    <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white">
      <span className={`w-1.5 shrink-0 ${style.bar}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div
          className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1.5 ${style.tint}`}
        >
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${style.chip}`}
          >
            {badge}
          </span>
          <span className="text-[10px] break-keep text-slate-600">{name}</span>
          <span className="text-[10px] text-slate-400">{items}문항</span>
          <span className="ml-auto text-[10px] whitespace-nowrap text-slate-500">
            자기{" "}
            <b
              className={
                selfDone === items
                  ? "font-semibold text-slate-900"
                  : "font-semibold text-status-critical"
              }
            >
              {selfDone}/{items}
            </b>{" "}
            · 팀장{" "}
            <b
              className={
                leadDone === items
                  ? "font-semibold text-slate-900"
                  : "font-semibold text-status-critical"
              }
            >
              {leadDone}/{items}
            </b>
          </span>
        </div>
        <div className="flex flex-col gap-1.5 p-2">{children}</div>
      </div>
    </div>
  );
}

export default function DesignPreviewPage() {
  const items = [
    ["e1", "E-1 담당자별 묶기"],
    ["e2", "E-2 목록을 표로"],
    ["e3", "E-3 반복 경고 정리"],
    ["e4", "E-4 역량 문항 칸"],
    ["e5", "E-5 결과지 인쇄"],
    ["e6", "E-6 모바일 자기평가"],
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className={CARD}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
          <h1 className="text-lg font-bold text-slate-900">
            인사평가 디자인 미리보기
          </h1>
          <span className="text-xs break-keep text-slate-500">
            인사평가 화면만 다룹니다 · 「지금」과 「바꾼 뒤」를 나란히 봅니다 — 이
            화면은 그림일 뿐, 아무것도 저장하지 않습니다.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2">
          {items.map(([id, label]) => (
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

      {/* ── E-1 ─────────────────────────────────────────────── */}
      <Item
        id="e1"
        where="성과평가 · 개인목표"
        title="누구 목표인지가 안 보입니다"
        why="팀장·인사팀 화면인데 목록에 사람 이름이 없어, 마흔 줄에서 팀원 것을 눈으로 골라내야 합니다."
        effort="1일 (담당자별 묶음 + 요약 줄)"
        now={
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] text-slate-400">
              개인목표 40건 · 평균 달성률 91%
            </p>
            <NowGoalRow title="목표 A" weight={30} progress={50} />
            <NowGoalRow title="두 상1" weight={30} progress={100} done />
            <NowGoalRow title="강 상1" weight={30} progress={100} done />
            <NowGoalRow title="황 상1" weight={30} progress={100} done />
            <p className="text-[10px] break-keep text-status-critical">
              이름이 없어 「목표 A」가 누구 것인지 알 수 없습니다 — 네 사람의
              목표가 뒤섞여 있습니다.
            </p>
          </div>
        }
        next={
          <div className="flex flex-col gap-2">
            {[
              [
                "한담당 담당",
                "영업고객관리팀",
                "5건 · 가중치 100%",
                "평가 5/5",
              ],
              ["두담당 담당", "제품등록팀", "5건 · 가중치 100%", "평가 0/5"],
            ].map(([name, team, sum, eval_], i) => (
              <div
                key={name}
                className="overflow-hidden rounded-lg border border-slate-200 bg-white"
              >
                <div className="flex flex-wrap items-center gap-2 bg-slate-50 px-2 py-1.5">
                  <span className="text-[11px] font-bold text-slate-800">
                    {name}
                  </span>
                  <span className="text-[10px] text-slate-500">{team}</span>
                  <span className="text-[10px] text-slate-500">{sum}</span>
                  <span
                    className={`ml-auto rounded px-1.5 py-px text-[10px] font-medium ${
                      i === 0
                        ? "bg-brand-green-light text-brand-green-dark"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {eval_}
                  </span>
                </div>
                {i === 0 && (
                  <div className="px-2 py-1">
                    <table className="w-full border-collapse">
                      <tbody>
                        <NextGoalRow
                          title="신규 과제 도출"
                          weight={30}
                          progress={100}
                          score={30}
                          max={33}
                        />
                        <NextGoalRow
                          title="인사체계 개편"
                          weight={20}
                          progress={100}
                          score={18}
                          max={22}
                        />
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            <p className="text-[10px] break-keep text-slate-500">
              사람마다 접힙니다. 머리줄만 봐도 «누가 몇 건, 가중치 합은
              100%인지, 평가가 몇 건 남았는지»가 읽힙니다.
            </p>
          </div>
        }
      />

      {/* ── E-2 ─────────────────────────────────────────────── */}
      <Item
        id="e2"
        where="성과평가 · 개인목표"
        title="한 줄이 두 줄을 먹습니다"
        why="줄마다 막대가 한 줄을 통째로 쓰고, 평가 단계인데 점수는 펼쳐야 보입니다. 마흔 건이면 화면 세 장입니다."
        effort="1~2일 (목록을 표로 + 점수 칸)"
        now={
          <div className="flex flex-col gap-1.5">
            <NowGoalRow title="목표 A" weight={30} progress={50} />
            <NowGoalRow title="목표 B" weight={20} progress={10} />
            <NowGoalRow title="목표 C" weight={20} progress={60} />
            <p className="text-[10px] break-keep text-status-critical">
              점수가 없습니다 — 「50%」가 몇 점인지 보려면 줄을 하나씩 펼쳐야
              합니다.
            </p>
          </div>
        }
        next={
          <div className="flex flex-col gap-2">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white px-2 py-1">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left text-[9px] text-slate-400">
                    <th className="py-0.5 pr-2 font-medium">목표</th>
                    <th className="py-0.5 pr-2 text-right font-medium">
                      가중치
                    </th>
                    <th className="py-0.5 pr-2 font-medium">달성률</th>
                    <th className="py-0.5 text-right font-medium">점수</th>
                  </tr>
                </thead>
                <tbody>
                  <NextGoalRow
                    title="신규 과제 도출"
                    weight={30}
                    progress={50}
                    score={15}
                    max={33}
                  />
                  <NextGoalRow
                    title="인사체계 개편"
                    weight={20}
                    progress={10}
                    score={null}
                    max={22}
                  />
                  <NextGoalRow
                    title="프로세스 개선"
                    weight={20}
                    progress={60}
                    score={12}
                    max={22}
                  />
                </tbody>
              </table>
            </div>
            <p className="text-[10px] break-keep text-slate-500">
              한 줄에 한 행. 같은 자리에서 <b>점수 · 만점 · 미입력</b>까지
              읽히고, 높이는 3분의 1로 줄어듭니다. 줄을 누르면 지금처럼
              펼쳐집니다.
            </p>
          </div>
        }
      />

      {/* ── E-3 ─────────────────────────────────────────────── */}
      <Item
        id="e3"
        where="성과평가 · 개인목표"
        title="같은 경고가 마흔 번"
        why="「상위 목표 미연결」이 줄마다 붉게 반복되면 경고가 아니라 배경이 됩니다."
        effort="반나절 (묶음 머리에 한 줄 + 한 번에 지정)"
        now={
          <div className="flex flex-col gap-1.5">
            <NowGoalRow title="목표 A" weight={30} progress={50} />
            <NowGoalRow title="목표 B" weight={20} progress={10} />
            <NowGoalRow title="목표 C" weight={20} progress={60} />
            <p className="text-[10px] break-keep text-status-critical">
              붉은 글씨가 마흔 줄이면 정작 봐야 할 「미입력」이 묻힙니다.
            </p>
          </div>
        }
        next={
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5">
              <span className="text-[11px] font-medium break-keep text-amber-900">
                상위 목표가 없는 목표 40건 — 전사 달성률에 반영되지 않습니다
              </span>
              <span className="ml-auto rounded-md bg-white px-2 py-1 text-[10px] font-medium whitespace-nowrap text-amber-900">
                한 번에 지정
              </span>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white px-2 py-1">
              <table className="w-full border-collapse">
                <tbody>
                  <NextGoalRow
                    title="신규 과제 도출"
                    weight={30}
                    progress={50}
                    score={15}
                    max={33}
                  />
                  <NextGoalRow
                    title="인사체계 개편"
                    weight={20}
                    progress={10}
                    score={null}
                    max={22}
                  />
                </tbody>
              </table>
            </div>
            <p className="text-[10px] break-keep text-slate-500">
              경고는 묶음 머리에 한 번만. 줄에서는 <b>미입력</b>처럼 그 줄에만
              해당하는 것만 붉게 둡니다.
            </p>
          </div>
        }
      />

      {/* ── E-4 ─────────────────────────────────────────────── */}
      <Item
        id="e4"
        where="역량평가"
        title="문항 한 칸을 한 번 눌러 매깁니다"
        why="지금은 질문이 표 한 칸에 눌려 있고 점수는 드롭다운이라 한 칸에 두 번씩 누릅니다. 핵심가치와 직무역량도 표제만 다르고 모양이 같아 한 덩어리로 보입니다."
        effort="2일 (문항 칸 + 점수 고르개 + 묶음 색 구분)"
        now={
          <div className="flex flex-col gap-2">
            <p className="text-[10px] text-slate-400">
              자기평가 평균 <b className="text-slate-700">10</b> 5/5 · 팀장평가
              평균 <b className="text-slate-700">8</b> 3/5
            </p>
            {/* 두 묶음이 표제만 다르고 나머지가 똑같다 — 이게 지금의 문제다. */}
            {[
              {
                heading: "1. 핵심가치 · 팀원용",
                area: "문제해결",
                question:
                  "문제에 직면했을 때 원인과 대책을 도출할 수 있으며, 주어진…",
              },
              {
                heading: "2. 직무역량 · 인사팀",
                area: "인사정보 보안",
                question:
                  "인사 정보의 보안 및 개인정보 보호 정책과 절차를 엄격하게…",
              },
            ].map((g) => (
              <div
                key={g.heading}
                className="overflow-hidden rounded-lg border border-slate-200 bg-white"
              >
                <p className="px-2 py-1 text-[10px] font-bold text-slate-900">
                  {g.heading}{" "}
                  <span className="font-normal text-slate-400">5문항</span>
                </p>
                <table className="w-full border-collapse">
                  <thead className="bg-slate-100 text-slate-500">
                    <tr className="text-left text-[9px]">
                      <th className="px-1 py-0.5 font-semibold">영역</th>
                      <th className="px-1 py-0.5 font-semibold">질문</th>
                      <th className="px-1 py-0.5 font-semibold">자기</th>
                      <th className="px-1 py-0.5 font-semibold">팀장</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-slate-100">
                      <td className="w-14 px-1 py-1 text-[9px] font-medium text-slate-800">
                        {g.area}
                      </td>
                      <td className="px-1 py-1 text-[9px] text-slate-500">
                        <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
                          {g.question}
                        </span>
                      </td>
                      <td className="w-12 px-1 py-1">
                        <span className="flex items-center justify-between rounded border border-slate-300 px-1 py-px text-[9px] text-slate-700">
                          10 <span className="text-slate-400">▾</span>
                        </span>
                      </td>
                      <td className="w-12 px-1 py-1">
                        <span className="flex items-center justify-between rounded border border-slate-300 px-1 py-px text-[9px] text-slate-400">
                          – <span>▾</span>
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
            <p className="text-[10px] break-keep text-status-critical">
              질문이 한 줄로 잘려 기준을 못 읽고, 점수는 눌러서 펼친 뒤 다시
              골라야 합니다. 두 묶음은 표제만 다릅니다.
            </p>
          </div>
        }
        next={
          <div className="flex flex-col gap-2">
            <NextCompetencyGroup
              kind="core"
              badge="핵심가치"
              name="팀원용 · 전사 공통"
              items={5}
              selfDone={5}
              leadDone={3}
            >
              <NextCompetencyItem
                kind="core"
                no={1}
                area="문제해결"
                question="문제에 직면했을 때 원인과 대책을 도출할 수 있으며, 주어진 도구와 자원을 활용하여, 부여된 과업의 누락, 동일문제 재발을 방지하는가?"
                self={10}
                selfMeaning="10 탁월"
                lead={8}
                leadMeaning="8 우수"
              />
              <NextCompetencyItem
                kind="core"
                no={2}
                area="커뮤니케이션"
                question="업무 수행에 필수적인 정보를 사전 공유하며, 중간 보고 등 업무관련자와 적시에 피드백을 주고받아, 차질없이 업무를 진행하는가?"
                self={8}
                selfMeaning="8 우수"
                lead={null}
                leadMeaning=""
              />
            </NextCompetencyGroup>

            <NextCompetencyGroup
              kind="job"
              badge="직무역량"
              name="인사팀 · 직무마다 다름"
              items={5}
              selfDone={5}
              leadDone={5}
            >
              <NextCompetencyItem
                kind="job"
                no={1}
                area="인사정보 보안 및 개인정보보호"
                question="인사 정보의 보안 및 개인정보 보호 정책과 절차를 엄격하게 준수하고 유지하는가?"
                self={10}
                selfMeaning="10 탁월"
                lead={9}
                leadMeaning="9 탁월"
              />
            </NextCompetencyGroup>

            <p className="text-[10px] break-keep text-slate-500">
              문항마다 <b>영역</b>과 <b>질문 전문</b>을 그대로 두고, 점수는 1~10
              을 한 번만 누릅니다. 핵심가치는{" "}
              <b className="text-goal-4">보라</b>, 직무역량은{" "}
              <b className="text-goal-2">파랑</b> — 색 막대와 딱지로 갈라 두어
              어느 묶음을 적는 중인지 바로 보입니다. 안 고른 줄은 붉게 남고,
              묶음 머리에 그 묶음만의 <b>남은 칸</b>이 적힙니다.
            </p>
          </div>
        }
      />

      {/* ── E-5 ─────────────────────────────────────────────── */}
      <Item
        id="e5"
        where="평가결과"
        title="결과지를 종이로 낼 수 없습니다"
        why="면담 때 출력하거나 PDF로 보관해야 하는데, 지금 인쇄하면 메뉴와 단추까지 같이 찍힙니다."
        effort="반나절 (인쇄 전용 스타일 + 「인쇄」 단추)"
        now={
          <div className="flex gap-1">
            <div className="w-1/4 rounded bg-brand-green px-1 py-2">
              <p className="text-[8px] text-white/80">홈</p>
              <p className="text-[8px] text-white/80">조직도</p>
              <p className="text-[8px] text-white/80">인사평가</p>
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

      {/* ── E-6 ─────────────────────────────────────────────── */}
      <Item
        id="e6"
        where="성과평가 · 역량평가"
        title="휴대폰에서 자기평가 끝내기"
        why="현장·영업 인원이 많은데, 지금 폼은 한 화면에 칸이 여덟 개라 폰에서 끝내기 어렵습니다."
        effort="2~3일 (목표 한 건씩 넘기는 걸음 + 큰 고르개)"
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
        고르실 것만 알려 주세요 — 번호로 말씀하셔도 됩니다(예: 「E-1, E-2
        진행」). 고르지 않은 것은 그대로 둡니다.{" "}
        <Link
          href="/platform/evaluation2?phase=hrreport"
          className="text-brand-green-dark underline"
        >
          인사평가로 돌아가기
        </Link>
      </p>
    </div>
  );
}
