import { Link } from 'react-router';
import { LAYER_STARTER_DOCUMENTS } from '../../utils/starterDocuments';

export function EmptyCanvasStart({
  onImportImage,
  onStartAiImage,
  onAddText,
  onAddNoise,
  onLoadStarter,
}: {
  onImportImage: () => void;
  onStartAiImage: () => void;
  onAddText: () => void;
  onAddNoise: () => void;
  onLoadStarter: (id: string) => void;
}) {
  const quickStarters = LAYER_STARTER_DOCUMENTS.slice(0, 3);

  return (
    <div className="empty-canvas-start" aria-label="Start a new artifact">
      <div className="empty-canvas-guide">
        <span>Start with one source</span>
        <Link to="/docs/nodes#docs-first-cover">Open guide</Link>
      </div>
      <div className="empty-canvas-start-actions" aria-label="Quick start actions">
        <button
          type="button"
          className="empty-canvas-start-action empty-canvas-start-action--primary"
          onClick={onImportImage}
        >
          Import image
        </button>
        <button type="button" className="empty-canvas-start-action" onClick={onAddText}>
          Add text
        </button>
        <button type="button" className="empty-canvas-start-action" onClick={onStartAiImage}>
          AI image
        </button>
      </div>
      <div className="empty-canvas-starter-row" aria-label="Starter recipes">
        <span>Recipes</span>
        <button type="button" onClick={onAddNoise}>
          Noise
        </button>
        {quickStarters.map((starter) => (
          <button key={starter.id} type="button" onClick={() => onLoadStarter(starter.id)}>
            {starter.shortName}
          </button>
        ))}
        <Link to="/showcase">Showcase</Link>
      </div>
    </div>
  );
}
