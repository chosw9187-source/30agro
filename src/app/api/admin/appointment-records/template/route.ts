import * as XLSX from "xlsx";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const headers = [
    "사번",
    "발령일",
    "발령구분",
    "발령명",
    "근무부서",
    "직책",
    "직급",
    "발령내역",
  ];
  const example = [
    "20260001",
    "2025-01-01",
    "공식",
    "승급발령",
    "인사팀",
    "팀장",
    "G4",
    "",
  ];

  const sheet = XLSX.utils.aoa_to_sheet([headers, example]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "발령사항");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("발령사항_업로드양식.xlsx")}`,
    },
  });
}
