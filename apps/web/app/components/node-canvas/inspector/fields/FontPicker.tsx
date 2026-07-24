import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { InspectorField } from '@/components/inspector-system';
import {
  FONT_NAMES,
  FONT_REGISTRY,
  FONT_STACKS,
  getBundledFontRegistryItem,
  getBundledFontStack,
  isBundledFontName,
  type TextFontRef,
} from '../../../../types/config';
import {
  ensureImportedFontLoaded,
  fontUriFromId,
  type ImportedFontAsset,
  isFontUri,
  listImportedFonts,
  normalizeImportedFontLabel,
  saveGoogleFontFamily,
  saveImportedFontFile,
} from '../../../../utils/fontStore';

const FONT_CATEGORIES = [
  'All',
  'Imported',
  'Google',
  'Poster',
  'Condensed',
  'Mono',
  'Pixel',
  'Typewriter',
  'Utility',
] as const;
type FontCategory = (typeof FONT_CATEGORIES)[number];

interface FontOptionItem {
  value: TextFontRef;
  label: string;
  category: string;
  family: string;
  stack: string;
  sample: string;
}

const IMPORTED_FONT_SAMPLE = 'TYPE';

function importedFontLabel(font: ImportedFontAsset) {
  return normalizeImportedFontLabel(font.source === 'google-fonts' ? font.label : font.sourceName || font.label);
}

function importedFontCategory(font: ImportedFontAsset) {
  return font.source === 'google-fonts' ? 'Google' : 'Imported';
}

export function FontPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TextFontRef;
  onChange: (value: TextFontRef) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FontCategory>('All');
  const [importedFonts, setImportedFonts] = useState<ImportedFontAsset[]>([]);
  const [fontError, setFontError] = useState<string | null>(null);
  const [googleFontInput, setGoogleFontInput] = useState('');
  const [googleFontBusy, setGoogleFontBusy] = useState(false);
  const triggerId = useId();
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    listImportedFonts()
      .then((fonts) => {
        if (!cancelled) setImportedFonts(fonts);
      })
      .catch(() => {
        if (!cancelled) setImportedFonts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isFontUri(value)) return;
    let cancelled = false;
    ensureImportedFontLoaded(value)
      .then((asset) => {
        if (!asset || cancelled) return;
        setImportedFonts((current) => (current.some((font) => font.id === asset.id) ? current : [...current, asset]));
      })
      .catch(() => {
        // Missing local fonts are shown as a fallback option instead of
        // breaking the inspector.
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  const allFonts = useMemo<FontOptionItem[]>(() => {
    const bundled = FONT_NAMES.map((font) => {
      const item = FONT_REGISTRY[font];
      return {
        value: font,
        label: item.label,
        category: item.category,
        family: item.family,
        stack: FONT_STACKS[font],
        sample: item.sample,
      };
    });
    const imported = importedFonts.map((font) => ({
      value: fontUriFromId(font.id),
      label: importedFontLabel(font),
      category: importedFontCategory(font),
      family: font.family,
      stack: `"${font.family}", ${FONT_STACKS.MONO}`,
      sample: IMPORTED_FONT_SAMPLE,
    }));
    return [...imported, ...bundled];
  }, [importedFonts]);

  const selected =
    allFonts.find((font) => font.value === value) ??
    (isBundledFontName(value)
      ? {
          value,
          label: getBundledFontRegistryItem(value).label,
          category: getBundledFontRegistryItem(value).category,
          family: getBundledFontRegistryItem(value).family,
          stack: getBundledFontStack(value),
          sample: getBundledFontRegistryItem(value).sample,
        }
      : {
          value,
          label: 'Missing imported font',
          category: 'Imported',
          family: 'Courier New',
          stack: FONT_STACKS.MONO,
          sample: 'MISSING',
        });

  const fonts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return allFonts.filter((item) => {
      const matchesCategory = category === 'All' || item.category === category;
      const matchesQuery =
        !normalizedQuery ||
        item.label.toLowerCase().includes(normalizedQuery) ||
        item.family.toLowerCase().includes(normalizedQuery) ||
        item.sample.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [allFonts, category, query]);

  async function applyImportedFont(imported: ImportedFontAsset, nextCategory: FontCategory) {
    const uri = fontUriFromId(imported.id);
    await ensureImportedFontLoaded(uri);
    setImportedFonts((current) => [imported, ...current.filter((font) => font.id !== imported.id)]);
    onChange(uri);
    setCategory(nextCategory);
    setFontError(null);
  }

  async function handleImportFont(file: File | null | undefined) {
    if (!file) return;
    try {
      const imported = await saveImportedFontFile(file);
      await applyImportedFont(imported, 'Imported');
    } catch {
      setFontError('Could not import font');
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  async function handleImportGoogleFont() {
    if (!googleFontInput.trim() || googleFontBusy) return;
    setGoogleFontBusy(true);
    try {
      const imported = await saveGoogleFontFamily(googleFontInput);
      await applyImportedFont(imported, 'Google');
      setGoogleFontInput('');
    } catch {
      setFontError('Could not import Google font');
    } finally {
      setGoogleFontBusy(false);
    }
  }

  return (
    <div className="font-picker">
      <InspectorField
        className="node-inspector-control"
        controlId={triggerId}
        error={fontError ?? undefined}
        label={label}
        loading={googleFontBusy}
        validation={fontError ? 'invalid' : googleFontBusy ? 'validating' : 'idle'}
      >
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
          <span className="font-picker-trigger-sample" style={{ fontFamily: selected.stack }}>
            {selected.sample}
          </span>
        </button>
      </InspectorField>
      {open && (
        <div className="font-picker-panel nodrag nopan nowheel">
          <input
            ref={importInputRef}
            type="file"
            accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
            className="sr-only"
            aria-label="Import font"
            onChange={(event) => void handleImportFont(event.target.files?.[0])}
          />
          <button className="font-picker-import" type="button" onClick={() => importInputRef.current?.click()}>
            + Import file
          </button>
          <div className="font-picker-google">
            <input
              className="font-picker-search node-field"
              value={googleFontInput}
              aria-label="Import Google font"
              placeholder="Google family or CSS URL..."
              onChange={(event) => setGoogleFontInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleImportGoogleFont();
                if (event.key === 'Escape') setOpen(false);
              }}
            />
            <button
              className="font-picker-google-action"
              type="button"
              disabled={!googleFontInput.trim() || googleFontBusy}
              onClick={() => void handleImportGoogleFont()}
            >
              {googleFontBusy ? '…' : 'Google'}
            </button>
          </div>
          <div className="font-picker-policy">
            Google fonts carry open-license metadata. Local files stay metadata-only unless you export PKG+FONTS.
          </div>
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
            {fonts.map((item) => {
              const selectedFont = item.value === value;
              return (
                <button
                  className={`font-picker-option${selectedFont ? ' font-picker-option-selected' : ''}`}
                  key={item.value}
                  type="button"
                  aria-pressed={selectedFont}
                  onClick={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <span className="font-picker-option-main">
                    <span className="font-picker-option-name">{item.label}</span>
                    <span className="font-picker-option-category">{item.category}</span>
                  </span>
                  <span className="font-picker-option-sample" style={{ fontFamily: item.stack }}>
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
