"use client";

import { useEffect } from "react";

const STEP_KEYS = ["ArrowUp", "ArrowDown", "PageUp", "PageDown"];

/**
 * 숫자 칸(<input type="number">)이 방향키·휠에 값이 바뀌지 않게 막는다.
 *
 * 브라우저 기본 동작이라 눈치채기 어려운데, 긴 폼에서는 이렇게 된다 —
 * 가중치에 30을 적고 아래로 내려가려고 ↓를 한 번 누르면 페이지는 그대로 있고
 * 값만 29가 된다. 두 번 누르면 28이다. 화면에는 «저장되었습니다»가 뜨니까
 * 적은 값과 다른 숫자가 조용히 남고, 나중에 보면 «분명 30을 적었는데»가 된다.
 * 실제로 가중치 30이 29로, 15가 13으로 저장되는 일이 있었다.
 *
 * 그래서 방향키가 오면 값을 바꾸지 않고 그 칸에서 빠져나온다. 다음 키부터는
 * 평소처럼 화면이 스크롤된다. 화살표로 숫자를 한 칸씩 올리는 기능은 없어지지만,
 * 퍼센트는 눌러서 맞추는 값이 아니라 적어 넣는 값이다.
 *
 * 한 군데(플랫폼 껍데기)에 붙여서 앱 전체의 숫자 칸을 한꺼번에 지킨다 —
 * 칸마다 챙기게 두면 새로 만드는 폼에서 또 빠진다.
 */
export function NumberStepGuard() {
  useEffect(() => {
    const numberField = (target: EventTarget | null): HTMLInputElement | null =>
      target instanceof HTMLInputElement && target.type === "number" ? target : null;

    const onKeyDown = (event: KeyboardEvent) => {
      const field = numberField(event.target);
      if (!field || !STEP_KEYS.includes(event.key)) return;
      event.preventDefault();
      field.blur();
    };

    // 휠은 최신 크롬에서는 값을 안 바꾸지만 파이어폭스 등에서는 바꾼다.
    // passive로 달아서 스크롤 자체는 느려지지 않게 한다.
    const onWheel = (event: WheelEvent) => {
      const field = numberField(event.target);
      if (field && document.activeElement === field) field.blur();
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("wheel", onWheel, { passive: true, capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("wheel", onWheel, true);
    };
  }, []);

  return null;
}
