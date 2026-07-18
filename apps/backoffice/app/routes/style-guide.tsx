import { FoundationCommandMatrix } from '@artifact/ui';
import './style-guide.css';

export function meta() {
  return [{ title: 'Style guide | Artifact Backoffice' }];
}

export default function StyleGuideRoute() {
  return (
    <main className="backoffice-style-guide">
      <header className="backoffice-style-guide__header">
        <div className="sign-in-brand">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <span>artifact / backoffice</span>
        </div>
        <h1>Style guide</h1>
        <p>
          Shared interaction contracts rendered with the compact operational density and typography of the Backoffice
          Product Theme.
        </p>
      </header>

      <section className="backoffice-style-guide__section" aria-labelledby="foundation-commands-title">
        <div className="backoffice-style-guide__section-heading">
          <p className="eyebrow">UI Foundation</p>
          <h2 id="foundation-commands-title">Command matrix</h2>
          <p>Button, ButtonLink, and IconButton share accessible anatomy while retaining Backoffice presentation.</p>
        </div>
        <FoundationCommandMatrix />
      </section>
    </main>
  );
}
