export function NoModuleAccess({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white text-center">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
          접근 권한 없음
        </span>
        <p className="text-slate-500">
          이 화면은 관리자가 귀하의 직책에 대해 접근을 제한했습니다.
        </p>
      </div>
    </div>
  );
}
