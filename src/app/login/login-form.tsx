"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm() {
  const [error, formAction, isPending] = useActionState(
    loginAction,
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm text-slate-600">
          아이디
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="이메일 주소"
          className="rounded border border-slate-300 px-3 py-2.5 focus:border-brand-green focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm text-slate-600">
          비밀번호
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="rounded border border-slate-300 px-3 py-2.5 focus:border-brand-green focus:outline-none"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="mt-2 rounded bg-brand-green px-4 py-2.5 font-medium text-white hover:bg-brand-green-dark disabled:opacity-50"
      >
        {isPending ? "로그인 중..." : "로그인"}
      </button>
    </form>
  );
}
