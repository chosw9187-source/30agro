import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">인사 평가 시스템</h1>
        <p className="mb-6 text-sm text-slate-500">로그인하여 계속하세요.</p>
        <LoginForm />
      </div>
    </div>
  );
}
