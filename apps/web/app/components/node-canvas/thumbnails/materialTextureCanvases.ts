import { useEffect, useState } from 'react';

import { type GraphMaterialNode, MATERIAL_TEXTURE_INPUT_PORTS } from '../../../types/config';
import type { SceneMaterialTextureCanvases } from '../../../utils/modelRenderer';
import { renderGraphTarget } from '../../../utils/renderer';
import type { PrimitiveViewportState } from '../../PrimitiveViewportState';

export function useGeneratedMaterialTextureCanvases({
  materialNode,
  doc,
  graph,
  imageCache,
  primitiveViewStates,
}: {
  materialNode: GraphMaterialNode | null;
  doc: Parameters<typeof renderGraphTarget>[0];
  graph: Parameters<typeof renderGraphTarget>[1];
  imageCache: Map<string, HTMLImageElement>;
  primitiveViewStates: Record<string, PrimitiveViewportState>;
}) {
  const renderKey = materialNode ? materialTextureInputSignature(graph, materialNode.id) : null;
  const [renderedCanvases, setRenderedCanvases] = useState<{
    key: string;
    textures: SceneMaterialTextureCanvases | null;
  } | null>(null);
  useEffect(() => {
    if (!materialNode || !renderKey) return;
    const sources = materialTextureInputSources(graph, materialNode.id);
    let cancelled = false;
    Promise.all(
      sources.map(async ({ port, sourceId }) => ({
        port,
        canvas: await renderGraphTarget(doc, graph, sourceId, 512, 512, imageCache, {
          primitiveViewStates,
        }),
      })),
    )
      .then((items) => {
        if (cancelled) return;
        const textures: SceneMaterialTextureCanvases = {};
        for (const item of items) textures[item.port] = item.canvas;
        setRenderedCanvases({ key: renderKey, textures });
      })
      .catch(() => {
        if (!cancelled) setRenderedCanvases({ key: renderKey, textures: null });
      });
    return () => {
      cancelled = true;
    };
  }, [doc, graph, imageCache, materialNode, primitiveViewStates, renderKey]);
  return renderedCanvases?.key === renderKey ? renderedCanvases.textures : null;
}

function materialTextureInputSources(graph: Parameters<typeof renderGraphTarget>[1], materialId: string) {
  return MATERIAL_TEXTURE_INPUT_PORTS.flatMap((port) => {
    const sourceId = graph.edges.find((edge) => edge.toId === materialId && edge.toPort === port)?.fromId;
    return sourceId ? [{ port, sourceId }] : [];
  });
}

function materialTextureInputSignature(graph: Parameters<typeof renderGraphTarget>[1], materialId: string) {
  const sources = materialTextureInputSources(graph, materialId);
  if (sources.length === 0) return null;
  return MATERIAL_TEXTURE_INPUT_PORTS.map((port) => {
    const sourceId = graph.edges.find((edge) => edge.toId === materialId && edge.toPort === port)?.fromId ?? '';
    return `${port}:${sourceId}`;
  }).join('|');
}
