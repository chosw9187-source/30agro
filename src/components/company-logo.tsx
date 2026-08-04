export function CompanyLogo({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/ci-logo.jpg" alt="SG 한국삼공" className={`object-contain ${className}`} />
  );
}
