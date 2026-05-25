import { useMemo, useState } from 'react';

import { FONT_NAMES, FONT_REGISTRY, FONT_STACKS, type FontName } from '../../../../types/config';
import { InspectorLabel } from './InspectorLabel';

const FONT_CATEGORIES = ['All', 'Poster', 'Condensed', 'Mono', 'Pixel', 'Typewriter', 'Utility'] as const;

export function FontPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: FontName;
  onChange: (value: FontName) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<(typeof FONT_CATEGORIES)[number]>('All');
  const selected = FONT_REGISTRY[value] ?? FONT_REGISTRY.MONO;

  const fonts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return FONT_NAMES.filter((font) => {
      const item = FONT_REGISTRY[font];
      const matchesCategory = category === 'All' || item.category === category;
      const matchesQuery =
        !normalizedQuery ||
        item.label.toLowerCase().includes(normalizedQuery) ||
        item.family.toLowerCase().includes(normalizedQuery) ||
        item.sample.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  return (
    <div className="node-inspector-control font-picker">
      <InspectorLabel>{label}</InspectorLabel>
      <button
        className="font-picker-trigger node-field nodrag nopan nowheel"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((nextOpen) => !nextOpen)}
      >
        <span className="font-picker-trigger-copy">
          <span className="font-picker-trigger-label">{selected.label}</span>
          <span className="font-picker-trigger-meta">{selected.category}</span>
        </span>
        <span className="font-picker-trigger-sample" style={{ fontFamily: FONT_STACKS[value] }}>
          {selected.sample}
        </span>
      </button>
      {open && (
        <div className="font-picker-panel nodrag nopan nowheel">
          <input
            className="font-picker-search node-field"
            value={query}
            aria-label="Search fonts"
            placeholder="Search fonts..."
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpen(false);
            }}
          />
          <div className="font-picker-categories" aria-label="Font categories">
            {FONT_CATEGORIES.map((fontCategory) => (
              <button
                className={`font-picker-category${category === fontCategory ? ' font-picker-category-active' : ''}`}
                key={fontCategory}
                type="button"
                onClick={() => setCategory(fontCategory)}
              >
                {fontCategory}
              </button>
            ))}
          </div>
          <div className="font-picker-list">
            {fonts.map((font) => {
              const item = FONT_REGISTRY[font];
              const selectedFont = font === value;
              return (
                <button
                  className={`font-picker-option${selectedFont ? ' font-picker-option-selected' : ''}`}
                  key={font}
                  type="button"
                  aria-pressed={selectedFont}
                  onClick={() => {
                    onChange(font);
                    setOpen(false);
                  }}
                >
                  <span className="font-picker-option-main">
                    <span className="font-picker-option-name">{item.label}</span>
                    <span className="font-picker-option-category">{item.category}</span>
                  </span>
                  <span className="font-picker-option-sample" style={{ fontFamily: FONT_STACKS[font] }}>
                    {item.sample}
                  </span>
                </button>
              );
            })}
            {fonts.length === 0 && <div className="font-picker-empty">No fonts found</div>}
          </div>
        </div>
      )}
    </div>
  );
}
