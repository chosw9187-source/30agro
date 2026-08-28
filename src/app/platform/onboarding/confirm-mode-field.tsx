"use client";

import { useState } from "react";

/**
 * 편성한 강의를 바로 확정할지, 강사에게 먼저 물어볼지 고르는 칸.
 *
 * 두 결과가 꽤 달라서 — 한쪽은 담당자에게 "가능한지 알려 달라"는 요청이 가고,
 * 다른 한쪽은 그 즉시 교육생 전원의 최종 스케줄에 올라간다 — 고른 값에 따라
 * 무슨 일이 벌어지는지 한 줄로 붙여 둔다. 확정은 되돌릴 수 있지만, 이미 나간
 * 공지는 되돌릴 수 없다.
 */
export function ConfirmModeField({
  inputClassName,
  labelClassName,
}: {
  inputClassName: string;
  labelClassName: string;
}) {
  const [mode, setMode] = useState<"ASK" | "NOW">("ASK");

  return (
    <div>
      <label className={labelClassName} htmlFor="onboarding-confirm-mode">
        확정 방식
      </label>
      <select
        id="onboarding-confirm-mode"
        name="confirmMode"
        value={mode}
        onChange={(e) => setMode(e.target.value === "NOW" ? "NOW" : "ASK")}
        className={inputClassName}
      >
        <option value="ASK">강사에게 확인</option>
        <option value="NOW">바로 확정</option>
      </select>
      <p className={`mt-1 text-[11px] ${mode === "NOW" ? "font-medium text-brand-green-dark" : "text-slate-400"}`}>
        {mode === "NOW"
          ? "저장하는 즉시 최종 스케줄에 올라가고 교육생에게 알림이 갑니다."
          : "담당 강사가 가능 여부를 답한 뒤 관리자가 확정합니다."}
      </p>
    </div>
  );
}
