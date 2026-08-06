import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isActive } from "@/lib/hr-analytics";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  // 짧게 유지: 세션 하트비트(SessionHeartbeat)가 탭이 열려있는 동안만
  // 주기적으로 만료 시간을 연장한다. 탭을 닫으면(또는 어떤 이유로든
  // 하트비트가 멈추면) 이 시간 안에 자동으로 로그아웃된다.
  session: { strategy: "jwt", maxAge: 5 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "이메일", type: "email" },
        password: { label: "비밀번호", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        if (!isActive(user)) {
          const err = new CredentialsSignin();
          err.code = "account_terminated";
          throw err;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "ADMIN" | "EVALUATOR" | "EMPLOYEE";
      }
      return session;
    },
  },
});
