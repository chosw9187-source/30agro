import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">인사 평가 시스템</h1>
        <p className="mb-6 text-sm text-slate-500">
          아이디는 이메일, 비밀번호는 사번입니다.
        </p>
        <LoginForm />
        <div className="mt-6 rounded bg-slate-50 p-3 text-xs text-slate-500">
          <p>데모 계정 (비밀번호는 사번과 동일)</p>
          <p>관리자: admin@demo.com / 2024001</p>
          <p>개발팀장(평가자): evaluator@demo.com / 2024002</p>
          <p>인사팀장(평가자): evaluator2@demo.com / 2024003</p>
          <p>개발팀 직원: employee@demo.com / 2024004</p>
        </div>
      </div>
    </div>
  );
}
