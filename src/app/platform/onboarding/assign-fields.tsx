"use client";

import { useState } from "react";
import { SearchableSelect } from "@/components/searchable-select";

type Option = { value: string; label: string; sublabel?: string };

/**
 * 담당 배정 입력 — 특정인 또는 부서 중 하나를 고른다.
 *
 * «특정인 지정»은 관리자가 강사를 못 박는 경우다. 재직 임직원 누구나 고를 수
 * 있고, 그 사람만 가능 여부를 답할 수 있다.
 * «부서 내 지정»은 부서에 맡기는 경우다. 그 부서 사람이면 직급과 무관하게
 * 누구나 강사를 정하고 답할 수 있다.
 *
 * 부서 배정은 "그 부서가 맡되 누가 할지는 팀 사정에 맡긴다"는 뜻이라, 이
 * 시점에는 사람을 못 박지 않는다 — 그 부서 사람이 나중에 강사를 지정한다.
 * 두 값이 동시에 넘어가면 서버가 무엇을 우선할지 모호해지므로 고른 쪽만
 * 폼에 남긴다.
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
          <option value="PERSON">특정인 지정</option>
          <option value="TEAM">부서 내 지정</option>
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
              placeholder="이름 검색..."
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
