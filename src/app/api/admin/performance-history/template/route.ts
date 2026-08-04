import * as XLSX from "xlsx";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const headers = ["사번", "연도", "등급", "점수", "비고"];
  const example = ["20260001", "2023", "A", "92", ""];

  const sheet = XLSX.utils.aoa_to_sheet([headers, example]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "인사평가이력");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("인사평가이력_업로드양식.xlsx")}`,
    },
  });
}
