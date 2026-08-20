"use client";

import { useActionState } from "react";
import { showToast } from "@/components/toast";

/**
 * 서버 액션을 쓰는 폼에 처리 결과 알림을 붙여주는 껍데기.
 *
 * 지금까지는 `<form action={서버액션}>`으로 바로 제출해서, 눌러도 화면이
 * 조용히 갱신되기만 하고 "됐다/안 됐다"가 보이지 않았다. 권한 오류처럼
 * 액션이 예외를 던지는 경우엔 아무 일도 안 일어난 것처럼 보였다.
 *
 * children은 서버 컴포넌트에서 그대로 넘겨받으므로, 기존 폼은 <form>만
 * 이 컴포넌트로 바꾸면 된다.
 */
export function ActionForm({
  action,
  children,
  className,
  id,
  successMessage = "정상 등록되었습니다.",
}: {
  action: (formData: FormData) => Promise<unknown>;
  children: React.ReactNode;
  className?: string;
  id?: string;
  successMessage?: string;
}) {
  const [, formAction] = useActionState(async (_prev: null, formData: FormData) => {
    try {
      await action(formData);
      showToast(successMessage, true);
    } catch (error) {
      // redirect()/notFound() 같은 Next 내부 제어 신호는 잡아채면 안 된다.
      if (
        error &&
        typeof error === "object" &&
        "digest" in error &&
        String((error as { digest?: unknown }).digest).startsWith("NEXT_")
      ) {
        throw error;
      }
      showToast(
        error instanceof Error ? error.message : "처리하지 못했습니다.",
        false
      );
    }
    return null;
  }, null);

  return (
    <form id={id} action={formAction} className={className}>
      {children}
    </form>
  );
}
