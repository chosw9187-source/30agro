"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";

/**
 * **최종등급 확인** — 배포된 결과를 받은 사람이 «합의하거나, 이의를 제기하는» 칸.
 *
 * 등급 · 점수와 고르개를 한 칸에 둔다. 예전에는 결과지 맨 위에 단추 두 개짜리
 * 띠가 있고, 최종등급은 그 아래 「1. 결과 요약」에, 이의 사유를 적는 칸은 화면
 * 한참 아래 「5. 이의신청」에 따로 있었다 — 눌렀을 때 «무엇에 동의한 것인지»가
 * 한 화면에 같이 남지 않았다. 고르는 일과 고를 대상을 붙여 놓는다.
 *
 * 저장되는 자리는 예전과 같다(`EvalAppeal` 한 줄) — 합의 시각 · 사유 · 인사팀
 * 답변. 한 해에 한 사람 한 건이고, 뜻은 둘 중 하나다: 합의했거나, 이의를 냈거나.
 *
 * 날짜는 **서버에서 적어 넘긴다**. 여기서 `toLocaleDateString`을 부르면 서버와
 * 브라우저의 설정이 달라 처음 그린 글자가 어긋난다.
 */
export type ResultAckState = "none" | "agreed" | "open" | "answered";

export function ResultAckCard({
  cardClass,
  inputClass,
  year,
  grade,
  gradeClass,
  scoreLine,
  totalLabel,
  releasedLabel,
  state,
  agreedLabel,
  appliedLabel,
  answeredLabel,
  reason,
  answer,
  agreeAction,
  cancelAction,
  appealAction,
}: {
  cardClass: string;
  inputClass: string;
  year: number;
  /** 배포 뒤이므로 보통 등급이 있다. 인사팀이 아직 안 매겼으면 null. */
  grade: string | null;
  gradeClass: string;
  /** 「성과 96 (60%) · 역량 90 (40%)」 — 서버에서 적어 넘긴다. */
  scoreLine: string;
  totalLabel: string;
  releasedLabel: string;
  state: ResultAckState;
  agreedLabel: string | null;
  appliedLabel: string | null;
  answeredLabel: string | null;
  reason: string | null;
  answer: string | null;
  agreeAction: (formData: FormData) => Promise<unknown>;
  cancelAction: (formData: FormData) => Promise<unknown>;
  appealAction: (formData: FormData) => Promise<unknown>;
}) {
  const [pick, setPick] = useState<"agree" | "appeal" | null>(null);

  const badge =
    state === "agreed"
      ? ["bg-brand-green-light text-brand-green-dark", "합의 완료"]
      : state === "answered"
        ? ["bg-goal-4/10 text-goal-4", "이의 · 답변 완료"]
        : state === "open"
          ? ["bg-amber-100 text-amber-800", "이의 접수"]
          : ["bg-amber-100 text-amber-800", "아직 고르지 않았습니다"];

  /** 고르개 한 칸 — 고른 쪽만 테가 진해진다. */
  const tile = (
    key: "agree" | "appeal",
    title: string,
    help: string,
    tone: string,
  ) => {
    const on = pick === key;
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => setPick(key)}
        className={`rounded-lg border p-3 text-left transition-colors ${
          on
            ? `border-2 ${tone}`
            : "border-slate-300 bg-white hover:bg-slate-50"
        }`}
      >
        <span
          className={`flex items-center gap-2 text-sm font-semibold ${
            on ? "" : "text-slate-700"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full ${
              on ? "border-[5px]" : "border border-slate-400"
            }`}
          />
          {title}
        </span>
        <span className="mt-1 block pl-5.5 text-xs break-keep text-slate-500">
          {help}
        </span>
      </button>
    );
  };

  /** 접수된 이의가 어디까지 왔는지 — 접수 → 인사팀 검토 → 답변. */
  const steps = (answered: boolean) => (
    <div className="flex flex-wrap items-center gap-1">
      {(
        [
          ["접수", true],
          ["인사팀 검토", true],
          ["답변", answered],
        ] as const
      ).map(([label, on], i) => (
        <span key={label} className="flex items-center">
          {i > 0 && <span className="mx-1 text-xs text-slate-300">›</span>}
          <span
            className={`rounded-md px-2 py-0.5 text-[11px] whitespace-nowrap ${
              on
                ? "bg-goal-4/10 font-medium text-goal-4"
                : "bg-slate-100 text-slate-400"
            }`}
          >
            {label}
          </span>
        </span>
      ))}
    </div>
  );

  const reasonBox = (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] text-slate-400">{appliedLabel} 접수</p>
      <p className="text-sm leading-relaxed break-keep whitespace-pre-wrap text-slate-700">
        {reason}
      </p>
      {state === "answered" && (
        <div className="border-t border-slate-200 pt-2">
          <p className="text-[11px] font-medium text-goal-4">
            인사팀 답변{answeredLabel ? ` · ${answeredLabel}` : ""}
          </p>
          <p className="mt-1 text-sm leading-relaxed break-keep whitespace-pre-wrap text-slate-700">
            {answer}
          </p>
        </div>
      )}
    </div>
  );

  return (
    <section id="eval-ack" className={`${cardClass} scroll-mt-4`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
        <h2 className="text-sm font-bold whitespace-nowrap text-slate-900">
          최종등급 확인
        </h2>
        <span className="text-xs break-keep text-slate-500">
          {year}년 · {releasedLabel} 배포
        </span>
        <span
          className={`ml-auto rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap ${badge[0]}`}
        >
          {badge[1]}
        </span>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3">
        {/* 무엇에 대한 선택인지를 고르개 바로 위에 세운다. */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
          {grade ? (
            <span
              className={`rounded-lg px-3 py-1.5 text-2xl leading-none font-bold ${gradeClass}`}
            >
              {grade}
            </span>
          ) : (
            <span className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-medium text-slate-500">
              등급 미정
            </span>
          )}
          <span className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{totalLabel}</p>
            <p className="text-xs break-keep text-slate-500">{scoreLine}</p>
          </span>
        </div>

        {state === "none" && (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {tile(
                "agree",
                "이 등급에 합의합니다",
                "결과를 확인했고 더 볼 것이 없습니다.",
                "border-brand-green bg-brand-green-light/40 text-brand-green-dark",
              )}
              {tile(
                "appeal",
                "이의를 제기합니다",
                "다시 봐 주셨으면 하는 점을 적습니다.",
                "border-goal-4 bg-goal-4/5 text-goal-4",
              )}
            </div>

            {pick === null && (
              <p className="text-xs break-keep text-slate-400">
                둘 중 하나를 골라 주세요 — 고르기 전에는 인사팀 명단에
                「미확인」으로 남습니다.
              </p>
            )}

            {pick === "agree" && (
              <ActionForm
                action={agreeAction}
                successMessage="최종등급에 합의하셨습니다."
                confirmMessage="이 등급에 합의하시겠습니까? 인사팀 명단에 «합의»로 표시됩니다."
                className="flex flex-wrap items-center gap-3 rounded-lg border border-brand-green/40 px-3 py-2.5"
              >
                <button
                  type="submit"
                  className="rounded-md bg-brand-green px-4 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-brand-green-dark"
                >
                  합의 제출
                </button>
                <span className="text-xs break-keep text-slate-500">
                  제출한 뒤에도 「합의 취소」로 되돌릴 수 있습니다.
                </span>
              </ActionForm>
            )}

            {pick === "appeal" && (
              <ActionForm
                action={appealAction}
                successMessage="이의를 접수했습니다."
                className="flex flex-col gap-2 rounded-lg border border-goal-4/40 px-3 py-2.5"
              >
                <input type="hidden" name="year" value={year} />
                <label className="text-xs font-medium text-slate-600">
                  이의 사유 <span className="text-slate-400">(필수)</span>
                </label>
                <textarea
                  name="reason"
                  rows={3}
                  required
                  placeholder="예: 하반기 3번 목표의 달성률이 실제와 다릅니다 — 8월에 완료한 건이 반영되지 않은 것 같습니다."
                  className={inputClass}
                />
                <span className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    className="rounded-md bg-goal-4 px-4 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-goal-4/90"
                  >
                    이의 제출
                  </button>
                  <span className="text-[11px] break-keep text-slate-400">
                    인사팀이 답하기 전까지는 고칠 수 있습니다 · 점수가 어떻게
                    나왔는지는 아래 「등급 근거」와 「성과평가 상세」에 적혀
                    있습니다.
                  </span>
                </span>
              </ActionForm>
            )}
          </>
        )}

        {state === "agreed" && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-sm break-keep text-slate-700">
              {agreedLabel}{" "}
              <b className="font-semibold text-slate-900">
                {grade ? `${grade} 등급` : "최종등급"}
              </b>
              에 합의하셨습니다.
            </p>
            <ActionForm
              action={cancelAction}
              successMessage="합의를 거두었습니다."
              className="ml-auto shrink-0"
            >
              <button
                type="submit"
                className="text-xs text-slate-500 underline hover:text-slate-700"
              >
                합의 취소
              </button>
            </ActionForm>
          </div>
        )}

        {(state === "open" || state === "answered") && (
          <>
            {steps(state === "answered")}
            {reasonBox}
            {state === "answered" ? (
              <p className="text-xs break-keep text-slate-500">
                답변이 달린 이의는 화면에서 고칠 수 없습니다 — 더 하실 말씀은
                인사팀에 직접 전해 주세요.
              </p>
            ) : (
              <>
                <p className="text-xs break-keep text-slate-500">
                  인사팀이 확인하고 있습니다 — 답변이 달리면 위 사유 아래에
                  그대로 실립니다.
                </p>
                {/*
                  고치는 칸은 접어 둔다 — 펼쳐 두면 접수된 사유가 위아래로 두 번
                  적혀, 어느 것이 보낸 글인지 헷갈린다.
                */}
                <details className="rounded-lg border border-slate-200 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-medium text-slate-600">
                    사유 고치기
                  </summary>
                  <ActionForm
                    action={appealAction}
                    successMessage="이의 사유를 고쳤습니다."
                    className="mt-2 flex flex-col gap-2"
                  >
                    <input type="hidden" name="year" value={year} />
                    <label className="sr-only">이의 사유</label>
                    <textarea
                      name="reason"
                      rows={3}
                      required
                      defaultValue={reason ?? ""}
                      className={inputClass}
                    />
                    <span className="flex flex-wrap items-center gap-3">
                      <button
                        type="submit"
                        className="rounded-md bg-goal-4 px-4 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-goal-4/90"
                      >
                        고쳐서 다시 보내기
                      </button>
                    </span>
                  </ActionForm>
                </details>
                {/* 이의를 거두는 길 — 합의를 누르면 접수된 이의는 함께 거둬진다. */}
                <ActionForm
                  action={agreeAction}
                  successMessage="최종등급에 합의하셨습니다."
                  confirmMessage="이의를 거두고 이 등급에 합의하시겠습니까? 적어 두신 사유는 지워집니다."
                >
                  <button
                    type="submit"
                    className="text-xs text-slate-500 underline hover:text-slate-700"
                  >
                    이의를 거두고 합의하기
                  </button>
                </ActionForm>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
