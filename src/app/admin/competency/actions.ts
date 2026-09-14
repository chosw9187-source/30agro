"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import {
  CORE_SEED_ITEMS,
  CORE_LEADER_SEED_ITEMS,
  LEADERSHIP_SEED_ITEMS,
  JOB_SEED_SETS,
} from "@/lib/competency-seed";
import { COMPETENCY_ITEMS_PER_SET } from "@/lib/competency";
import { competencyFormEditable } from "@/lib/competency-form";

const PATH = "/admin/competency";
const VIEW_PATH = "/platform/evaluation2";

function str(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function done() {
  revalidatePath(PATH);
  revalidatePath(VIEW_PATH);
}

/** 문항을 고치는 모든 자리에서 먼저 묻는다 — 종료된 양식은 잠긴다. */
async function requireDraft(formId: string) {
  await requireRole("ADMIN");
  const form = await prisma.competencyForm.findUnique({
    where: { id: formId },
    select: { id: true, year: true, status: true },
  });
  if (!form) throw new Error("양식을 찾을 수 없습니다.");
  if (!competencyFormEditable(form.status)) {
    throw new Error(
      "종료된 양식은 고칠 수 없습니다 — 그 해 성적의 근거입니다.",
    );
  }
  return form;
}

/** 그 해의 빈 양식 한 벌. 핵심가치 두 묶음은 늘 있어야 하므로 함께 만든다. */
export async function createCompetencyForm(formData: FormData) {
  await requireRole("ADMIN");
  const year = Number(str(formData.get("year")));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("연도를 확인해 주세요.");
  }
  const existing = await prisma.competencyForm.findUnique({ where: { year } });
  if (existing) throw new Error(`${year}년 양식이 이미 있습니다.`);

  await prisma.competencyForm.create({
    data: {
      year,
      sets: {
        create: [
          { kind: "CORE_STAFF", name: "팀원용", sortOrder: 0 },
          { kind: "CORE_LEADER", name: "팀장용", sortOrder: 1 },
          // 리더십역량은 전사 한 벌이라 배정 없이 늘 한 줄 있어야 한다.
          { kind: "LEADERSHIP", name: "리더십역량", sortOrder: 2 },
        ],
      },
    },
  });
  done();
}

/**
 * 인사팀이 준 엑셀 내용을 심는다 — **빠진 것만** 채운다.
 *
 * 두 번 눌러도 문항이 열 줄이 되지 않는다(이미 있는 묶음과 열쇠는 건너뛴다).
 * 그래서 나중에 양식이 한 벌 늘었을 때도 이 단추 하나로 보탤 수 있다 —
 * 리더십역량을 뒤늦게 넣은 것이 그런 경우였다.
 *
 * 직무 이름이 팀 이름과 같으면 그 팀의 기본 직무로 함께 걸어 주고, 이름이
 * 「지점」으로 끝나는 팀에는 「지점」 묶음을 걸어 준다. 여기서 못 걸린 팀은
 * 화면이 「미배정」으로 알려 준다.
 */
export async function seedCompetencyForm(formId: string) {
  await requireDraft(formId);

  /*
    배정이 없는 세 묶음 — 핵심가치 팀원용·팀장용, 리더십역량 — 을 먼저 채운다.
    담당은 「팀원용 + 직무역량」, 팀장은 「팀장용 + 리더십역량」을 받는다.
  */
  const fixed: [string, typeof CORE_SEED_ITEMS][] = [
    ["CORE_STAFF", CORE_SEED_ITEMS],
    ["CORE_LEADER", CORE_LEADER_SEED_ITEMS],
    ["LEADERSHIP", LEADERSHIP_SEED_ITEMS],
  ];
  for (const [kind, items] of fixed) {
    const set = await prisma.competencyItemSet.upsert({
      where: {
        formId_kind_name: {
          formId,
          kind: kind as "CORE_STAFF" | "CORE_LEADER" | "LEADERSHIP",
          name:
            kind === "CORE_STAFF"
              ? "팀원용"
              : kind === "CORE_LEADER"
                ? "팀장용"
                : "리더십역량",
        },
      },
      create: {
        formId,
        kind: kind as "CORE_STAFF" | "CORE_LEADER" | "LEADERSHIP",
        name:
          kind === "CORE_STAFF"
            ? "팀원용"
            : kind === "CORE_LEADER"
              ? "팀장용"
              : "리더십역량",
      },
      update: {},
      select: { id: true },
    });
    await prisma.competencyFormItem.createMany({
      data: items.map((it, i) => ({
        setId: set.id,
        key: it.key,
        area: it.area,
        question: it.question,
        sortOrder: i,
      })),
      skipDuplicates: true,
    });
  }

  const teams = await prisma.team.findMany({
    where: { active: true },
    select: { id: true, name: true },
  });

  for (const [i, seed] of JOB_SEED_SETS.entries()) {
    // 이미 있는 직무는 이름으로 알아보고 문항을 건드리지 않는다 — 손으로 고쳐
    // 놓은 문장을 밀어내지 않는다.
    const set = await prisma.competencyItemSet.upsert({
      where: {
        formId_kind_name: { formId, kind: "JOB", name: seed.name },
      },
      create: { formId, kind: "JOB", name: seed.name, sortOrder: i },
      update: {},
      select: { id: true },
    });
    await prisma.competencyFormItem.createMany({
      data: seed.items.map((it, n) => ({
        setId: set.id,
        key: it.key,
        area: it.area,
        question: it.question,
        sortOrder: n,
      })),
      skipDuplicates: true,
    });

    const targets = teams.filter(
      (t) =>
        seed.teams.includes(t.name) ||
        (seed.teamNameEndsWith
          ? t.name.endsWith(seed.teamNameEndsWith)
          : false),
    );
    for (const team of targets) {
      // 이미 다른 묶음이 걸린 팀은 건드리지 않는다 — 한 팀에 하나뿐이다.
      await prisma.competencyJobAssignment.upsert({
        where: { formId_teamId: { formId, teamId: team.id } },
        create: { formId, setId: set.id, teamId: team.id },
        update: {},
      });
    }
  }
  done();
}

/** 지난해 양식을 그대로 베껴 온다 — 해마다 처음부터 만들지 않도록. */
export async function copyCompetencyForm(formData: FormData) {
  const targetId = str(formData.get("formId"));
  const sourceYear = Number(str(formData.get("sourceYear")));
  const form = await requireDraft(targetId);
  if (!Number.isInteger(sourceYear))
    throw new Error("가져올 연도를 골라 주세요.");
  if (sourceYear === form.year)
    throw new Error("같은 해끼리는 복사할 수 없습니다.");

  const existing = await prisma.competencyItemSet.count({
    where: { formId: targetId, kind: "JOB" },
  });
  if (existing > 0) {
    throw new Error(
      "이미 직무역량 묶음이 있는 양식입니다. 비운 뒤에 다시 시도해 주세요.",
    );
  }

  const source = await prisma.competencyForm.findUnique({
    where: { year: sourceYear },
    select: {
      sets: {
        select: {
          id: true,
          kind: true,
          name: true,
          sortOrder: true,
          items: {
            select: { key: true, area: true, question: true, sortOrder: true },
          },
        },
      },
      assignments: { select: { setId: true, teamId: true, userId: true } },
    },
  });
  if (!source) throw new Error(`${sourceYear}년 양식이 없습니다.`);

  /*
    문항 열쇠는 그대로 옮긴다 — 열쇠가 이어져야 «작년 이 문항은 몇 점이었나»를
    나란히 놓고 볼 수 있다. 배정(팀 기본값·사람 예외)도 같이 옮긴다: 조직이
    그대로면 해마다 스무 줄을 다시 고르게 할 이유가 없다.
  */
  const newSetByOld = new Map<string, string>();
  for (const set of source.sets) {
    const created = await prisma.competencyItemSet.upsert({
      where: {
        formId_kind_name: { formId: targetId, kind: set.kind, name: set.name },
      },
      create: {
        formId: targetId,
        kind: set.kind,
        name: set.name,
        sortOrder: set.sortOrder,
      },
      update: { sortOrder: set.sortOrder },
      select: { id: true },
    });
    newSetByOld.set(set.id, created.id);
    if (set.items.length > 0) {
      await prisma.competencyFormItem.createMany({
        data: set.items.map((it) => ({ ...it, setId: created.id })),
        skipDuplicates: true,
      });
    }
  }
  for (const a of source.assignments) {
    const setId = newSetByOld.get(a.setId);
    if (!setId) continue;
    await prisma.competencyJobAssignment.create({
      data: { formId: targetId, setId, teamId: a.teamId, userId: a.userId },
    });
  }
  done();
}

/** 평가 시작(문항 잠금) · 작성 중으로 되돌리기 · 종료. */
export async function setCompetencyFormStatus(formId: string, status: string) {
  await requireRole("ADMIN");
  if (!["DRAFT", "OPEN", "CLOSED"].includes(status)) return;
  await prisma.competencyForm.update({
    where: { id: formId },
    data: { status: status as "DRAFT" | "OPEN" | "CLOSED" },
  });
  done();
}

/** 직무역량 묶음 하나 추가. 문항은 빈 다섯 줄로 시작한다. */
export async function createCompetencySet(formData: FormData) {
  const formId = str(formData.get("formId"));
  await requireDraft(formId);
  const name = str(formData.get("name"));
  if (!name) throw new Error("직무 이름을 적어 주세요.");

  const last = await prisma.competencyItemSet.findFirst({
    where: { formId, kind: "JOB" },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  await prisma.competencyItemSet.create({
    data: {
      formId,
      kind: "JOB",
      name,
      sortOrder: (last?.sortOrder ?? 0) + 1,
      items: {
        // 다섯 줄 고정이라 빈 줄을 미리 깔아 둔다 — 「문항 추가」를 다섯 번
        // 누르게 하지 않는다.
        create: Array.from({ length: COMPETENCY_ITEMS_PER_SET }, (_, i) => ({
          key: `job.${name}.${i + 1}`,
          area: "",
          question: "",
          sortOrder: i,
        })),
      },
    },
  });
  done();
}

export async function renameCompetencySet(formData: FormData) {
  const setId = str(formData.get("setId"));
  const name = str(formData.get("name"));
  if (!setId || !name) throw new Error("이름을 적어 주세요.");
  const set = await prisma.competencyItemSet.findUnique({
    where: { id: setId },
    select: { formId: true },
  });
  if (!set) throw new Error("묶음을 찾을 수 없습니다.");
  await requireDraft(set.formId);
  /*
    이름만 바꾼다. 문항 열쇠는 그대로 둔다 — 열쇠에 옛 이름이 남지만, 열쇠를 고치면
    이미 매겨진 점수가 어느 문항 것이었는지 알 수 없게 된다. 열쇠는 사람이 읽는
    값이 아니다.
  */
  await prisma.competencyItemSet.update({
    where: { id: setId },
    data: { name },
  });
  done();
}

export async function deleteCompetencySet(setId: string) {
  const set = await prisma.competencyItemSet.findUnique({
    where: { id: setId },
    select: { formId: true, kind: true },
  });
  if (!set) throw new Error("묶음을 찾을 수 없습니다.");
  await requireDraft(set.formId);
  if (set.kind !== "JOB") {
    throw new Error(
      "핵심가치 묶음은 지울 수 없습니다 — 전 직원이 쓰는 두 벌입니다.",
    );
  }
  await prisma.competencyItemSet.delete({ where: { id: setId } });
  done();
}

/**
 * 묶음의 다섯 문항을 한 번에 저장한다 — 표 한 장이 폼 하나다.
 *
 * 다섯 줄 고정이라 줄을 더하거나 빼지 않는다. 빈 줄을 남겨 두면 평가 화면에
 * 이름 없는 칸이 뜨므로, 저장할 때 다섯 줄이 다 찼는지 확인한다.
 */
export async function saveCompetencySetItems(formData: FormData) {
  const setId = str(formData.get("setId"));
  const set = await prisma.competencyItemSet.findUnique({
    where: { id: setId },
    select: {
      formId: true,
      items: { orderBy: { sortOrder: "asc" }, select: { id: true } },
    },
  });
  if (!set) throw new Error("묶음을 찾을 수 없습니다.");
  await requireDraft(set.formId);

  const rows = set.items.map((it) => ({
    id: it.id,
    area: str(formData.get(`area:${it.id}`)),
    question: str(formData.get(`question:${it.id}`)),
  }));
  const blank = rows.filter((r) => !r.area || !r.question).length;
  if (blank > 0) {
    throw new Error(
      `영역과 질문을 모두 채워 주세요 — ${blank}줄이 비어 있습니다.`,
    );
  }
  for (const r of rows) {
    await prisma.competencyFormItem.update({
      where: { id: r.id },
      data: { area: r.area, question: r.question },
    });
  }
  done();
}

/**
 * 팀의 기본 직무를 정한다. 빈 값을 고르면 배정을 지운다(미배정으로 돌아간다).
 *
 * 배정은 평가가 시작된 뒤에도 바꿀 수 있다 — 사람이 부서를 옮기거나 직무가 바뀌는
 * 일은 평가 기간에도 생기고, 문항을 고치는 것과 달리 이미 매긴 점수를 흔들지 않는다.
 */
export async function setTeamJobSet(formData: FormData) {
  await requireRole("ADMIN");
  const formId = str(formData.get("formId"));
  const teamId = str(formData.get("teamId"));
  const setId = str(formData.get("setId"));
  if (!formId || !teamId) return;

  if (!setId) {
    await prisma.competencyJobAssignment.deleteMany({
      where: { formId, teamId },
    });
  } else {
    await prisma.competencyJobAssignment.upsert({
      where: { formId_teamId: { formId, teamId } },
      create: { formId, setId, teamId },
      update: { setId },
    });
  }
  done();
}

/** 한 사람의 직무를 팀 기본값과 다르게 정한다. 빈 값이면 예외를 지운다. */
export async function setUserJobSet(formData: FormData) {
  await requireRole("ADMIN");
  const formId = str(formData.get("formId"));
  const userId = str(formData.get("userId"));
  const setId = str(formData.get("setId"));
  if (!formId || !userId) return;

  if (!setId) {
    await prisma.competencyJobAssignment.deleteMany({
      where: { formId, userId },
    });
  } else {
    await prisma.competencyJobAssignment.upsert({
      where: { formId_userId: { formId, userId } },
      create: { formId, setId, userId },
      update: { setId },
    });
  }
  done();
}

/**
 * 역량평가에서 팀을 통째로 빼거나 되돌린다.
 *
 * 비서실처럼 시스템 밖에서 따로 처리하는 조직을 한 줄로 정리하는 자리다. 빼도
 * 이미 매긴 점수는 지우지 않는다 — 되돌리면 그대로 다시 보인다.
 */
export async function setTeamCompetencyExcluded(formData: FormData) {
  await requireRole("ADMIN");
  const formId = str(formData.get("formId"));
  const teamId = str(formData.get("teamId"));
  const excluded = str(formData.get("excluded")) === "1";
  const reason = str(formData.get("reason")) || null;
  if (!formId || !teamId) return;

  if (!excluded) {
    await prisma.competencyTarget.deleteMany({ where: { formId, teamId } });
  } else {
    await prisma.competencyTarget.upsert({
      where: { formId_teamId: { formId, teamId } },
      create: { formId, teamId, included: false, reason },
      update: { included: false, reason },
    });
  }
  done();
}

/** 한 사람을 빼거나 되돌린다. 사람 줄이 팀 줄을 이긴다. */
export async function setUserCompetencyExcluded(formData: FormData) {
  await requireRole("ADMIN");
  const formId = str(formData.get("formId"));
  const userId = str(formData.get("userId"));
  const state = str(formData.get("state")); // "" | "out" | "in"
  const reason = str(formData.get("reason")) || null;
  if (!formId || !userId) return;

  if (state === "out") {
    await prisma.competencyTarget.upsert({
      where: { formId_userId: { formId, userId } },
      create: { formId, userId, included: false, reason },
      update: { included: false, reason },
    });
  } else if (state === "in") {
    // 팀이 통째로 빠져 있어도 이 사람만 대상으로 되돌린다.
    await prisma.competencyTarget.upsert({
      where: { formId_userId: { formId, userId } },
      create: { formId, userId, included: true, reason },
      update: { included: true, reason },
    });
  } else {
    // 사람 줄을 지우면 팀 기본값을 따른다.
    await prisma.competencyTarget.deleteMany({ where: { formId, userId } });
  }
  done();
}
