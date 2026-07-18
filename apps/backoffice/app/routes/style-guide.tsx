import { FoundationCommandMatrix, FoundationFeedbackMatrix, FoundationFieldMatrix } from '@artifact/ui';
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

      <section className="backoffice-style-guide__section" aria-labelledby="foundation-fields-title">
        <div className="backoffice-style-guide__section-heading">
          <p className="eyebrow">UI Foundation</p>
          <h2 id="foundation-fields-title">Field matrix</h2>
          <p>Field, Input, Textarea, and NativeSelect share accessible associations and native form behavior.</p>
        </div>
        <FoundationFieldMatrix />
      </section>

      <section className="backoffice-style-guide__section" aria-labelledby="foundation-feedback-title">
        <div className="backoffice-style-guide__section-heading">
          <p className="eyebrow">UI Foundation</p>
          <h2 id="foundation-feedback-title">Feedback and async-state matrix</h2>
          <p>Notices, loading placeholders, and progress share announcement and reduced-motion behavior.</p>
        </div>
        <FoundationFeedbackMatrix />
      </section>
    </main>
  );
}
