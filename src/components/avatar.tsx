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
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand-green-light font-semibold text-brand-green-dark ${className}`}
    >
      {name.slice(0, 2)}
    </span>
  );
}
