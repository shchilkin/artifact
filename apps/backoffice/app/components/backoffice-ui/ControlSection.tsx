export function ControlSection({
  badge,
  children,
  copy,
  eyebrow,
  title,
}: {
  badge?: React.ReactNode;
  children: React.ReactNode;
  copy: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className="control-section">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        {badge}
      </div>
      <p className="control-copy">{copy}</p>
      {children}
    </section>
  );
}
