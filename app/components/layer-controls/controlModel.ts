import type { Layer } from '../../types/config';

export type LayerControlSectionId = 'content' | 'placement' | 'structure' | 'style' | 'effect';

export interface LayerControlSection {
  id: LayerControlSectionId;
  title: string;
}

export function getLayerControlSections(layer: Layer): LayerControlSection[] {
  if (layer.kind === 'effect') {
    return [{ id: 'effect', title: 'Effect' }];
  }

  if (layer.kind === 'text' || layer.kind === 'image') {
    return [
      { id: 'content', title: 'Content' },
      { id: 'placement', title: 'Placement' },
      { id: 'style', title: 'Style' },
    ];
  }

  if (layer.kind === 'fill' || layer.kind === 'emoji') {
    return [
      { id: 'content', title: 'Content' },
      { id: 'style', title: 'Style' },
    ];
  }

  if (layer.kind === 'primitive') {
    return [
      { id: 'content', title: 'Content' },
      { id: 'structure', title: 'Structure' },
      { id: 'style', title: 'Style' },
    ];
  }

  return [
    { id: 'content', title: 'Content' },
    { id: 'placement', title: 'Placement' },
    { id: 'structure', title: 'Pattern' },
    { id: 'style', title: 'Style' },
  ];
}

export function layerHasPlacementControls(layer: Layer): boolean {
  return getLayerControlSections(layer).some((section) => section.id === 'placement');
}
