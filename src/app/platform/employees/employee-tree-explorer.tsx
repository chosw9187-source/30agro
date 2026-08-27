"use client";

import { createContext, useContext, useMemo, useState } from "react";
import Link from "next/link";
import { POSITIONS, POSITION_LABEL, type Position } from "@/lib/permission-constants";
import { ageInYears, tenureInYears } from "@/lib/hr-analytics";
import { formatKSTDate } from "@/lib/format-kst";

export type TeamLite = { id: string; name: string; businessUnit: string | null; division: string | null };
export type EmployeeLite = {
  id: string;
  name: string;
  employeeNumber: string;
  position: Position;
  birthDate: Date | null;
  hireDate: Date | null;
  jobGrade: string | null;
  teamId: string | null;
  team: { id: string; name: string } | null;
};

type UnitNode = { name: string; divisions: DivisionNode[]; directTeams: TeamLite[] };
type DivisionNode = { name: string; teams: TeamLite[] };

type Ctx = {
  teams: TeamLite[];
  units: UnitNode[];
  rootTeams: TeamLite[];
  employeesByTeam: Map<string, EmployeeLite[]>;
  checkedIds: Set<string>;
  toggleGroup: (ids: string[], checked: boolean) => void;
  toggleOne: (id: string, checked: boolean) => void;
  resetChecks: () => void;
  query: string;
  setQuery: (q: string) => void;
  position: Position | "";
  setPosition: (p: Position | "") => void;
  filteredList: EmployeeLite[];
  basePath: string;
  focusedUserId: string;
};

const TreeExplorerContext = createContext<Ctx | null>(null);
function useTreeExplorer() {
  const ctx = useContext(TreeExplorerContext);
  if (!ctx) throw new Error("useTreeExplorer must be used within EmployeeTreeExplorerProvider");
  return ctx;
}

export function EmployeeTreeExplorerProvider({
  teams,
  employees,
  basePath,
  focusedUserId,
  children,
}: {
  teams: TeamLite[];
  employees: EmployeeLite[];
  basePath: string;
  focusedUserId: string;
  children: React.ReactNode;
}) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<Position | "">("");

  const { units, rootTeams, employeesByTeam } = useMemo(() => {
    const employeesByTeam = new Map<string, EmployeeLite[]>();
    employees.forEach((e) => {
      if (!e.teamId) return;
      const arr = employeesByTeam.get(e.teamId) ?? [];
      arr.push(e);
      employeesByTeam.set(e.teamId, arr);
    });

    const unitOrder: string[] = [];
    const unitMap = new Map<string, UnitNode>();
    const rootTeams: TeamLite[] = [];
    function ensureUnit(name: string) {
      let u = unitMap.get(name);
      if (!u) {
        u = { name, divisions: [], directTeams: [] };
        unitMap.set(name, u);
        unitOrder.push(name);
      }
      return u;
    }
    function ensureDivision(u: UnitNode, name: string) {
      let d = u.divisions.find((x) => x.name === name);
      if (!d) {
        d = { name, teams: [] };
        u.divisions.push(d);
      }
      return d;
    }
    for (const t of teams) {
      if (t.businessUnit && t.division) ensureDivision(ensureUnit(t.businessUnit), t.division).teams.push(t);
      else if (t.businessUnit) ensureUnit(t.businessUnit).directTeams.push(t);
      else rootTeams.push(t);
    }
    return { units: unitOrder.map((n) => unitMap.get(n)!), rootTeams, employeesByTeam };
  }, [teams, employees]);

  function toggleGroup(ids: string[], makeChecked: boolean) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (makeChecked ? next.add(id) : next.delete(id)));
      return next;
    });
  }
  function toggleOne(id: string, checked: boolean) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function resetChecks() {
    setCheckedIds(new Set());
    setQuery("");
    setPosition("");
  }

  const filteredList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter((e) => {
      if (checkedIds.size > 0 && !checkedIds.has(e.id)) return false;
      if (position && e.position !== position) return false;
      if (!q) return true;
      const hay = [e.name, e.employeeNumber, e.team?.name ?? "", POSITION_LABEL[e.position] ?? "", e.jobGrade ?? ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [employees, checkedIds, position, query]);

  const value: Ctx = {
    teams,
    units,
    rootTeams,
    employeesByTeam,
    checkedIds,
    toggleGroup,
    toggleOne,
    resetChecks,
    query,
    setQuery,
    position,
    setPosition,
    filteredList,
    basePath,
    focusedUserId,
  };

  return <TreeExplorerContext.Provider value={value}>{children}</TreeExplorerContext.Provider>;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}>
      <path d="M5 3l6 5-6 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GroupCheckbox({ ids }: { ids: string[] }) {
  const { checkedIds, toggleGroup } = useTreeExplorer();
  const checkedCount = ids.filter((id) => checkedIds.has(id)).length;
  const state = ids.length === 0 ? "unchecked" : checkedCount === 0 ? "unchecked" : checkedCount === ids.length ? "checked" : "indeterminate";
  return (
    <input
      type="checkbox"
      className="h-3.5 w-3.5 shrink-0 accent-brand-green disabled:cursor-not-allowed disabled:opacity-40"
      checked={state === "checked"}
      disabled={ids.length === 0}
      ref={(el) => {
        if (el) el.indeterminate = state === "indeterminate";
      }}
      onChange={(e) => toggleGroup(ids, e.target.checked)}
    />
  );
}

function TeamNode({ t, rowClass, childClass }: { t: TeamLite; rowClass: string; childClass: string }) {
  const { employeesByTeam, checkedIds, toggleOne } = useTreeExplorer();
  const [open, setOpen] = useState(false);
  const emps = employeesByTeam.get(t.id) ?? [];
  const ids = emps.map((e) => e.id);
  return (
    <div>
      <div className={`flex items-center gap-1.5 rounded px-2 py-1 hover:bg-slate-100 ${rowClass}`}>
        {ids.length > 0 ? (
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-slate-400 hover:text-slate-600" aria-label={open ? "접기" : "펼치기"}>
            <Chevron open={open} />
          </button>
        ) : (
          <span className="w-2.5 shrink-0" />
        )}
        <GroupCheckbox ids={ids} />
        <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{t.name}</span>
        <span className="shrink-0 text-xs text-slate-400">{ids.length}</span>
      </div>
      {ids.length > 0 && open && (
        <div className="flex flex-col">
          {emps.map((e) => (
            <label key={e.id} className={`flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 hover:bg-slate-100 ${childClass}`}>
              <input
                type="checkbox"
                className="h-3.5 w-3.5 shrink-0 accent-brand-green"
                checked={checkedIds.has(e.id)}
                onChange={(ev) => toggleOne(e.id, ev.target.checked)}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-600">
                {e.name} <span className="text-xs text-slate-400">· {POSITION_LABEL[e.position]}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function UnitNodeView({ u }: { u: UnitNode }) {
  const { employeesByTeam } = useTreeExplorer();
  const [open, setOpen] = useState(false);
  function unitEmpIds() {
    const ids: string[] = [];
    u.divisions.forEach((d) => d.teams.forEach((t) => ids.push(...(employeesByTeam.get(t.id) ?? []).map((e) => e.id))));
    u.directTeams.forEach((t) => ids.push(...(employeesByTeam.get(t.id) ?? []).map((e) => e.id)));
    return ids;
  }
  const uIds = unitEmpIds();
  return (
    <div>
      <div className="flex items-center gap-1.5 rounded px-2 py-1 font-medium hover:bg-slate-100">
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-slate-400 hover:text-slate-600" aria-label={open ? "접기" : "펼치기"}>
          <Chevron open={open} />
        </button>
        <GroupCheckbox ids={uIds} />
        <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{u.name}</span>
        <span className="shrink-0 text-xs text-slate-400">{uIds.length}</span>
      </div>
      {open && (
        <div>
          {u.divisions.map((d) => (
            <DivisionNodeView key={`${u.name}/${d.name}`} d={d} />
          ))}
          {u.directTeams.map((t) => (
            <TeamNode key={t.id} t={t} rowClass="pl-4" childClass="pl-8" />
          ))}
        </div>
      )}
    </div>
  );
}

function DivisionNodeView({ d }: { d: DivisionNode }) {
  const { employeesByTeam } = useTreeExplorer();
  const [open, setOpen] = useState(false);
  const dIds = d.teams.flatMap((t) => (employeesByTeam.get(t.id) ?? []).map((e) => e.id));
  return (
    <div>
      <div className="flex items-center gap-1.5 rounded py-1 pl-4 pr-2 hover:bg-slate-100">
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-slate-400 hover:text-slate-600" aria-label={open ? "접기" : "펼치기"}>
          <Chevron open={open} />
        </button>
        <GroupCheckbox ids={dIds} />
        <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{d.name}</span>
        <span className="shrink-0 text-xs text-slate-400">{dIds.length}</span>
      </div>
      {open && (
        <div>
          {d.teams.map((t) => (
            <TeamNode key={t.id} t={t} rowClass="pl-8" childClass="pl-12" />
          ))}
        </div>
      )}
    </div>
  );
}

export function EmployeeTreeFilterPanel() {
  const { units, rootTeams, teams, query, setQuery, position, setPosition, resetChecks } = useTreeExplorer();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-slate-200 p-3">
        <p className="text-xs font-semibold text-slate-500">검색 조건</p>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="키워드 검색 (이름, 사번, 팀, 직책, 직급 등)"
          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm"
        />
        <select
          value={position}
          onChange={(e) => setPosition(e.target.value as Position | "")}
          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm"
        >
          <option value="">직책 전체</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {POSITION_LABEL[p]}
            </option>
          ))}
        </select>
        <button type="button" onClick={resetChecks} className="self-start text-xs font-medium text-brand-green-dark hover:underline">
          선택 초기화
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">활성 조직 ({teams.length}개 팀)</p>
        {units.map((u) => (
          <UnitNodeView key={u.name} u={u} />
        ))}
        {rootTeams.length > 0 && (
          <>
            <div className="mt-2 border-t border-slate-100 pt-2">
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">직속</p>
            </div>
            {rootTeams.map((t) => (
              <TeamNode key={t.id} t={t} rowClass="" childClass="pl-4" />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export function EmployeeSummaryListPanel() {
  const { filteredList, checkedIds, basePath, focusedUserId } = useTreeExplorer();
  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="mb-2 flex shrink-0 items-baseline justify-between px-1">
        <span className="text-sm font-semibold text-slate-700">{checkedIds.size > 0 ? "체크된 인원" : "전체 인원"}</span>
        <span className="text-xs text-slate-400">{filteredList.length}명</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filteredList.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">검색 결과가 없습니다.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filteredList.map((e) => (
              <Link
                key={e.id}
                href={`${basePath}?userId=${e.id}`}
                className={`block rounded-lg border p-2.5 hover:border-brand-green ${
                  focusedUserId === e.id ? "border-brand-green bg-brand-green-light" : "border-slate-200 bg-white"
                }`}
              >
                <p className="text-sm font-medium text-brand-green-dark">{e.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {e.team?.name ?? "팀 미지정"} · 사번 {e.employeeNumber}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <span className="rounded-full bg-brand-green-light px-2 py-0.5 text-[11px] font-medium text-brand-green-dark">{POSITION_LABEL[e.position]}</span>
                  {e.birthDate && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                      만 {ageInYears(e.birthDate)}세 ({formatKSTDate(e.birthDate)})
                    </span>
                  )}
                  {e.hireDate && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">근속 {tenureInYears(e.hireDate).toFixed(1)}년</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
