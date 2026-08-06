export function Watermark({ text }: { text: string }) {
  const tiles = Array.from({ length: 48 });

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden select-none"
    >
      <div
        className="grid h-[160vh] w-[160vw] grid-cols-4 gap-x-12 gap-y-16 opacity-[0.06]"
        style={{ transform: "translate(-20vw, -20vh) rotate(-28deg)" }}
      >
        {tiles.map((_, i) => (
          <span
            key={i}
            className="whitespace-nowrap text-sm font-medium text-slate-900"
          >
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
