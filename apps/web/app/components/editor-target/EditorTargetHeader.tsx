import type { EditorTargetSummary } from '../../utils/editorTargetSummary';

interface EditorTargetHeaderProps {
  summary: EditorTargetSummary;
  compact?: boolean;
  minimal?: boolean;
}

const COMPACT_DEFAULT_BADGES = new Set(['Visible']);
const COMPACT_ROLE_BADGES = new Set(['Source', 'Effect', 'Utility', 'Output']);

export function EditorTargetHeader({ summary, compact = false, minimal = false }: EditorTargetHeaderProps) {
  if (compact && minimal) return <MinimalEditorTargetHeader summary={summary} />;

  return (
    <div className={`editor-target-header${compact ? ' editor-target-header--compact' : ''}`}>
      <div className="editor-target-header__topline">
        <span>{summary.eyebrow}</span>
        <span>{summary.kindLabel}</span>
      </div>
      <div className="editor-target-header__title" role="heading" aria-level={2}>
        {summary.title}
      </div>
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

function MinimalEditorTargetHeader({ summary }: { summary: EditorTargetSummary }) {
  const contextLabel = getMinimalContextLabel(summary);
  const badges = summary.badges.filter((badge) => {
    if (COMPACT_DEFAULT_BADGES.has(badge.label)) return false;
    if (COMPACT_ROLE_BADGES.has(badge.label)) return false;
    if (badge.label === contextLabel) return false;
    return true;
  });

  return (
    <div className="editor-target-header editor-target-header--compact editor-target-header--minimal">
      <div className="editor-target-header__compact-row">
        <div className="editor-target-header__compact-identity">
          {contextLabel && <span className="editor-target-header__compact-label">{contextLabel}</span>}
          <div className="editor-target-header__title" role="heading" aria-level={2}>
            {summary.title}
          </div>
        </div>
      </div>
      {badges.length > 0 && (
        <div className="editor-target-header__badges" aria-label="Editing target status">
          {badges.map((badge) => (
            <span
              key={`${badge.label}:${badge.tone}`}
              className={`editor-target-badge editor-target-badge--${badge.tone}`}
            >
              {badge.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function getMinimalContextLabel(summary: EditorTargetSummary) {
  const kindMatchesTitle = normalizeLabel(summary.kindLabel) === normalizeLabel(summary.title);
  const roleBadge = summary.badges.find((badge) => badge.label.toLowerCase() === summary.role);
  if (kindMatchesTitle && summary.role !== 'utility') return roleBadge?.label ?? summary.kindLabel;
  if (kindMatchesTitle) return '';
  return summary.kindLabel;
}

function normalizeLabel(label: string) {
  return label.trim().toLowerCase();
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
