"use client";

import { useTransition } from "react";
import { toggleKeyTalent } from "./actions";

export function KeyTalentToggle({ userId, isKeyTalent }: { userId: string; isKeyTalent: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <input
      type="checkbox"
      defaultChecked={isKeyTalent}
      disabled={isPending}
      onChange={(e) => {
        startTransition(() => {
          toggleKeyTalent(userId, e.target.checked);
        });
      }}
      className="h-4 w-4 rounded border-slate-300 text-brand-green focus:ring-brand-green disabled:opacity-50"
    />
  );
}
