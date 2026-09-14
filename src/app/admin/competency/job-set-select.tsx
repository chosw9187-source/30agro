"use client";

import { useRef } from "react";
import { showToast } from "@/components/toast";

/**
 * 고르면 **그 자리에서** 저장되는 고르개.
 *
 * 팀 스무 줄과 사람 수십 줄에 저장 단추를 따로 두면, 고르고 누르고 고르고 누르는
 * 일이 된다. 여기서는 고르는 순간이 곧 저장이다 — 되돌리려면 다시 고르면 되고,
 * 잘못 골라도 잃는 것이 없는 값이라(문항이 아니라 «어느 문항을 볼지») 되묻지 않는다.
 *
 * 서버 액션이 던진 말은 알림으로 띄운다 — 조용히 아무 일도 안 일어나면 저장된 줄
 * 알고 넘어간다.
 */
export function InstantSelect({
  action,
  hidden,
  name,
  value,
  options,
  ariaLabel,
  tone = "plain",
}: {
  action: (formData: FormData) => Promise<unknown>;
  /** 함께 보낼 숨은 값 — 양식 id, 팀/사람 id 같은 것. */
  hidden: Record<string, string>;
  name: string;
  value: string;
  options: { value: string; label: string }[];
  ariaLabel: string;
  /** 골라 둔 값이 «빠짐»을 뜻할 때 눈에 걸리게 한다. */
  tone?: "plain" | "warn";
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
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <select
        /*
          저장한 뒤 서버가 준 값이 칸에 보여야 한다. `defaultValue`는 처음 그려질
          때만 먹으므로, 갱신 후에도 React가 같은 select를 재사용하면서 배정해 둔
          직무가 「미배정」으로 보였다. 값을 열쇠에 넣어 값이 달라질 때만 다시 그린다.
        */
        key={`${JSON.stringify(hidden)}:${value}`}
        name={name}
        defaultValue={value}
        onChange={() => formRef.current?.requestSubmit()}
        aria-label={ariaLabel}
        className={`w-full rounded-md border px-2 py-1 text-xs ${
          tone === "warn"
            ? "border-status-critical/50 bg-status-critical/5 text-status-critical"
            : "border-slate-300"
        }`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </form>
  );
}
