export function ControlSection({
  badge,
  children,
  copy,
  eyebrow,
  headingLevel = 2,
  title,
}: {
  badge?: React.ReactNode;
  children: React.ReactNode;
  copy: string;
  eyebrow: string;
  headingLevel?: 2 | 3 | 4;
  title: string;
}) {
  const Heading = headingLevel === 4 ? 'h4' : headingLevel === 3 ? 'h3' : 'h2';
  return (
    <section className="control-section">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <Heading>{title}</Heading>
        </div>
        {badge}
      </div>
      <p className="control-copy">{copy}</p>
      {children}
    </section>
  );
}
