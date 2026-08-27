"use client";

import { useState } from "react";
import { SearchableSelect } from "@/components/searchable-select";

type Option = { value: string; label: string; sublabel?: string };

/**
 * 담당 배정 입력 — 개인(지정 강사) 또는 부서 중 하나를 고른다.
 *
 * 부서 배정은 "그 날 시간이 되는 사람이 맡는" 경우를 위한 것이라, 이 시점에는
 * 사람을 못 박지 않는다. 두 값이 동시에 넘어가면 서버가 무엇을 우선할지
 * 모호해지므로 고른 쪽만 폼에 남긴다.
 */
export function AssignFields({
  instructorOptions,
  teamOptions,
  defaultInstructorId = "",
  defaultTeamId = "",
  inputClassName,
  labelClassName,
}: {
  instructorOptions: Option[];
  teamOptions: Option[];
  defaultInstructorId?: string;
  defaultTeamId?: string;
  inputClassName: string;
  labelClassName: string;
}) {
  const [mode, setMode] = useState<"PERSON" | "TEAM">(defaultTeamId ? "TEAM" : "PERSON");

  return (
    <>
      <div>
        <label className={labelClassName}>담당 구분</label>
        <select
          name="assignMode"
          value={mode}
          onChange={(e) => setMode(e.target.value as "PERSON" | "TEAM")}
          className={inputClassName}
        >
          <option value="PERSON">지정 강사</option>
          <option value="TEAM">부서 (되는 사람이 맡음)</option>
        </select>
      </div>
      <div>
        {mode === "PERSON" ? (
          <>
            <label className={labelClassName}>담당 강사</label>
            <SearchableSelect
              name="instructorId"
              options={instructorOptions}
              defaultValue={defaultInstructorId}
              placeholder="강사 검색..."
              emptyLabel="나중에 지정"
            />
          </>
        ) : (
          <>
            <label className={labelClassName}>담당 부서</label>
            <SearchableSelect
              name="instructorTeamId"
              options={teamOptions}
              defaultValue={defaultTeamId}
              placeholder="부서 검색..."
              emptyLabel="선택 안 함"
            />
          </>
        )}
      </div>
    </>
  );
}
