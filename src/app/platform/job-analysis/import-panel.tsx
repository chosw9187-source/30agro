"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import {
  importJobTasks,
  parseJobAnalysisWorkbook,
  seedJobTasksFromJobDescriptions,
  type ImportResult,
} from "./actions";
import {
  JOB_TASK_FIELDS,
  buildRows,
  detectHeaderRow,
  guessMapping,
  normalizeName,
  type ColumnMapping,
  type JobTaskField,
} from "@/lib/job-analysis-fields";

type Team = { id: string; name: string };

/** 컬럼 선택지에 붙일 엑셀식 열 이름(A, B, ..., AA). */
function columnLabel(index: number): string {
  let label = "";
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

const PREVIEW_ROWS = 8;

export function ImportPanel({ teams }: { teams: Team[] }) {
  const [parsed, parseAction, isParsing] = useActionState(parseJobAnalysisWorkbook, undefined);

  const [lastParsed, setLastParsed] = useState(parsed);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [teamOverrides, setTeamOverrides] = useState<Record<string, string>>({});
  const [fallbackTeamId, setFallbackTeamId] = useState("");
  const [mode, setMode] = useState<"replace" | "append">("replace");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isSaving, startSaving] = useTransition();

  const sheets = parsed?.ok ? parsed.sheets : [];

  // 새 파일을 올리면 매핑을 처음부터 다시 추측한다 (렌더 중 상태 조정 패턴).
  if (parsed !== lastParsed) {
    setLastParsed(parsed);
    setResult(null);
    setSheetIndex(0);
    setTeamOverrides({});
    setFallbackTeamId("");
    if (sheets.length > 0) {
      const row = detectHeaderRow(sheets[0].rows);
      setHeaderRow(row);
      setMapping(guessMapping(sheets[0].rows[row] ?? []));
    } else {
      setHeaderRow(0);
      setMapping({});
    }
  }

  const grid = sheets[sheetIndex] ?? null;
  const headers = grid?.rows[headerRow] ?? [];

  const built = useMemo(
    () => (grid ? buildRows(grid, headerRow, mapping) : null),
    [grid, headerRow, mapping]
  );

  /** 엑셀에 등장한 팀명 목록(정규화 키 → 원문). */
  const excelTeamNames = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of built?.rows ?? []) {
      if (row.teamName) seen.set(normalizeName(row.teamName), row.teamName);
    }
    return [...seen].map(([key, label]) => ({ key, label }));
  }, [built]);

  const teamIdByNormalizedName = useMemo(
    () => new Map(teams.map((t) => [normalizeName(t.name), t.id])),
    [teams]
  );

  /** 자동 매칭 결과에 관리자의 수동 선택을 덮어쓴 최종 팀 배정. */
  const resolvedTeamByName = useMemo(() => {
    const out: Record<string, string> = {};
    for (const { key } of excelTeamNames) {
      const resolved = teamOverrides[key] ?? teamIdByNormalizedName.get(key) ?? "";
      if (resolved) out[key] = resolved;
    }
    return out;
  }, [excelTeamNames, teamOverrides, teamIdByNormalizedName]);

  const unmatchedTeamNames = excelTeamNames.filter((t) => !resolvedTeamByName[t.key]);
  const hasNameColumn = mapping.name !== undefined;
  const rowCount = built?.rows.length ?? 0;
  const needsFallback = excelTeamNames.length === 0 || unmatchedTeamNames.length > 0;
  const canSave =
    hasNameColumn && rowCount > 0 && (Object.keys(resolvedTeamByName).length > 0 || !!fallbackTeamId);

  function changeSheet(index: number) {
    setSheetIndex(index);
    const row = detectHeaderRow(sheets[index].rows);
    setHeaderRow(row);
    setMapping(guessMapping(sheets[index].rows[row] ?? []));
    setTeamOverrides({});
    setResult(null);
  }

  function changeHeaderRow(row: number) {
    setHeaderRow(row);
    setMapping(guessMapping(sheets[sheetIndex].rows[row] ?? []));
    setResult(null);
  }

  function changeMapping(field: JobTaskField, value: string) {
    setMapping((prev) => {
      const next = { ...prev };
      if (value === "") delete next[field];
      else next[field] = Number(value);
      return next;
    });
    setResult(null);
  }

  function save() {
    if (!built) return;
    startSaving(async () => {
      setResult(
        await importJobTasks({
          rows: built.rows,
          teamByName: resolvedTeamByName,
          fallbackTeamId: fallbackTeamId || null,
          mode,
        })
      );
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-lg font-semibold">단위업무 불러오기</h2>
        <p className="mt-1 text-sm text-slate-600">
          직무기술서 엑셀을 올리면 컬럼을 직접 지정해서 단위업무로 가져옵니다.
          양식이 팀마다 달라도 됩니다.
        </p>
      </div>

      <SeedFromJobDescriptions />

      <form action={parseAction} className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        <input
          type="file"
          name="file"
          accept=".xlsx,.xls"
          required
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={isParsing}
          className="rounded bg-brand-green px-4 py-2 text-sm text-white hover:bg-brand-green-dark disabled:opacity-50"
        >
          {isParsing ? "읽는 중..." : "엑셀 읽기"}
        </button>
      </form>

      {parsed && !parsed.ok && <p className="text-sm text-red-600">{parsed.error}</p>}

      {parsed?.ok && grid && (
        <div className="flex flex-col gap-4 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-600">
            <strong>{parsed.fileName}</strong> · 시트 {sheets.length}개
            {grid.truncated && " · 행이 많아 앞부분만 읽었습니다"}
          </p>

          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-500">시트</span>
              <select
                value={sheetIndex}
                onChange={(e) => changeSheet(Number(e.target.value))}
                className="rounded border border-slate-300 px-2 py-1"
              >
                {sheets.map((s, i) => (
                  <option key={s.name} value={i}>
                    {s.name} ({s.rows.length}행)
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-500">헤더 행</span>
              <select
                value={headerRow}
                onChange={(e) => changeHeaderRow(Number(e.target.value))}
                className="max-w-md rounded border border-slate-300 px-2 py-1"
              >
                {grid.rows.slice(0, 15).map((row, i) => (
                  <option key={i} value={i}>
                    {i + 1}행: {row.filter(Boolean).slice(0, 6).join(" | ").slice(0, 60) || "(빈 행)"}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">컬럼 지정</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {JOB_TASK_FIELDS.map((field) => (
                <label key={field.key} className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-500">
                    {field.label}
                    {field.required && <span className="text-red-500"> *</span>}
                  </span>
                  <select
                    value={mapping[field.key] ?? ""}
                    onChange={(e) => changeMapping(field.key, e.target.value)}
                    className="rounded border border-slate-300 px-2 py-1"
                  >
                    <option value="">사용 안 함</option>
                    {headers.map((header, col) => (
                      <option key={col} value={col}>
                        {columnLabel(col)} · {header || "(빈 헤더)"}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {!hasNameColumn && (
              <p className="mt-2 text-sm text-red-600">
                단위업무명 컬럼을 지정해야 가져올 수 있습니다.
              </p>
            )}
          </div>

          {built && (
            <p className="text-sm text-slate-600">
              가져올 행 <strong>{built.rows.length}건</strong>
              {built.skippedCount > 0 && ` · 단위업무명이 비어 건너뛴 행 ${built.skippedCount}건`}
            </p>
          )}

          {excelTeamNames.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">
                팀 연결 ({excelTeamNames.length - unmatchedTeamNames.length}/{excelTeamNames.length} 자동 매칭)
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {excelTeamNames.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <span className="w-32 shrink-0 truncate text-slate-600" title={label}>
                      {label}
                    </span>
                    <select
                      value={teamOverrides[key] ?? teamIdByNormalizedName.get(key) ?? ""}
                      onChange={(e) =>
                        setTeamOverrides((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className={`flex-1 rounded border px-2 py-1 ${
                        resolvedTeamByName[key] ? "border-slate-300" : "border-amber-400"
                      }`}
                    >
                      <option value="">연결 안 함</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          )}

          {needsFallback && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-500">
                {excelTeamNames.length === 0
                  ? "이 파일을 넣을 팀 (팀 컬럼을 지정하지 않았습니다)"
                  : `연결 안 된 팀명의 행을 넣을 팀 (미선택 시 그 행은 건너뜁니다)`}
              </span>
              <select
                value={fallbackTeamId}
                onChange={(e) => setFallbackTeamId(e.target.value)}
                className="max-w-xs rounded border border-slate-300 px-2 py-1"
              >
                <option value="">선택 안 함</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {built && built.rows.length > 0 && (
            <div className="overflow-x-auto rounded border border-slate-200">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    {JOB_TASK_FIELDS.filter((f) => mapping[f.key] !== undefined).map((f) => (
                      <th key={f.key} className="px-3 py-2 font-medium">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {built.rows.slice(0, PREVIEW_ROWS).map((row) => (
                    <tr key={row.rowNumber} className="border-t border-slate-100">
                      {JOB_TASK_FIELDS.filter((f) => mapping[f.key] !== undefined).map((f) => (
                        <td key={f.key} className="max-w-[220px] truncate px-3 py-2 text-slate-700">
                          {row[f.key] ?? "-"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {built.rows.length > PREVIEW_ROWS && (
                <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                  앞 {PREVIEW_ROWS}건만 표시 · 실제로는 {built.rows.length}건이 저장됩니다
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="import-mode"
                checked={mode === "replace"}
                onChange={() => setMode("replace")}
              />
              해당 팀 기존 단위업무를 지우고 교체
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="import-mode"
                checked={mode === "append"}
                onChange={() => setMode("append")}
              />
              기존에 이어서 추가
            </label>
          </div>

          <button
            type="button"
            onClick={save}
            disabled={!canSave || isSaving}
            className="self-start rounded bg-brand-green px-4 py-2 text-sm text-white hover:bg-brand-green-dark disabled:opacity-50"
          >
            {isSaving ? "저장 중..." : `${rowCount}건 가져오기`}
          </button>
        </div>
      )}

      {result && (
        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="font-medium">
            단위업무 {result.imported}건 저장
            {result.replacedTeams > 0 && ` · 기존 데이터 교체 ${result.replacedTeams}개 팀`}
            {result.unassigned > 0 && ` · 팀 미배정으로 건너뜀 ${result.unassigned}건`}
          </p>
          {result.perTeam.length > 0 && (
            <p className="mt-1 text-slate-600">
              {result.perTeam.map((t) => `${t.teamName} ${t.count}건`).join(" · ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function SeedFromJobDescriptions() {
  const [result, formAction, isPending] = useActionState(seedJobTasksFromJobDescriptions, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded border border-brand-green px-3 py-1.5 text-sm text-brand-green-dark hover:bg-brand-green-light disabled:opacity-50"
        >
          {isPending ? "가져오는 중..." : "기존 직무기술서에서 단위업무 가져오기"}
        </button>
        <span className="text-sm text-slate-500">
          직무관리에 등록된 담당업무 텍스트를 줄 단위로 잘라 초안을 만듭니다. 이미
          단위업무가 있는 팀은 건드리지 않습니다.
        </span>
      </div>
      {result && (
        <p className="text-sm text-slate-600">
          {result.teamsFilled}개 팀에 단위업무 {result.tasksCreated}건 생성 · 기존 데이터가 있어
          건너뛴 팀 {result.teamsSkipped}개 · 담당업무 텍스트가 없는 팀 {result.teamsWithoutText}개
        </p>
      )}
    </form>
  );
}
