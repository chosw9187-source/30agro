export function CompanyLogo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/ci-logo.jpg"
      alt="SG 한국삼공"
      className={`h-8 w-auto object-contain ${className ?? ""}`}
    />
  );
}
