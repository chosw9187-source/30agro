"use client";

import { useEffect, useState } from "react";

type Toast = { id: number; ok: boolean; message: string };

let nextId = 1;
const listeners = new Set<(toast: Toast) => void>();

/**
 * 알림을 띄운다. 알림을 그리는 곳(ToastHost)은 화면 껍데기에 한 번만 붙어
 * 있어서, 알림을 띄운 폼이나 카드가 그 직후 사라져도(삭제처럼) 문구는 남는다.
 * 알림을 폼 안에 그리면 폼이 언마운트될 때 같이 지워져 아무것도 안 보인다.
 */
/** 성공 문구가 화면에 머무는 시간. 실패는 읽을 시간이 더 필요하다. */
const OK_MS = 1400;
const FAIL_MS = 5000;
/** 한 번에 쌓아 두는 최대 개수 — 그 위로는 오래된 것부터 밀어낸다. */
const MAX_STACK = 3;

export function showToast(message: string, ok = true) {
  const toast: Toast = { id: nextId++, ok, message };
  listeners.forEach((listener) => listener(toast));
}

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    /*
      알림마다 제 시계를 갖는다. 예전에는 맨 앞 것 하나만 시간을 재고 그게
      사라져야 다음 것이 시작해서, 상태를 연달아 바꾸면 다섯 장이 화면 한가운데
      쌓인 채 한 장씩 천천히 걷혔다. 이제는 뜬 지 1.4초면 각자 알아서 사라진다.
    */
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const onToast = (toast: Toast) => {
      setToasts((prev) => [...prev, toast].slice(-MAX_STACK));
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
        timers.delete(timer);
      }, toast.ok ? OK_MS : FAIL_MS);
      timers.add(timer);
    };
    listeners.add(onToast);
    return () => {
      listeners.delete(onToast);
      timers.forEach(clearTimeout);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    /*
      화면 한가운데에 띄운다. 맨 위에 붙여 두면 아래쪽에서 저장 버튼을 누른
      사람 눈에는 안 들어온다 — 방금 누른 자리에서 멀수록 못 본다.
    */
    <div className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`pointer-events-auto flex items-center gap-2 rounded-lg px-6 py-4 text-base font-medium text-white shadow-2xl ${
            toast.ok ? "bg-brand-green" : "bg-status-critical"
          }`}
        >
          <span aria-hidden>{toast.ok ? "✓" : "!"}</span>
          <span>{toast.message}</span>
          <button
            type="button"
            aria-label="알림 닫기"
            onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
            className="ml-1 rounded px-1 text-white/80 hover:text-white"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
