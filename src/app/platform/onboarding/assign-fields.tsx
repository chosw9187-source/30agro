"use client";

import { useState } from "react";
import { SearchableSelect } from "@/components/searchable-select";

type Option = { value: string; label: string; sublabel?: string };

/**
 * 담당 배정 입력 — 특정인 또는 부서 중 하나를 고른다.
 *
 * «특정인 지정»은 강사가 정해진 경우다. 재직 임직원 누구나 고를 수 있다.
 * «부서»는 그 날 시간이 되는 사람이 나가는 식이라 이름을 미리 못 박을 수 없는
 * 경우로, 안내서에는 부서 이름으로 나간다.
 *
 * 두 값이 동시에 넘어가면 서버가 무엇을 우선할지 모호해지므로 고른 쪽만
 * 폼에 남긴다.
 */
type Mode = "PERSON" | "TEAM";

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
  const [mode, setMode] = useState<Mode>(defaultTeamId ? "TEAM" : "PERSON");

  return (
    <>
      <div>
        <label className={labelClassName}>담당 구분</label>
        <select
          name="assignMode"
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          className={inputClassName}
        >
          <option value="PERSON">특정인 지정</option>
          <option value="TEAM">부서</option>
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
              emptyLabel="미정"
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
