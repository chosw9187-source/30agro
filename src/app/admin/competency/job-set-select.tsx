"use client";

import { useRef } from "react";
import { showToast } from "@/components/toast";

/**
 * 직무를 고르면 **그 자리에서** 저장되는 고르개.
 *
 * 팀 스무 줄과 사람 수십 줄에 저장 단추를 따로 두면, 고르고 누르고 고르고 누르는
 * 일이 된다. 여기서는 고르는 순간이 곧 저장이다 — 되돌리려면 다시 고르면 되고,
 * 잘못 골라도 잃는 것이 없는 값이라(문항이 아니라 «어느 문항을 볼지») 되묻지 않는다.
 *
 * 폼을 감싸 두고 고르개가 바뀔 때 제출한다. 서버 액션이 던진 말은 알림으로 띄운다 —
 * 조용히 아무 일도 안 일어나면 저장된 줄 알고 넘어간다.
 */
export function JobSetSelect({
  action,
  formId,
  scopeName,
  scopeId,
  value,
  options,
  emptyLabel,
}: {
  action: (formData: FormData) => Promise<unknown>;
  formId: string;
  /** 팀 기본값이면 "teamId", 사람 예외면 "userId". */
  scopeName: "teamId" | "userId";
  scopeId: string;
  value: string;
  options: { value: string; label: string }[];
  emptyLabel: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData: FormData) => {
        try {
          await action(formData);
          showToast("저장했습니다.");
        } catch (error) {
          showToast(
            error instanceof Error ? error.message : "저장하지 못했습니다.",
            false,
          );
        }
      }}
    >
      <input type="hidden" name="formId" value={formId} />
      <input type="hidden" name={scopeName} value={scopeId} />
      <select
        /*
          저장한 뒤 서버가 준 값이 칸에 보여야 한다. `defaultValue`는 처음 그려질
          때만 먹으므로, 갱신 후에도 React가 같은 select를 재사용하면서 배정해 둔
          직무가 「미배정」으로 보였다. 값을 열쇠에 넣어 값이 달라질 때만 다시 그린다.
        */
        key={`${scopeId}:${value}`}
        name="setId"
        defaultValue={value}
        onChange={() => formRef.current?.requestSubmit()}
        aria-label="직무역량 묶음 선택"
        className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
      >
        <option value="">{emptyLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </form>
  );
}
