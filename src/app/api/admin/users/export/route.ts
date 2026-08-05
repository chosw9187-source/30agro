import * as XLSX from "xlsx";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const HEADERS = [
  "이름",
  "사번",
  "이메일주소",
  "사업단위",
  "본부",
  "팀명",
  "직책",
  "성별",
  "생년월일",
  "입사일",
  "퇴사일",
  "사원구분",
  "직급",
  "직군",
];

const POSITION_LABEL: Record<string, string> = {
  CEO: "사장",
  OPERATIONS_HEAD: "운영책임",
  SENIOR_STAFF: "책임",
  TEAM_LEADER: "팀장",
  STAFF: "담당",
};

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    include: { team: true },
  });

  const rows = users.map((u) => [
    u.name,
    u.employeeNumber,
    u.email ?? "",
    u.team?.businessUnit ?? u.businessUnit ?? "",
    u.team?.division ?? u.division ?? "",
    u.team?.name ?? "",
    POSITION_LABEL[u.position] ?? "",
    u.gender ?? "",
    u.birthDate ?? "",
    u.hireDate ?? "",
    u.terminationDate ?? "",
    u.employmentType ?? "",
    u.jobGrade ?? "",
    u.jobFamily ?? "",
  ]);

  const sheet = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "사용자");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("사용자관리_현재목록.xlsx")}`,
    },
  });
}
