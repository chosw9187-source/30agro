import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { POSITION_LABEL, type Position } from "@/lib/permission-constants";
import { formatKSTDate } from "@/lib/format-kst";

/** 관리자 전용 인사카드 다운로드(엑셀/워드) 공통 권한 체크 + 데이터 조회. */
export async function loadHrCardExportData(userId: string) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return { forbidden: true as const };
  }

  const employee = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      team: true,
      appointmentRecords: { orderBy: { date: "desc" } },
      educationRecords: { orderBy: [{ admissionDate: "asc" }, { order: "asc" }] },
      careerHistory: { orderBy: [{ startDate: "asc" }, { order: "asc" }] },
      certifications: { orderBy: [{ acquiredDate: "asc" }, { order: "asc" }] },
      commendationDiscipline: { orderBy: [{ startDate: "asc" }, { order: "asc" }] },
    },
  });
  if (!employee) return { forbidden: false as const, employee: null };

  return { forbidden: false as const, employee };
}

export function fmtDate(d: Date | null) {
  return d ? formatKSTDate(d) : "";
}

export function fmtYearMonth(d: Date | null) {
  return d ? formatKSTDate(d, { year: "numeric", month: "2-digit" }) : "";
}

export function positionLabel(position: string) {
  return POSITION_LABEL[position as Position] ?? position;
}
