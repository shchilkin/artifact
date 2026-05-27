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
      {!compact && <p className="editor-target-header__description">{summary.description}</p>}
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
      {summary.notes.length > 0 && (
        <div className="editor-target-header__notes">
          {summary.notes.map((note) => (
            <p key={note.text} className={`editor-target-note editor-target-note--${note.tone}`}>
              {note.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
