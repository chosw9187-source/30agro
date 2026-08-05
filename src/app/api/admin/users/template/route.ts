import * as XLSX from "xlsx";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const headers = [
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
  const example = [
    "홍길동",
    "20260001",
    "hong@example.com",
    "작물보호제사업",
    "재무경영관리",
    "재경팀",
    "담당",
    "남",
    "1990-01-15",
    "2020-03-01",
    "",
    "정규직",
    "대리",
    "관리직",
  ];
  const executiveExample = [
    "손지명",
    "20100001",
    "son@example.com",
    "제품사업",
    "",
    "",
    "운영책임",
    "남",
    "1970-05-01",
    "2010-01-01",
    "",
    "정규직",
    "부사장",
    "",
  ];
  const formerEmployeeExample = [
    "김퇴사",
    "20180001",
    "",
    "작물보호제사업",
    "재무경영관리",
    "재경팀",
    "담당",
    "여",
    "1985-03-10",
    "2018-06-01",
    "2025-12-31",
    "정규직",
    "과장",
    "관리직",
  ];

  const sheet = XLSX.utils.aoa_to_sheet([
    headers,
    example,
    executiveExample,
    formerEmployeeExample,
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "사용자");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("사용자관리_업로드양식.xlsx")}`,
    },
  });
}
