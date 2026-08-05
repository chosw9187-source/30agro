import Link from "next/link";

export function BackPill({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-brand-green hover:text-brand-green-dark"
    >
      ← {label}
    </Link>
  );
}
