import * as XLSX from "xlsx";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const headers = ["사번", "학력구분", "학교명", "전공", "학위"];
  const examples = [
    ["20260001", "고등학교", "한국고등학교", "", ""],
    ["20260001", "대학교", "한국대학교", "경영학", "학사"],
    ["20260001", "대학원(석사)", "한국대학교", "경영학", "석사"],
    ["20260001", "대학원(박사)", "한국대학교", "경영학", "박사"],
  ];

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "학력");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("학력_업로드양식.xlsx")}`,
    },
  });
}
