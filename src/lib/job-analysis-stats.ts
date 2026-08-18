import { normalizeName } from "@/lib/job-analysis-fields";

export type DuplicateTask = {
  /** 대표 표기(가장 처음 나온 원문). */
  name: string;
  teamNames: string[];
};

/**
 * 여러 팀에 같은 단위업무명이 걸려 있는 건을 찾는다. 직무 재정비의 첫
 * 질문이 "이 업무 누가 하는 게 맞나"이므로, 중복 자체가 결론은 아니고
 * 검토 대상 목록이다 — 실제로 분리 수행이 맞는 업무(예: 각 팀의 '예산관리')도
 * 여기 걸린다.
 */
export function findDuplicateTasks(
  tasks: { name: string; teamName: string }[]
): DuplicateTask[] {
  const byKey = new Map<string, { name: string; teamNames: Set<string> }>();

  for (const task of tasks) {
    const key = normalizeName(task.name);
    if (!key) continue;
    const entry = byKey.get(key);
    if (entry) entry.teamNames.add(task.teamName);
    else byKey.set(key, { name: task.name, teamNames: new Set([task.teamName]) });
  }

  return [...byKey.values()]
    .filter((e) => e.teamNames.size > 1)
    .map((e) => ({ name: e.name, teamNames: [...e.teamNames].sort() }))
    .sort((a, b) => b.teamNames.length - a.teamNames.length || a.name.localeCompare(b.name));
}
