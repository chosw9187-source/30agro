import { prisma } from "@/lib/prisma";
import { TrafficTrendChart } from "@/components/traffic-trend-chart";

export const dynamic = "force-dynamic";

const DAYS = 30;

/** YYYY-MM-DD in KST, used as both the group-by key and the day boundary. */
function kstDayKey(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

export default async function AdminTrafficPage() {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (DAYS - 1));
  const sinceKey = kstDayKey(since);
  const sinceStart = new Date(`${sinceKey}T00:00:00+09:00`);

  const rows = await prisma.pageView.findMany({
    where: { createdAt: { gte: sinceStart } },
    select: { userId: true, createdAt: true },
  });

  const byDay = new Map<string, { views: number; visitors: Set<string> }>();
  for (const r of rows) {
    const key = kstDayKey(r.createdAt);
    let bucket = byDay.get(key);
    if (!bucket) {
      bucket = { views: 0, visitors: new Set() };
      byDay.set(key, bucket);
    }
    bucket.views++;
    bucket.visitors.add(r.userId);
  }

  const days: { key: string; label: string; shortLabel: string; views: number; visitors: number }[] = [];
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(sinceStart);
    d.setDate(d.getDate() + i);
    const key = kstDayKey(d);
    const bucket = byDay.get(key);
    days.push({
      key,
      label: key,
      shortLabel: key.slice(5).replace("-", "/"),
      views: bucket?.views ?? 0,
      visitors: bucket?.visitors.size ?? 0,
    });
  }

  const todayKey = kstDayKey(new Date());
  const today = days.find((d) => d.key === todayKey) ?? { views: 0, visitors: 0 };
  const avgVisitors30d = days.reduce((s, d) => s + d.visitors, 0) / days.length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">일일 트래픽</h1>
        <p className="mt-1 text-slate-600">
          로그인 후 화면을 열 때마다 한 건씩 기록됩니다 (페이지뷰 기준). 최근 {DAYS}일 추이입니다.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">오늘 조회수</p>
          <p className="mt-1 text-3xl font-bold text-brand-green-dark">{today.views}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">오늘 방문자 수</p>
          <p className="mt-1 text-3xl font-bold text-blue-600">{today.visitors}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">일평균 방문자 수 (최근 {DAYS}일)</p>
          <p className="mt-1 text-3xl font-bold text-slate-700">{avgVisitors30d.toFixed(1)}</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-medium">최근 {DAYS}일 추이</h2>
        <TrafficTrendChart points={days} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">날짜</th>
              <th className="px-4 py-3 text-right font-medium">조회수</th>
              <th className="px-4 py-3 text-right font-medium">방문자 수</th>
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((d) => (
              <tr
                key={d.key}
                className={`border-b border-slate-100 last:border-0 ${d.key === todayKey ? "bg-brand-green-light/40" : ""}`}
              >
                <td className="px-4 py-2">{d.label}</td>
                <td className="px-4 py-2 text-right">{d.views}</td>
                <td className="px-4 py-2 text-right">{d.visitors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
