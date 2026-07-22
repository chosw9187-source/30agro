import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="mb-1 text-xl font-semibold">비밀번호 변경</h1>
            <p className="text-sm text-slate-500">
              보안을 위해 최초 로그인 시 비밀번호를 변경해야 합니다.
            </p>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="shrink-0 text-sm text-slate-400 hover:text-slate-700 hover:underline"
            >
              로그아웃
            </button>
          </form>
        </div>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
