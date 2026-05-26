import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useState } from 'react';

interface Props {
  onNewBlank: () => void;
  onRandomize: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  onPresetsToggle: () => void;
  onProjectsToggle: () => void;
  onCopyLink: () => void;
  onOpenDocument: () => void;
  onSaveDocument: () => void;
  onSaveProjectPackage: () => void;
  onExport: () => void;
  exportBusy: boolean;
}

export function BottomBar({
  onNewBlank,
  onRandomize,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  undoCount,
  onCopyLink,
  onOpenDocument,
  onSaveDocument,
  onSaveProjectPackage,
  onPresetsToggle,
  onProjectsToggle,
  onExport,
  exportBusy,
}: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = useCallback(() => {
    onCopyLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [onCopyLink]);

  return (
    <div className="bottom-bar">
      {/* Row 1: Undo / Redo / Rand */}
      <div className="bottom-rand-group">
        <button className="btn" onClick={onNewBlank} aria-label="New blank canvas" title="New blank canvas">
          NEW
        </button>
        <button className="btn" onClick={onUndo} disabled={!canUndo} aria-label="Undo" title="Undo (Cmd+Z)">
          ↩{canUndo && undoCount > 0 ? ` ${undoCount}` : ''}
        </button>
        <button className="btn" onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="Redo (Cmd+Shift+Z)">
          ↪
        </button>
        <button className="btn btn-primary rand-btn" onClick={onRandomize}>
          RAND
        </button>
      </div>

      <div className="bottom-link-group">
        <button
          className="btn"
          onClick={onOpenDocument}
          aria-label="Open document file"
          title="Open .artifact or .artifact.json"
        >
          OPEN
        </button>
        <button className="btn" onClick={onSaveDocument} aria-label="Save document file" title="Save .artifact.json">
          SAVE
        </button>
        <button
          className="btn"
          onClick={onSaveProjectPackage}
          aria-label="Save editable project package"
          title="Save editable .artifact project package"
        >
          PACKAGE
        </button>
        <button className="btn" onClick={handleCopyLink} aria-label="Copy link to current state">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={copied ? 'check' : 'link'}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              style={{ display: 'inline-block' }}
            >
              {copied ? '✓' : 'LINK'}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>

      <div className="bottom-right-group">
        <button className="btn" onClick={onProjectsToggle}>
          PROJECTS
        </button>
        <button className="btn" onClick={onPresetsToggle}>
          PRESETS
        </button>
        <button className="btn btn-primary" onClick={onExport} disabled={exportBusy}>
          {exportBusy ? '…' : 'EXPORT'}
        </button>
      </div>
    </div>
  );
}
