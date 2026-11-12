export function Bars({
  title,
  caption,
  rows,
  empty,
  unit,
}: {
  title: string;
  caption: string;
  rows: { label: string; value: number }[];
  empty: string;
  unit: string;
}) {
  if (rows.length === 0) {
    return (
      <section className="card">
        <h2 className="font-serif text-2xl">{title}</h2>
        <p className="mt-2">{empty}</p>
      </section>
    );
  }
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <figure className="card">
      <figcaption>
        <span className="font-serif text-2xl">{title}</span>
        <span className="mt-1 block text-sm text-ink/70">{caption}</span>
      </figcaption>
      <svg role="img" aria-label={title} viewBox={`0 0 320 ${rows.length * 28 + 8}`} className="mt-3 w-full">
        {rows.map((row, index) => (
          <g key={row.label} transform={`translate(0 ${index * 28})`}>
            <text x="0" y="16" className="fill-ink" fontSize="12">{row.label}</text>
            <rect x="120" y="6" height="12" width={Math.max(2, (row.value / max) * 140)} fill="#2f6f4e" />
            <text x="268" y="16" fontSize="12">{row.value} {unit}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}
