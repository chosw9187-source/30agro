export function ComingSoon({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-slate-600">{description}</p>}
      </div>
      <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white text-center">
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-600">
          개발 중
        </span>
        <p className="text-slate-500">이 기능은 아직 준비 중입니다.</p>
      </div>
    </div>
  );
}
