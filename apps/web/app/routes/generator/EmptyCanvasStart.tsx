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
        <span>New here?</span>
        <Link to="/docs/nodes#docs-first-cover">Open guide</Link>
      </div>
      <div className="empty-canvas-start-actions">
        <button type="button" onClick={onImportImage}>
          Image
        </button>
        <button type="button" onClick={onStartAiImage}>
          AI
        </button>
        <button type="button" onClick={onAddText}>
          Text
        </button>
        <button type="button" onClick={onAddNoise}>
          Noise
        </button>
        {quickStarters.map((starter) => (
          <button key={starter.id} type="button" onClick={() => onLoadStarter(starter.id)}>
            {starter.shortName}
          </button>
        ))}
        <Link to="/examples">Examples</Link>
      </div>
    </div>
  );
}
