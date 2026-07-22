import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { itemsForEvaluatee } from "@/lib/template-items";
import { compositeScore, buildPerformanceComparison } from "@/lib/performance-report";
import { competencyOverallScores } from "@/lib/evaluation-report";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const cycleIds = req.nextUrl.searchParams.getAll("cycleIds");
  if (cycleIds.length === 0) {
    return Response.json({ error: "사이클을 선택해주세요." }, { status: 400 });
  }

  const evaluations = await prisma.evaluation.findMany({
    where: { cycleId: { in: cycleIds } },
    include: {
      evaluatee: { include: { team: true } },
      cycle: { include: { template: { include: { items: true } } } },
      scores: true,
    },
  });

  type Row = {
    teamName: string;
    name: string;
    employeeNumber: string;
    performanceScores: number[];
    competencyScores: number[];
  };
  const rowByEmployee = new Map<string, Row>();

  for (const ev of evaluations) {
    const employee = ev.evaluatee;
    const key = employee.id;
    if (!rowByEmployee.has(key)) {
      rowByEmployee.set(key, {
        teamName: employee.team?.name ?? "-",
        name: employee.name,
        employeeNumber: employee.employeeNumber,
        performanceScores: [],
        competencyScores: [],
      });
    }
    const row = rowByEmployee.get(key)!;

    const items = itemsForEvaluatee(
      ev.cycle.template.items,
      ev.evaluatee,
      ev.cycle.template.kind
    );
    const scoreByItem = new Map(ev.scores.map((s) => [s.templateItemId, s]));

    if (ev.cycle.template.kind === "PERFORMANCE") {
      const rows = buildPerformanceComparison(items, scoreByItem);
      const score = compositeScore(rows, "manager");
      if (score != null) row.performanceScores.push(score);
    } else {
      const { selfPercent, managerPercent } = competencyOverallScores(items, scoreByItem);
      const parts = [selfPercent, managerPercent].filter(
        (v): v is number => v != null
      );
      if (parts.length > 0) {
        row.competencyScores.push(parts.reduce((a, b) => a + b, 0) / parts.length);
      }
    }
  }

  function average(values: number[]): number | null {
    if (values.length === 0) return null;
    return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  }

  const sheetRows = [...rowByEmployee.values()]
    .sort((a, b) => a.teamName.localeCompare(b.teamName) || a.name.localeCompare(b.name))
    .map((row) => {
      const performanceScore = average(row.performanceScores);
      const competencyScore = average(row.competencyScores);
      const total =
        performanceScore != null && competencyScore != null
          ? Math.round((performanceScore * 0.6 + competencyScore * 0.4) * 10) / 10
          : null;
      return {
        팀명: row.teamName,
        이름: row.name,
        사번: row.employeeNumber,
        성과평가점수: performanceScore ?? "",
        역량평가점수: competencyScore ?? "",
        합계: total ?? "",
      };
    });

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(workbook, sheet, "평가결과");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const filename = `평가결과_${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="evaluation_results.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
