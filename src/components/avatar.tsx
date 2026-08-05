import { CompanyLogo } from "./company-logo";

export function Avatar({
  userId,
  name,
  hasPhoto,
  className = "h-10 w-10 text-sm",
}: {
  userId: string;
  name: string;
  hasPhoto: boolean;
  className?: string;
}) {
  if (hasPhoto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/employees/${userId}/photo`}
        alt={name}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white p-1.5 ${className}`}
    >
      <CompanyLogo className="h-full w-full" />
    </span>
  );
}
