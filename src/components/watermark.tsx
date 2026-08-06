export function Watermark({ text }: { text: string }) {
  const tiles = Array.from({ length: 24 });

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden select-none"
    >
      <div
        className="grid h-[160vh] w-[160vw] grid-cols-3 gap-x-20 gap-y-24 opacity-[0.025]"
        style={{ transform: "translate(-20vw, -20vh) rotate(-28deg)" }}
      >
        {tiles.map((_, i) => (
          <span
            key={i}
            className="whitespace-nowrap text-xs font-normal text-slate-500"
          >
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
