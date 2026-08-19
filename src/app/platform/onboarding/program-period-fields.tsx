"use client";

import { useState } from "react";

/**
 * "YYYY-MM-DD"에 일 단위로 더한다. `new Date("2026-09-01")`은 UTC 자정으로
 * 파싱되므로 UTC 기준으로만 계산해야 브라우저 시간대에 따라 하루가 밀리지
 * 않는다.
 */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 프로그램 기간(시작일·종료일) 입력. 시작일을 고르면 종료일이 그 다음 날로
 * 미리 채워져, 종료일을 눌렀을 때 달력이 시작일 근처에서 열린다 — 기수는
 * 하루 이상 이어지는 게 보통이라 매번 같은 달을 손으로 찾아 들어가는 수고를
 * 덜기 위함. 사용자가 이미 골라 둔 종료일은 덮어쓰지 않고, 기간이 뒤집히는
 * 경우(종료일 < 시작일)에만 다시 맞춰 준다.
 */
export function ProgramPeriodFields({
  inputClassName,
  labelClassName,
}: {
  inputClassName: string;
  labelClassName: string;
}) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  /** 종료일이 비어 있을 때만 시작일 다음 날로 채운다. */
  const fillEndDate = () => {
    if (startDate && !endDate) setEndDate(addDays(startDate, 1));
  };

  return (
    <>
      <div>
        <label className={labelClassName} htmlFor="onboarding-program-start">
          시작일 (선택)
        </label>
        <input
          id="onboarding-program-start"
          type="date"
          name="startDate"
          value={startDate}
          onChange={(e) => {
            const next = e.target.value;
            setStartDate(next);
            if (next && (!endDate || endDate < next)) setEndDate(addDays(next, 1));
          }}
          className={inputClassName}
        />
      </div>
      <div>
        <label className={labelClassName} htmlFor="onboarding-program-end">
          종료일 (선택)
        </label>
        <input
          id="onboarding-program-end"
          type="date"
          name="endDate"
          value={endDate}
          // 시작일보다 앞선 종료일은 애초에 고를 수 없게 막는다.
          min={startDate || undefined}
          // 종료일을 지웠다 다시 누르는 경우를 위한 보완 — 평소에는 시작일을
          // 고르는 시점에 이미 채워져 있다.
          onFocus={fillEndDate}
          onClick={fillEndDate}
          onChange={(e) => setEndDate(e.target.value)}
          className={inputClassName}
        />
      </div>
    </>
  );
}
