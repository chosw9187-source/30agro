/**
 * 평가 진행 현황 — **일감마다 얼마나 찼는가**.
 *
 * 처음에는 벤 다이어그램으로 그렸다. 겹치는 칸이 조합별 인원을 말해 주기는 하는데,
 * 정작 «지금 무엇이 제일 덜 됐나»를 읽으려면 일곱 칸을 눈으로 더해야 했다. 이
 * 화면이 답해야 하는 물음은 하나다: **어느 일감이 남았고 몇 명 남았는가.**
 *
 * 그래서 일감마다 한 줄, 찬 만큼의 막대다(같은 초록 한 색 — 서로 다른 무리가
 * 아니라 같은 일의 많고 적음이라 색을 나눌 이유가 없다). 숫자는 막대 옆에 그대로
 * 적는다: 「14 / 17명 · 3명 남음」. 막대는 눈으로 견주는 용도이고, 판단은 숫자로
 * 한다.
 */

export type EvalProgressBar = {
  label: string;
  /** 그 일을 끝낸 사람 수. */
  done: number;
  /** 그 일감이 있는 사람 수. 0이면 «해당 없음»으로 적는다. */
  total: number;
  /** 「1차 평가자」처럼 누가 하는 일인지. 줄 끝에 흐리게 붙는다. */
  owner?: string;
};

export function EvalProgress({
  bars,
  caption,
  /** 첫 칸의 이름. 일감으로 갈랐으면 「일감」, 단계로 갈랐으면 「단계」다. */
  unitLabel = "일감",
}: {
  bars: EvalProgressBar[];
  caption?: string;
  unitLabel?: string;
}) {
  return (
    <figure className="m-0 flex flex-col gap-2">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          {unitLabel}별 진행 현황 — 끝낸 사람 수와 남은 사람 수
        </caption>
        <thead>
          <tr className="text-left text-[11px] text-slate-400">
            <th className="py-1 pr-3 font-medium">{unitLabel}</th>
            <th className="py-1 pr-3 font-medium">진행</th>
            <th className="py-1 pr-3 text-right font-medium">완료</th>
            <th className="py-1 text-right font-medium">남음</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((b) => {
            const pct = b.total > 0 ? Math.round((b.done / b.total) * 100) : 0;
            const left = Math.max(0, b.total - b.done);
            return (
              <tr key={b.label} className="border-t border-slate-100">
                <td className="py-1.5 pr-3 align-middle whitespace-nowrap">
                  <span className="text-sm font-medium text-slate-800">
                    {b.label}
                  </span>
                  {b.owner && (
                    <span className="ml-1.5 text-[11px] text-slate-400">
                      {b.owner}
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-3 align-middle">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2 w-full min-w-[4rem] overflow-hidden rounded-full bg-slate-200"
                      aria-hidden="true"
                    >
                      <span
                        className="block h-full rounded-full bg-brand-green"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-slate-500">
                      {b.total > 0 ? `${pct}%` : "–"}
                    </span>
                  </span>
                </td>
                <td className="py-1.5 pr-3 text-right align-middle text-sm tabular-nums whitespace-nowrap text-slate-700">
                  {b.total > 0 ? (
                    <>
                      <b className="font-semibold text-slate-900">{b.done}</b> /{" "}
                      {b.total}
                    </>
                  ) : (
                    <span className="text-slate-300">해당 없음</span>
                  )}
                </td>
                <td className="py-1.5 text-right align-middle text-sm tabular-nums whitespace-nowrap">
                  {b.total === 0 ? (
                    <span className="text-slate-300">–</span>
                  ) : left > 0 ? (
                    <span className="font-semibold text-status-critical">
                      {left}명
                    </span>
                  ) : (
                    <span className="text-brand-green-dark">완료</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {caption && (
        <figcaption className="text-[11px] break-keep text-slate-400">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
