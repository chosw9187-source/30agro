"use client";

import { useState } from "react";
import { COMPETENCY_SCORES, competencyScaleOf } from "@/lib/competency";

/**
 * 역량평가 문항 한 묶음 — **영역 · 질문 · 1~10 두 줄**.
 *
 * 처음에는 사내 엑셀 그대로 네 칸 표(영역·질문·자기평가·팀장평가)였다. 종이에서는
 * 읽히는 모양인데 화면에서는 두 가지가 걸렸다.
 *
 *   ① 점수를 매기는 **기준이 되는 문장**(질문)이 가운데 칸에 눌려 두 줄로 접히고,
 *      좁은 화면에서는 표가 옆으로 굴러 아예 안 보였다.
 *   ② 점수가 드롭다운이라 한 칸에 두 번(펼치고 → 고르고) 누른다. 스무 칸이면
 *      마흔 번이다.
 *   ③ 핵심가치와 직무역량이 문항 수도 다섯씩 같고 표 모양도 같아서, 표제만 다른
 *      한 덩어리로 읽혔다.
 *
 * 그래서 문항을 표의 한 줄이 아니라 **한 칸**으로 두고 그 안에 영역 딱지 · 질문
 * 전문 · 점수 두 줄을 담는다. 질문은 줄이지 않는다. 점수는 라디오 열 칸이라 **한
 * 번만** 누르고, 고른 값의 뜻(「8 우수」)이 옆에 바로 뜬다. 묶음은 색으로 가른다 —
 * 핵심가치는 보라, 직무역량·리더십역량은 파랑. 왼쪽 색 막대 · 딱지 · 고른 점수의
 * 색을 맞춰 두면 «지금 어느 묶음을 적는 중인지»가 눈으로 먼저 들어온다.
 *
 * 값은 이 부품이 들고 있다 — 묶음 머리의 「자기 3/5」가 누르는 대로 따라 움직여야
 * 몇 칸 남았는지 세지 않아도 된다. 저장은 바깥 폼이 한 번에 한다(라디오 이름이
 * `self:<열쇠>` · `lead:<열쇠>`이므로 서버가 읽는 이름은 예전 고르개와 같다).
 * 아무것도 안 고른 칸은 폼에 실리지 않고, 서버는 그것을 «아직 안 적음»으로 읽는다.
 */

export type CompetencyRow = {
  key: string;
  area: string;
  question: string;
  self: number | null;
  lead: number | null;
};

type Tone = "core" | "job";

/** 묶음 색. 클래스 이름을 글자 그대로 적어 둔다 — 조합해 만들면 빌드가 못 찾는다. */
const TONE = {
  core: {
    bar: "bg-goal-4",
    chip: "bg-goal-4 text-white",
    tint: "bg-goal-4/5",
    no: "bg-goal-4/10 text-goal-4",
    pick: "border-goal-4 bg-goal-4 text-white",
    /** 남이 적은 칸 — 적혀 있다는 것만 보이고 «누를 수 있다»로는 안 보이게. */
    pickOff: "border-goal-4/40 bg-goal-4/15 text-goal-4",
  },
  job: {
    bar: "bg-goal-2",
    chip: "bg-goal-2 text-white",
    tint: "bg-goal-2/5",
    no: "bg-goal-2/10 text-goal-2",
    pick: "border-goal-2 bg-goal-2 text-white",
    pickOff: "border-goal-2/40 bg-goal-2/15 text-goal-2",
  },
} as const;

/** 점수 열 칸 한 줄. 라디오지만 보이는 것은 단추다. */
function ScoreRow({
  label,
  name,
  picked,
  enabled,
  tone,
  ariaLabel,
  onPick,
}: {
  label: string;
  name: string;
  picked: number | null;
  enabled: boolean;
  tone: Tone;
  ariaLabel: string;
  onPick: (score: number | null) => void;
}) {
  const t = TONE[tone];
  const row = picked == null ? null : competencyScaleOf(picked);
  return (
    <fieldset className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <legend className="sr-only">{ariaLabel}</legend>
      <span className="w-14 shrink-0 text-xs font-medium whitespace-nowrap text-slate-500">
        {label}
      </span>
      <span className="flex min-w-0 flex-1 gap-[3px]">
        {/* 낮은 쪽부터 — 눈금처럼 왼쪽이 1, 오른쪽이 10이다. */}
        {[...COMPETENCY_SCORES]
          .sort((a, b) => a - b)
          .map((score) => {
            const on = picked === score;
            return (
              <label
                key={score}
                className={`flex-1 cursor-pointer rounded-md border py-1.5 text-center text-xs tabular-nums transition-colors sm:py-1 ${
                  on
                    ? `font-bold ${enabled ? t.pick : t.pickOff}`
                    : enabled
                      ? "border-slate-200 bg-slate-100 text-slate-600 hover:border-slate-400 hover:bg-white"
                      : "border-slate-200 bg-slate-100 text-slate-400"
                } ${enabled ? "" : "cursor-not-allowed"}`}
              >
                <input
                  type="radio"
                  name={name}
                  value={score}
                  checked={on}
                  disabled={!enabled}
                  onChange={() => onPick(score)}
                  className="sr-only"
                />
                {score}
              </label>
            );
          })}
      </span>
      <span className="flex w-full items-center gap-2 text-xs whitespace-nowrap sm:w-32">
        {picked == null ? (
          <span className={enabled ? "text-status-critical" : "text-slate-400"}>
            {enabled ? "아직 안 골랐음" : "–"}
          </span>
        ) : (
          <>
            <span className="font-semibold text-slate-800">
              {picked}
              {row ? ` ${row.label}` : ""}
            </span>
            {enabled && (
              /* 잘못 누른 칸을 되돌릴 길 — 라디오는 스스로 풀리지 않는다. */
              <button
                type="button"
                onClick={() => onPick(null)}
                className="rounded border border-slate-200 px-1 text-[11px] text-slate-400 hover:border-slate-400 hover:text-slate-600"
              >
                지움
              </button>
            )}
          </>
        )}
      </span>
    </fieldset>
  );
}

export function CompetencyItemGroup({
  no,
  badge,
  subtitle,
  tone,
  rows,
  canSelf,
  canLead,
  emptyNote,
}: {
  /** 「1」·「2」 — 양식의 묶음 번호. */
  no: number;
  /** 「핵심가치」·「직무역량」·「리더십역량」. */
  badge: string;
  /** 「팀원용 · 전사 공통」처럼 그 묶음이 어디서 온 것인지. */
  subtitle: string;
  tone: Tone;
  rows: CompetencyRow[];
  canSelf: boolean;
  canLead: boolean;
  emptyNote: string;
}) {
  const t = TONE[tone];
  const [vals, setVals] = useState(
    () =>
      new Map(rows.map((r) => [r.key, { self: r.self, lead: r.lead }] as const)),
  );
  const pick = (key: string, who: "self" | "lead", score: number | null) =>
    setVals((prev) => {
      const next = new Map(prev);
      const cur = next.get(key) ?? { self: null, lead: null };
      next.set(key, { ...cur, [who]: score });
      return next;
    });

  const selfDone = [...vals.values()].filter((v) => v.self != null).length;
  const leadDone = [...vals.values()].filter((v) => v.lead != null).length;

  const count = (done: number) => (
    <b
      className={
        done === rows.length
          ? "font-semibold text-slate-900"
          : "font-semibold text-status-critical"
      }
    >
      {done}/{rows.length}
    </b>
  );

  return (
    <section className="flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <span className={`w-1.5 shrink-0 ${t.bar}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div
          className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 ${t.tint}`}
        >
          <h2
            className={`rounded px-2 py-0.5 text-xs font-bold whitespace-nowrap ${t.chip}`}
          >
            {no}. {badge}
          </h2>
          <span className="text-xs break-keep text-slate-600">{subtitle}</span>
          <span className="text-xs text-slate-400">{rows.length}문항</span>
          {rows.length > 0 && (
            <span className="ml-auto text-xs whitespace-nowrap text-slate-500">
              자기 {count(selfDone)} · 팀장 {count(leadDone)}
            </span>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="border-t border-slate-100 px-4 py-6 text-center text-sm break-keep text-slate-500">
            {emptyNote}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5 border-t border-slate-100 p-2">
            {rows.map((r, i) => {
              const v = vals.get(r.key) ?? { self: null, lead: null };
              return (
                <li
                  key={r.key}
                  className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-2.5"
                >
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`rounded px-1.5 text-[11px] font-bold tabular-nums ${t.no}`}
                    >
                      {i + 1}
                    </span>
                    <span className="text-sm font-bold break-keep text-slate-900">
                      {r.area}
                    </span>
                  </div>
                  {/* 질문은 줄이지 않는다 — 점수를 매기는 기준이 이 문장이다. */}
                  <p className="text-xs leading-relaxed break-keep text-slate-600">
                    {r.question}
                  </p>
                  <ScoreRow
                    label="자기평가"
                    name={`self:${r.key}`}
                    picked={v.self}
                    enabled={canSelf}
                    tone={tone}
                    ariaLabel={`${r.area} 자기평가`}
                    onPick={(s) => pick(r.key, "self", s)}
                  />
                  <ScoreRow
                    label="팀장평가"
                    name={`lead:${r.key}`}
                    picked={v.lead}
                    enabled={canLead}
                    tone={tone}
                    ariaLabel={`${r.area} 팀장평가`}
                    onPick={(s) => pick(r.key, "lead", s)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
