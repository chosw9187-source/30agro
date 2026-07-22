import { LoginForm } from "./login-form";
import { CompanyLogo } from "@/components/company-logo";

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-brand-green-light px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <CompanyLogo className="scale-125" />
          <h1 className="text-lg font-semibold text-brand-black">
            인사 평가 시스템
          </h1>
          <p className="text-sm text-slate-500">로그인하여 계속하세요.</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
