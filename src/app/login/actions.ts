"use server";

import { signIn } from "@/auth";
import { AuthError, CredentialsSignin } from "next-auth";

export async function loginAction(
  _prevState: string | undefined,
  formData: FormData
) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof CredentialsSignin && error.code === "account_terminated") {
      return "퇴직 처리된 계정은 로그인할 수 없습니다. 관리자에게 문의해주세요.";
    }
    if (error instanceof AuthError) {
      return "이메일 또는 비밀번호가 올바르지 않습니다.";
    }
    throw error;
  }
}
