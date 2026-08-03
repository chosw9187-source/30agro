import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { saveHomeLayout } from "./actions";
import {
  HOME_BLOCKS,
  HOME_BLOCK_LABEL,
  POSITIONS,
  POSITION_LABEL,
  type Position,
} from "@/lib/permissions";

export default async function ScreenConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ position?: string }>;
}) {
  const params = await searchParams;
  const selected: Position = POSITIONS.includes(params.position as Position)
    ? (params.position as Position)
    : "STAFF";

  const hiddenRows = await prisma.homeLayoutEntry.findMany({
    where: { position: selected, visible: false },
  });
  const hidden = new Set(hiddenRows.map((r) => r.block));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">화면 구성</h1>
        <p className="mt-1 text-slate-600">
          직책별로 홈 화면에 어떤 블록을 보여줄지 설정하세요. 체크 해제하면
          아무것도 저장하지 않은 것처럼 기본값(모두 표시)이 아니라 그 직책의
          홈에서 해당 블록이 숨겨집니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {POSITIONS.map((p) => (
          <Link
            key={p}
            href={`/admin/screen-config?position=${p}`}
            className={`rounded px-3 py-1.5 text-sm ${
              p === selected
                ? "bg-brand-green text-white"
                : "border border-slate-300 text-slate-600 hover:bg-slate-100"
            }`}
          >
            {POSITION_LABEL[p]}
          </Link>
        ))}
      </div>

      <form
        action={saveHomeLayout.bind(null, selected)}
        className="rounded-lg border border-slate-200 bg-white p-6"
      >
        <p className="mb-4 text-sm font-medium text-slate-700">
          {POSITION_LABEL[selected]}의 홈 화면 블록
        </p>
        <div className="flex flex-col gap-2">
          {HOME_BLOCKS.map((b) => (
            <label key={b} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="block"
                value={b}
                defaultChecked={!hidden.has(b)}
              />
              {HOME_BLOCK_LABEL[b]}
            </label>
          ))}
        </div>
        <button
          type="submit"
          className="mt-4 rounded bg-brand-green px-4 py-2 text-white hover:bg-brand-green-dark"
        >
          저장
        </button>
      </form>
    </div>
  );
}
