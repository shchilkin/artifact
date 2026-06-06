import type { EditorTargetSummary } from '../../utils/editorTargetSummary';

interface EditorTargetHeaderProps {
  summary: EditorTargetSummary;
  compact?: boolean;
}

export function EditorTargetHeader({ summary, compact = false }: EditorTargetHeaderProps) {
  return (
    <div className={`editor-target-header${compact ? ' editor-target-header--compact' : ''}`}>
      <div className="editor-target-header__topline">
        <span>{summary.eyebrow}</span>
        <span>{summary.kindLabel}</span>
      </div>
      <div className="editor-target-header__title">{summary.title}</div>
      <EditorTargetBreadcrumbs breadcrumbs={summary.breadcrumbs} />
      <EditorTargetDescription compact={compact} description={summary.description} />
      <div className="editor-target-header__badges" aria-label="Editing target status">
        {summary.badges.map((badge) => (
          <span
            key={`${badge.label}:${badge.tone}`}
            className={`editor-target-badge editor-target-badge--${badge.tone}`}
          >
            {badge.label}
          </span>
        ))}
      </div>
      <EditorTargetNotes notes={summary.notes} />
    </div>
  );
}

function EditorTargetBreadcrumbs({ breadcrumbs }: { breadcrumbs: EditorTargetSummary['breadcrumbs'] }) {
  if (breadcrumbs.length === 0) return null;
  return (
    <div className="editor-target-header__breadcrumbs" aria-label="Editing target path">
      {breadcrumbs.map((crumb) => (
        <span key={crumb}>{crumb}</span>
      ))}
    </div>
  );
}

function EditorTargetDescription({ compact, description }: { compact: boolean; description: string }) {
  return compact ? null : <p className="editor-target-header__description">{description}</p>;
}

function EditorTargetNotes({ notes }: { notes: EditorTargetSummary['notes'] }) {
  if (notes.length === 0) return null;
  return (
    <div className="editor-target-header__notes">
      {notes.map((note) => (
        <p key={note.text} className={`editor-target-note editor-target-note--${note.tone}`}>
          {note.text}
        </p>
      ))}
    </div>
  );
}
