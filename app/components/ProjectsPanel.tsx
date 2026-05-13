import { motion } from 'framer-motion';
import { useState } from 'react';

import type { SavedProject } from '../utils/projectLibrary';

interface Props {
  projects: SavedProject[];
  maxProjects: number;
  onSave: (name: string) => void;
  onLoad: (project: SavedProject) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'saved locally';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function ProjectsPanel({ projects, maxProjects, onSave, onLoad, onDelete, onClose }: Props) {
  const [name, setName] = useState('');
  const nearLimit = projects.length >= maxProjects - 2;

  const handleSave = () => {
    const trimmed = name.trim() || `Project ${projects.length + 1}`;
    onSave(trimmed);
    setName('');
  };

  return (
    <>
      <motion.div
        className="fixed inset-0 bg-black/60 z-299"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />
      <motion.div
        className="fixed top-0 right-0 bottom-0 w-[min(360px,100vw)] bg-sidebar border-l border-border flex flex-col z-300 overflow-hidden"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center justify-between px-4 min-h-11 border-b border-border shrink-0">
          <span className="text-[10px] tracking-[2.5px] text-accent font-semibold">PROJECTS</span>
          <div className="flex items-center gap-2.5">
            <span className={`text-[9px] tracking-[0.5px] ${nearLimit ? 'text-accent' : 'text-dim'}`}>
              {projects.length} / {maxProjects}
            </span>
            <button className="btn btn-icon" onClick={onClose} aria-label="Close projects">
              ✕
            </button>
          </div>
        </div>
        <div className="flex gap-2 px-4 py-2.5 border-b border-border shrink-0">
          <label htmlFor="project-name-input" className="sr-only">
            Project name
          </label>
          <input
            id="project-name-input"
            type="text"
            placeholder="Project name..."
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleSave()}
            className="flex-1 bg-sidebar-raised border border-border text-text font-mono text-[11px] px-2 h-11 rounded-sm outline-none focus:border-accent placeholder:text-dim"
          />
          <button className="btn btn-primary" onClick={handleSave}>
            SAVE
          </button>
        </div>
        {projects.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-dim text-[11px] p-5 text-center">
            <div className="text-[32px] text-accent opacity-30 mb-2">▣</div>
            <p>No projects saved yet.</p>
            <p>Save a snapshot to come back to this document later.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]">
            {projects.map((project) => (
              <div
                key={project.id}
                className="flex gap-2.5 p-2.5 border border-border rounded bg-sidebar-raised/50 transition-colors hover:border-accent/30"
              >
                <img src={project.thumbnail} alt={project.name} className="w-20 h-20 rounded object-cover shrink-0" />
                <div className="flex-1 flex flex-col justify-between min-w-0">
                  <div>
                    <div className="text-[12px] text-text truncate">{project.name}</div>
                    <div className="text-[10px] text-dim tracking-[0.5px]">{formatUpdatedAt(project.updatedAt)}</div>
                  </div>
                  <div className="text-[10px] text-dim tracking-[0.5px]">seed: {project.doc.global.seed}</div>
                  <div className="flex gap-1.5">
                    <button
                      className="btn btn-small"
                      aria-label={`Load ${project.name}`}
                      onClick={() => onLoad(project)}
                    >
                      LOAD
                    </button>
                    <button
                      className="btn btn-small btn-danger"
                      aria-label={`Delete ${project.name}`}
                      onClick={() => onDelete(project.id)}
                    >
                      DEL
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </>
  );
}
