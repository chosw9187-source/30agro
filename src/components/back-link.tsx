"use client";

import { useRouter } from "next/navigation";

export function BackLink({
  fallbackHref,
  label,
}: {
  fallbackHref: string;
  label: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      className="self-start text-sm text-slate-500 hover:underline"
    >
      ← {label}
    </button>
  );
}
