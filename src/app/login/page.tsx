import { LoginForm } from "./login-form";
import { CompanyLogo } from "@/components/company-logo";

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-slate-100 px-4 py-8">
      <div className="grid w-full max-w-3xl overflow-hidden rounded-lg shadow-sm md:grid-cols-2">
        <div className="hidden flex-col justify-between bg-brand-black p-10 text-white md:flex">
          <div className="w-fit rounded bg-white px-3 py-2">
            <CompanyLogo />
          </div>
          <div>
            <h1 className="text-3xl font-bold leading-snug">
              모든 인사 업무를
              <br />
              한곳에서
            </h1>
            <p className="mt-4 text-sm text-white/70">
              직원 정보 · 조직도 · 직무관리 · 평가를 하나의
              <br />
              플랫폼에서 관리합니다.
            </p>
          </div>
          <div className="h-0.5 w-8 bg-brand-green" />
        </div>

        <div className="flex flex-col justify-center bg-white p-8 sm:p-10">
          <div className="flex justify-end md:hidden">
            <CompanyLogo />
          </div>
          <div className="mb-6">
            <div className="mb-2 h-0.5 w-6 bg-brand-green" />
            <h2 className="text-xl font-semibold text-brand-black">로그인</h2>
            <p className="mt-1 text-sm text-slate-500">
              아이디와 비밀번호를 입력하세요.
            </p>
          </div>
          <LoginForm />
          <p className="mt-6 text-xs text-slate-400">
            비밀번호 문의는 관리자에게 연락해주세요.
          </p>
        </div>
      </div>
    </div>
  );
}
