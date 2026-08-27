import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canViewEmployeeCard } from "@/lib/permissions";

/** 인사카드 상세 화면(직원 상세 페이지, 직원조회 목록의 미리보기 패널)이 공유하는 조회 로직. */
export async function loadEmployeeCard(userId: string) {
  const allowed = await canViewEmployeeCard(userId);
  if (!allowed) return { allowed: false as const, employee: null, isAdmin: false, isOwnCard: false };

  const employee = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      team: true,
      appointmentRecords: { orderBy: { date: "desc" } },
      performanceHistory: { orderBy: { year: "desc" } },
      educationRecords: { orderBy: [{ admissionDate: "asc" }, { order: "asc" }] },
      careerHistory: { orderBy: [{ startDate: "asc" }, { order: "asc" }] },
      certifications: { orderBy: [{ acquiredDate: "asc" }, { order: "asc" }] },
      commendationDiscipline: { orderBy: [{ startDate: "asc" }, { order: "asc" }] },
    },
  });
  if (!employee) return { allowed: true as const, employee: null, isAdmin: false, isOwnCard: false };

  const session = await auth();
  const isAdmin = session?.user.role === "ADMIN";
  const isOwnCard = session?.user.id === employee.id;

  return { allowed: true as const, employee, isAdmin, isOwnCard };
}
