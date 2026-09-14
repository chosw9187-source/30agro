import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ActionForm } from "@/components/action-form";
import { activePrismaWhere } from "@/lib/hr-analytics";
import { POSITION_LABEL } from "@/lib/permission-constants";
import {
  COMPETENCY_ITEMS_PER_SET,
  COMPETENCY_SCALE,
  isCompetencyTarget,
  coreKindFor,
} from "@/lib/competency";
import {
  loadCompetencyForm,
  competencyFormEditable,
  COMPETENCY_FORM_STATUS_LABEL,
  COMPETENCY_SET_KIND_LABEL,
} from "@/lib/competency-form";
import {
  createCompetencyForm,
  copyCompetencyForm,
  seedCompetencyForm,
  setCompetencyFormStatus,
  createCompetencySet,
  renameCompetencySet,
  deleteCompetencySet,
  saveCompetencySetItems,
  setTeamJobSet,
  setUserJobSet,
} from "./actions";
import { JobSetSelect } from "./job-set-select";

export const dynamic = "force-dynamic";

const CARD = "rounded-xl border border-slate-200 bg-white shadow-sm";
const INPUT =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-green focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";
const BTN =
  "rounded-md bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-brand-green-dark";
const BTN_GHOST =
  "rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50";

/**
 * 역량평가 문항 관리 — 인사팀이 해마다 질문지를 갈아 끼우는 자리.
 *
 * 화면은 세 덩어리다.
 *   ① 연도판 — 만들고, 지난해 것을 베끼고, 평가를 시작(문항 잠금)한다.
 *   ② 문항 — 핵심가치 두 벌(팀원용·팀장용)과 직무역량 여러 벌, 각 다섯 줄.
 *   ③ 배정 — 팀마다 기본 직무를 고르고, 다른 직무인 사람만 따로 지정한다.
 *
 * ③을 팀과 사람 두 층으로 둔 이유는 사내 양식이 그렇게 생겼기 때문이다 — 관리팀
 * 하나에 환경안전·일반·출고 세 직무가 있고, 지점 열한 곳은 한 벌을 함께 쓴다.
 */
export default async function CompetencyFormAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; open?: string }>;
}) {
  const params = await searchParams;

  const forms = await prisma.competencyForm.findMany({
    orderBy: { year: "desc" },
    select: { id: true, year: true, status: true },
  });
  const thisYear = new Date().getFullYear();
  const year = params.year ? Number(params.year) : (forms[0]?.year ?? thisYear);
  const form = await loadCompetencyForm(year);
  const editable = form ? competencyFormEditable(form.status) : false;

  const [teams, people] = await Promise.all([
    prisma.team.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, division: true, businessUnit: true },
    }),
    prisma.user.findMany({
      where: activePrismaWhere(),
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        position: true,
        teamId: true,
        team: { select: { name: true } },
      },
    }),
  ]);

  const jobSets = (form?.sets ?? []).filter((s) => s.kind === "JOB");
  const coreSets = (form?.sets ?? []).filter((s) => s.kind !== "JOB");
  const jobOptions = jobSets.map((s) => ({ value: s.id, label: s.name }));
  const setById = new Map((form?.sets ?? []).map((s) => [s.id, s]));

  const teamAssign = new Map(
    (form?.assignments ?? [])
      .filter((a) => a.teamId)
      .map((a) => [a.teamId!, a.setId]),
  );
  const userAssign = new Map(
    (form?.assignments ?? [])
      .filter((a) => a.userId)
      .map((a) => [a.userId!, a.setId]),
  );

  /*
    역량평가를 받는 사람(담당·팀장)만 센다. 책임·운영책임·사장은 대상이 아니라
    직무를 배정할 필요가 없다.
  */
  const targets = people.filter((p) => isCompetencyTarget(p.position));
  const unassigned = targets.filter(
    (p) => !userAssign.has(p.id) && !(p.teamId && teamAssign.has(p.teamId)),
  );
  const emptySets = jobSets.filter((s) =>
    s.items.some((i) => !i.area || !i.question),
  );
  const coreEmpty = coreSets.filter((s) => s.items.length === 0);

  const openSetId = params.open ?? null;

  function yearHref(y: number) {
    return `/admin/competency?year=${y}`;
  }
  function openHref(setId: string | null) {
    const qs = new URLSearchParams({ year: String(year) });
    if (setId) qs.set("open", setId);
    return `/admin/competency?${qs.toString()}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">역량평가 문항</h1>
        <p className="mt-1 text-sm break-keep text-slate-600">
          해마다 바뀌는 질문지를 여기서 갈아 끼웁니다. 핵심가치는
          직책(담당·팀장)이 정하고, 직무역량은 팀마다 기본 직무를 고른 뒤 다른
          직무인 사람만 따로 지정합니다. <b>평가를 시작하면 문항이 잠깁니다.</b>
        </p>
      </div>

      {/* ① 연도판 */}
      <section className={`${CARD} flex flex-col gap-3 p-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">연도</span>
          {forms.map((f) => (
            <Link
              key={f.id}
              href={yearHref(f.year)}
              className={`rounded-full px-3 py-1 text-xs ${
                f.year === year
                  ? "bg-brand-green text-white"
                  : "border border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {f.year}년
              <span className="ml-1 opacity-75">
                {COMPETENCY_FORM_STATUS_LABEL[f.status]}
              </span>
            </Link>
          ))}
          <ActionForm
            action={createCompetencyForm}
            successMessage="양식을 만들었습니다."
            className="ml-auto flex items-center gap-2"
          >
            <input
              type="number"
              name="year"
              defaultValue={thisYear}
              min={2000}
              max={2100}
              className="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
            <button type="submit" className={BTN_GHOST}>
              연도판 만들기
            </button>
          </ActionForm>
        </div>

        {!form ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
            {year}년 양식이 없습니다. 오른쪽 위에서 연도를 적고 「연도판
            만들기」를 눌러 주세요.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className="text-sm text-slate-600">
              {form.year}년 ·{" "}
              <b className="font-semibold text-slate-900">
                {COMPETENCY_FORM_STATUS_LABEL[form.status]}
              </b>
              <span className="ml-2 text-xs text-slate-500">
                직무역량 {jobSets.length}벌 · 문항{" "}
                {form.sets.reduce((n, s) => n + s.items.length, 0)}개
              </span>
            </span>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {editable && jobSets.length === 0 && (
                <>
                  <ActionForm
                    action={seedCompetencyForm.bind(null, form.id)}
                    successMessage="사내 양식 내용을 넣었습니다."
                  >
                    <button type="submit" className={BTN}>
                      사내 양식으로 채우기
                    </button>
                  </ActionForm>
                  {forms.filter((f) => f.year !== year).length > 0 && (
                    <ActionForm
                      action={copyCompetencyForm}
                      successMessage="지난 양식을 베껴 왔습니다."
                      className="flex items-center gap-1"
                    >
                      <input type="hidden" name="formId" value={form.id} />
                      <select
                        name="sourceYear"
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                      >
                        {forms
                          .filter((f) => f.year !== year)
                          .map((f) => (
                            <option key={f.id} value={f.year}>
                              {f.year}년
                            </option>
                          ))}
                      </select>
                      <button type="submit" className={BTN_GHOST}>
                        베껴 오기
                      </button>
                    </ActionForm>
                  )}
                </>
              )}
              {editable ? (
                <ActionForm
                  action={setCompetencyFormStatus.bind(null, form.id, "OPEN")}
                  successMessage="평가를 시작했습니다. 이제 문항은 잠깁니다."
                  confirmMessage="평가를 시작하면 문항을 고칠 수 없습니다. 진행할까요?"
                >
                  <button type="submit" className={BTN}>
                    평가 시작 (문항 잠금)
                  </button>
                </ActionForm>
              ) : (
                <ActionForm
                  action={setCompetencyFormStatus.bind(null, form.id, "DRAFT")}
                  successMessage="작성 중으로 되돌렸습니다."
                  confirmMessage="문항을 다시 고칠 수 있게 됩니다. 평가 중이라면 사람마다 다른 양식으로 평가받을 수 있습니다. 진행할까요?"
                >
                  <button type="submit" className={BTN_GHOST}>
                    작성 중으로 되돌리기
                  </button>
                </ActionForm>
              )}
            </div>
          </div>
        )}
      </section>

      {form && (
        <>
          {/* 못 채운 것들을 먼저 알린다 — 화면 아래까지 내려가 찾게 하지 않는다. */}
          {(unassigned.length > 0 ||
            emptySets.length > 0 ||
            coreEmpty.length > 0) && (
            <section
              className={`${CARD} flex flex-col gap-1 border-status-critical/40 p-4`}
            >
              <h2 className="text-sm font-semibold text-status-critical">
                아직 채워야 할 것
              </h2>
              {coreEmpty.map((s) => (
                <p key={s.id} className="text-sm break-keep text-slate-600">
                  · <b>{COMPETENCY_SET_KIND_LABEL[s.kind]}</b> 문항이 비어
                  있습니다 — 이 직책의 사람들에게 핵심가치가 뜨지 않습니다.
                </p>
              ))}
              {emptySets.map((s) => (
                <p key={s.id} className="text-sm break-keep text-slate-600">
                  · 직무 <b>{s.name}</b>에 빈 줄이 있습니다.
                </p>
              ))}
              {unassigned.length > 0 && (
                <p className="text-sm break-keep text-slate-600">
                  · 직무가 배정되지 않은 사람 <b>{unassigned.length}명</b> —{" "}
                  {unassigned
                    .slice(0, 6)
                    .map((p) => `${p.name}(${p.team?.name ?? "무소속"})`)
                    .join(" · ")}
                  {unassigned.length > 6 && ` 외 ${unassigned.length - 6}명`}
                </p>
              )}
            </section>
          )}

          {/* ② 문항 */}
          <section className={CARD}>
            <div className="flex flex-wrap items-center gap-2 px-4 py-2">
              <h2 className="text-sm font-bold text-slate-900">문항</h2>
              <span className="text-xs text-slate-500">
                묶음마다 {COMPETENCY_ITEMS_PER_SET}문항 고정
              </span>
              {!editable && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                  평가 중이라 잠겨 있습니다
                </span>
              )}
              {editable && (
                <ActionForm
                  action={createCompetencySet}
                  successMessage="직무를 추가했습니다. 문항을 채워 주세요."
                  className="ml-auto flex items-center gap-1"
                >
                  <input type="hidden" name="formId" value={form.id} />
                  <input
                    name="name"
                    placeholder="직무 이름 (예: 물류팀)"
                    required
                    className="w-44 rounded-md border border-slate-300 px-2 py-1 text-xs"
                  />
                  <button type="submit" className={BTN_GHOST}>
                    직무 추가
                  </button>
                </ActionForm>
              )}
            </div>

            <div className="flex flex-col divide-y divide-slate-100 border-t border-slate-100">
              {[...coreSets, ...jobSets].map((set) => {
                const isOpen = openSetId === set.id;
                const filled = set.items.filter(
                  (i) => i.area && i.question,
                ).length;
                const usedByTeams = teams.filter(
                  (t) => teamAssign.get(t.id) === set.id,
                );
                const usedByPeople = targets.filter(
                  (p) => userAssign.get(p.id) === set.id,
                );
                return (
                  <div key={set.id} className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Link
                        href={openHref(isOpen ? null : set.id)}
                        className="text-sm font-medium text-slate-800 hover:text-brand-green"
                      >
                        {isOpen ? "▼" : "▶"}{" "}
                        {set.kind === "JOB"
                          ? set.name
                          : COMPETENCY_SET_KIND_LABEL[set.kind]}
                      </Link>
                      <span
                        className={`text-xs ${
                          filled === COMPETENCY_ITEMS_PER_SET
                            ? "text-slate-500"
                            : "font-medium text-status-critical"
                        }`}
                      >
                        {filled}/{COMPETENCY_ITEMS_PER_SET}문항
                      </span>
                      {set.kind === "JOB" && (
                        <span className="text-xs text-slate-500">
                          {usedByTeams.length > 0
                            ? `기본 직무: ${usedByTeams.map((t) => t.name).join(" · ")}`
                            : usedByPeople.length === 0
                              ? "아직 아무에게도 안 씌웠습니다"
                              : ""}
                          {usedByPeople.length > 0 &&
                            ` / 사람 지정 ${usedByPeople.length}명`}
                        </span>
                      )}
                      {editable && set.kind === "JOB" && (
                        <span className="ml-auto flex items-center gap-2">
                          <ActionForm
                            action={renameCompetencySet}
                            successMessage="이름을 바꿨습니다."
                            className="flex items-center gap-1"
                          >
                            <input type="hidden" name="setId" value={set.id} />
                            <input
                              name="name"
                              defaultValue={set.name}
                              className="w-36 rounded-md border border-slate-300 px-2 py-1 text-xs"
                            />
                            <button type="submit" className={BTN_GHOST}>
                              이름 저장
                            </button>
                          </ActionForm>
                          <ActionForm
                            action={deleteCompetencySet.bind(null, set.id)}
                            successMessage="직무를 지웠습니다."
                            confirmMessage={`「${set.name}」 직무와 그 문항을 지울까요? 되돌릴 수 없습니다.`}
                          >
                            <button
                              type="submit"
                              className="rounded-md border border-status-critical/40 px-2 py-1 text-xs text-status-critical hover:bg-status-critical/5"
                            >
                              삭제
                            </button>
                          </ActionForm>
                        </span>
                      )}
                    </div>

                    {isOpen && (
                      <ActionForm
                        action={saveCompetencySetItems}
                        successMessage="문항을 저장했습니다."
                        successHref={openHref(null)}
                        className="mt-2 flex flex-col gap-2"
                      >
                        <input type="hidden" name="setId" value={set.id} />
                        {set.items.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm break-keep text-slate-500">
                            문항이 비어 있습니다. 「사내 양식으로 채우기」나
                            「베껴 오기」를 쓰거나, 직무를 지우고 다시 추가하면
                            빈 다섯 줄이 깔립니다.
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[620px] text-sm">
                              <thead className="bg-slate-100 text-slate-600">
                                <tr>
                                  <th className="w-10 px-2 py-1 text-left text-xs font-semibold">
                                    #
                                  </th>
                                  <th className="w-48 px-2 py-1 text-left text-xs font-semibold">
                                    영역
                                  </th>
                                  <th className="px-2 py-1 text-left text-xs font-semibold">
                                    질문
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {set.items.map((item, i) => (
                                  <tr
                                    key={item.id}
                                    className="border-t border-slate-100 align-top"
                                  >
                                    <td className="px-2 py-1.5 text-xs text-slate-400">
                                      {i + 1}
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <input
                                        key={`a:${item.id}:${item.area}`}
                                        name={`area:${item.id}`}
                                        defaultValue={item.area}
                                        disabled={!editable}
                                        placeholder="예: 문제해결"
                                        className={INPUT}
                                      />
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <textarea
                                        key={`q:${item.id}:${item.question}`}
                                        name={`question:${item.id}`}
                                        defaultValue={item.question}
                                        disabled={!editable}
                                        rows={2}
                                        placeholder="…하는가?"
                                        className={INPUT}
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {editable && set.items.length > 0 && (
                          <div className="flex items-center gap-3">
                            <span className="text-xs break-keep text-slate-500">
                              다섯 줄을 모두 채워야 저장됩니다.
                            </span>
                            <button type="submit" className={`ml-auto ${BTN}`}>
                              문항 저장
                            </button>
                          </div>
                        )}
                      </ActionForm>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ③ 배정 — 팀 기본값 */}
          <section className={CARD}>
            <div className="flex flex-wrap items-baseline gap-x-3 px-4 py-2">
              <h2 className="text-sm font-bold text-slate-900">
                팀별 기본 직무
              </h2>
              <span className="text-xs break-keep text-slate-500">
                그 팀 사람들이 기본으로 받을 직무역량입니다. 팀에 직무가 하나인
                곳은 여기까지만 정하면 됩니다.
              </span>
            </div>
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-3 py-1 text-left text-xs font-semibold">
                      팀
                    </th>
                    <th className="w-40 px-3 py-1 text-left text-xs font-semibold">
                      본부 · 부문
                    </th>
                    <th className="w-64 px-3 py-1 text-left text-xs font-semibold">
                      기본 직무
                    </th>
                    <th className="w-20 px-3 py-1 text-left text-xs font-semibold">
                      인원
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((t, i) => {
                    const headcount = targets.filter(
                      (p) => p.teamId === t.id,
                    ).length;
                    return (
                      <tr
                        key={t.id}
                        className={`border-t border-slate-100 ${
                          i % 2 === 1 ? "bg-slate-50/70" : ""
                        }`}
                      >
                        <td className="px-3 py-1.5 font-medium text-slate-800">
                          {t.name}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-slate-500">
                          {[t.businessUnit, t.division]
                            .filter(Boolean)
                            .join(" · ")}
                        </td>
                        <td className="px-3 py-1.5">
                          <JobSetSelect
                            action={setTeamJobSet}
                            formId={form.id}
                            scopeName="teamId"
                            scopeId={t.id}
                            value={teamAssign.get(t.id) ?? ""}
                            options={jobOptions}
                            emptyLabel="미배정"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-xs tabular-nums text-slate-500">
                          {headcount}명
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* ③ 배정 — 사람 예외 */}
          <section className={CARD}>
            <div className="flex flex-wrap items-baseline gap-x-3 px-4 py-2">
              <h2 className="text-sm font-bold text-slate-900">
                사람별 직무 (팀 기본값과 다를 때만)
              </h2>
              <span className="text-xs break-keep text-slate-500">
                한 팀에 직무가 여럿인 곳 — 관리팀의 환경안전·출고, 생산팀의
                관리, 경영지원팀의 법무·IT처럼 — 만 여기서 바꿉니다.
              </span>
            </div>
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-3 py-1 text-left text-xs font-semibold">
                      이름
                    </th>
                    <th className="w-32 px-3 py-1 text-left text-xs font-semibold">
                      팀
                    </th>
                    <th className="w-28 px-3 py-1 text-left text-xs font-semibold">
                      핵심가치
                    </th>
                    <th className="w-64 px-3 py-1 text-left text-xs font-semibold">
                      직무역량
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {targets.map((p, i) => {
                    const teamDefault = p.teamId
                      ? teamAssign.get(p.teamId)
                      : undefined;
                    const mine = userAssign.get(p.id);
                    const effective = mine ?? teamDefault;
                    return (
                      <tr
                        key={p.id}
                        className={`border-t border-slate-100 ${
                          i % 2 === 1 ? "bg-slate-50/70" : ""
                        }`}
                      >
                        <td className="px-3 py-1.5 font-medium whitespace-nowrap text-slate-800">
                          {p.name}{" "}
                          <span className="text-xs font-normal text-slate-500">
                            {POSITION_LABEL[p.position]}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-xs text-slate-500">
                          {p.team?.name ?? "무소속"}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-slate-500">
                          {coreKindFor(p.position) === "CORE_LEADER"
                            ? "팀장용"
                            : "팀원용"}
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <JobSetSelect
                              action={setUserJobSet}
                              formId={form.id}
                              scopeName="userId"
                              scopeId={p.id}
                              value={mine ?? ""}
                              options={jobOptions}
                              emptyLabel={
                                teamDefault
                                  ? `팀 기본값 (${setById.get(teamDefault)?.name ?? "?"})`
                                  : "미배정"
                              }
                            />
                            {!effective && (
                              <span className="text-xs font-medium text-status-critical">
                                직무역량이 뜨지 않습니다
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* 평가스케일은 해마다 같아서 고치는 칸을 두지 않는다 — 읽기만 한다. */}
          <details className={CARD}>
            <summary className="cursor-pointer list-none px-4 py-2 text-sm font-bold text-slate-900 [&::-webkit-details-marker]:hidden">
              평가스케일 정의
              <span className="ml-2 text-xs font-normal text-slate-400">
                해마다 같아서 고치지 않습니다 · 눌러서 보기
              </span>
            </summary>
            <ul className="flex flex-col gap-1 border-t border-slate-100 px-4 py-2">
              {COMPETENCY_SCALE.map((r) => (
                <li key={r.score} className="text-xs break-keep text-slate-600">
                  <b className="text-slate-800">
                    {r.score} ({r.label})
                  </b>{" "}
                  · {r.points} · {r.definition}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
