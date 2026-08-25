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
export function showToast(message: string, ok = true) {
  const toast: Toast = { id: nextId++, ok, message };
  listeners.forEach((listener) => listener(toast));
}

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const onToast = (toast: Toast) => setToasts((prev) => [...prev, toast]);
    listeners.add(onToast);
    return () => {
      listeners.delete(onToast);
    };
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    // 실패 문구는 읽을 시간이 더 필요하다.
    const timer = setTimeout(
      () => setToasts((prev) => prev.slice(1)),
      toasts[0].ok ? 3000 : 6000
    );
    return () => clearTimeout(timer);
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`pointer-events-auto flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-lg ${
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
