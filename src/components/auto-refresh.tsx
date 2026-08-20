"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 서버에서 그린 화면을 주기적으로 다시 받아온다. 목표 달성률처럼 여러 사람이
 * 각자 고치는 값은, 내가 아무것도 안 눌러도 화면이 최신이어야 한다.
 *
 * 탭이 화면에 보일 때만 돌리고(백그라운드 탭은 새로고침해봐야 아무도 안 본다),
 * 다른 창을 보다 돌아오면 즉시 한 번 받아온다.
 */
export function AutoRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    function refreshIfVisible() {
      if (document.visibilityState === "visible") router.refresh();
    }

    const id = setInterval(refreshIfVisible, intervalMs);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      clearInterval(id);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [router, intervalMs]);

  return null;
}
