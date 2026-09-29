"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { PERSON_GRADE_CLASS, gradeOrder } from "@/lib/final-grade";

/**
 * 평가 진행 현황의 **점수 · 등급 상세표** — 정렬과 묶음을 이 자리에서 바꾼다.
 *
 * 처음에는 정렬을 주소(`?ssort=`)에 담아 서버가 다시 그렸다. 값은 맞았지만 누를
 * 때마다 화면이 **맨 위로 튀었다** — 표는 화면 한참 아래에 있어서, 「성과 낮은
 * 순」을 누르면 배너·대시보드·전사목표를 지나 다시 스크롤해 내려와야 정렬된 표를
 * 볼 수 있었다. 206명이 걸린 해에는 다시 그리는 동안 기다리기까지 했다.
 *
 * 그래서 줄은 서버가 계산해 넘기고(점수 · 등급은 결과지와 같은 함수에서 나온다),
 * **세우는 일만** 이 부품이 브라우저에서 한다. 누르면 그 자리에서 바로 바뀐다.
 *
 * 값은 다시 계산하지 않는다 — 등급은 운영책임 라인 안에서 이미 매겨진 것이고,
 * 여기서 순위를 다시 내면 보이는 사람만으로 등급이 매겨져 화면마다 달라진다.
 */

export type StatusTableRow = {
  id: string;
  name: string;
  /** 「담당」·「팀장」. */
  positionLabel: string;
  /** 팀 이름(없으면 본부). 이름 아래에 붙는다. */
  team: string;
  perf: number | null;
  comp: number | null;
  total: number | null;
  grade: string | null;
  /** 인사팀이 손으로 확정한 등급인가. */
  gradeFixed: boolean;
  /** 등급이 없을 때 그 자리에 적는 말 — 「평가 중」·「정원 미정」. */
  gradeNote: string;
  /** 「26 A · 25 B」 — 배포가 끝난 해만. */
  past: string;
  pastTitle: string;
  /** 남은 일. 있으면 이름 옆에 「진행 중」이 붙고 손을 올리면 이 말이 뜬다. */
  todo: string[];
  /** 묶음 이름. 묶지 않는 자리에서는 빈 문자열이다. */
  group: string;
  resultHref: string;
};

const SORTS = [
  { key: "total-desc", label: "종합 높은 순" },
  { key: "perf-desc", label: "성과 높은 순" },
  { key: "perf", label: "성과 낮은 순" },
  { key: "comp-desc", label: "역량 높은 순" },
  { key: "comp", label: "역량 낮은 순" },
  { key: "grade", label: "등급순 (S→C)" },
  { key: "name", label: "이름순" },
] as const;

export function StatusTable({
  rows,
  /** 「평가자」·「라인」 — 묶음 단추에 쓰는 말. 비면 묶지 않는다. */
  groupNoun,
  initialSort,
}: {
  rows: StatusTableRow[];
  groupNoun: string;
  initialSort?: string;
}) {
  const [sort, setSort] = useState(
    initialSort && /^[a-z]+(-desc)?$/.test(initialSort)
      ? initialSort
      : "total-desc",
  );
  const [grouped, setGrouped] = useState(true);
  const [sKey, sDir] = sort.split("-");
  const sDesc = sDir === "desc";
  const canGroup = groupNoun !== "";

  /** 같은 칸을 다시 누르면 방향이 뒤집힌다. */
  const flip = (key: string) =>
    setSort(sKey === key && !sDesc ? `${key}-desc` : key);

  const sortRows = (list: StatusTableRow[]) => {
    const key = (r: StatusTableRow): string | number | null => {
      switch (sKey) {
        case "name":
          return r.name;
        case "team":
          return r.team;
        case "perf":
          return r.perf;
        case "comp":
          return r.comp;
        case "grade":
          return gradeOrder(r.grade);
        default:
          return r.total;
      }
    };
    /* 값이 없는 사람은 늘 아래로 — 낮은 순으로 볼 때 «미입력»이 맨 위를 차지하면
       정작 읽으려던 낮은 점수가 화면 밖으로 밀린다. */
    return [...list].sort((a, b) => {
      const x = key(a);
      const y = key(b);
      if (x == null && y == null) return a.name.localeCompare(b.name);
      if (x == null) return 1;
      if (y == null) return -1;
      const n =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y));
      return (sDesc ? -n : n) || a.name.localeCompare(b.name);
    });
  };

  const groups = (() => {
    if (!canGroup || !grouped)
      return [{ label: "", rows: sortRows(rows), head: false }];
    const by = new Map<string, StatusTableRow[]>();
    for (const r of rows) by.set(r.group, [...(by.get(r.group) ?? []), r]);
    const keys = [...by.keys()].sort((a, b) => a.localeCompare(b));
    return keys.map((label) => ({
      label,
      rows: sortRows(by.get(label)!),
      head: keys.length > 1,
    }));
  })();

  const sortHead = (
    key: string,
    label: string,
    align: "left" | "right" = "left",
  ) => (
    <th
      className={`py-1.5 font-medium whitespace-nowrap ${
        align === "right" ? "px-1.5 text-right" : "px-2 text-left"
      }`}
    >
      <button
        type="button"
        onClick={() => flip(key)}
        className="cursor-pointer hover:text-slate-800 hover:underline"
      >
        {label}
        {sKey === key ? (sDesc ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );

  const scoreCell = (v: number | null, strong = false) => (
    <td
      className={`px-1.5 py-1.5 text-right tabular-nums ${
        v == null
          ? "text-slate-300"
          : strong
            ? "text-sm font-bold text-slate-900"
            : "text-slate-700"
      }`}
    >
      {v ?? "–"}
    </td>
  );

  return (
    <div className="min-w-0">
      {/* 자주 쓰는 정렬은 칸 머리를 찾지 않아도 되게 칩으로 둔다. */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] whitespace-nowrap text-slate-400">
          정렬
        </span>
        {SORTS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setSort(c.key)}
            className={`cursor-pointer rounded-full px-2.5 py-0.5 text-[11px] whitespace-nowrap transition-colors ${
              sort === c.key
                ? "bg-goal-4 font-semibold text-white"
                : "border border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {c.label}
          </button>
        ))}
        {canGroup && (
          <button
            type="button"
            onClick={() => setGrouped(!grouped)}
            className="ml-1 cursor-pointer rounded-full border border-slate-300 px-2.5 py-0.5 text-[11px] whitespace-nowrap text-slate-600 hover:bg-slate-50"
          >
            {grouped ? `${groupNoun} 묶음 끄기` : `${groupNoun}별로 묶기`}
          </button>
        )}
      </div>
      <div className="min-w-0 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="bg-slate-100 text-xs text-slate-600">
            <tr>
              {sortHead("name", "이름")}
              {sortHead("perf", "성과", "right")}
              {sortHead("comp", "역량", "right")}
              {sortHead("total", "종합", "right")}
              {sortHead("grade", "등급")}
              <th
                className="px-2 py-1.5 text-left font-medium whitespace-nowrap"
                title="지난 해 등급 — 결과 배포가 끝난 해만 남습니다"
              >
                지난
              </th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.label || "__flat__"}>
                {g.head && (
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td
                      colSpan={7}
                      className="px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-slate-700"
                    >
                      {g.label}
                      <span className="ml-2 font-normal text-slate-400">
                        {g.rows.length}명
                      </span>
                    </td>
                  </tr>
                )}
                {g.rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-slate-100 hover:bg-slate-50/70"
                  >
                    {/* 소속은 이름 아래에 붙인다 — 칸으로 두면 표가 화면 밖으로
                        밀려 오른쪽 등급이 잘린다. */}
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span className="text-sm font-medium text-slate-900">
                        {r.name}
                      </span>
                      <span className="ml-1 text-[11px] text-slate-400">
                        {r.positionLabel}
                      </span>
                      <span className="block text-[11px] text-slate-400">
                        {r.team}
                        {r.todo.length > 0 && (
                          <span
                            className="ml-1.5 rounded bg-slate-100 px-1 text-[10px] whitespace-nowrap text-slate-500"
                            title={r.todo.join(" · ")}
                          >
                            진행 중
                          </span>
                        )}
                      </span>
                    </td>
                    {scoreCell(r.perf)}
                    {scoreCell(r.comp)}
                    {scoreCell(r.total, true)}
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {r.grade ? (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                              (PERSON_GRADE_CLASS as Record<string, string>)[
                                r.grade
                              ] ?? "bg-slate-500 text-white"
                            }`}
                          >
                            {r.grade}
                          </span>
                          {r.gradeFixed && (
                            <span className="text-[10px] text-slate-400">
                              확정
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-300">
                          {r.gradeNote}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {r.past ? (
                        <span
                          className="text-[11px] whitespace-nowrap text-slate-500"
                          title={r.pastTitle}
                        >
                          {r.past}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-300">–</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      <Link
                        href={r.resultHref}
                        className="rounded-md border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-white"
                      >
                        결과
                      </Link>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] break-keep text-slate-400">
        성과 · 역량 · 종합은 결과지와 같은 값입니다. 등급은 운영책임 라인 안에서
        정원표대로 매긴 값이라, 인사팀이 확정하거나 결과를 배포하기 전에는 바뀔 수
        있습니다. 「지난」은 배포가 끝난 해의 등급입니다.
        {canGroup &&
          grouped &&
          " 묶어 놓으면 정렬이 묶음 안에서만 돕니다 — 전체를 한 줄로 세우려면 묶음을 끄세요."}
      </p>
    </div>
  );
}
