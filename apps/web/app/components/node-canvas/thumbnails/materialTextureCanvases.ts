import { useEffect, useMemo, useState } from 'react';

import {
  type CanvasDocument,
  type CanvasGraph,
  type GraphMaterialNode,
  MATERIAL_TEXTURE_INPUT_PORTS,
} from '../../../types/config';
import type { SceneMaterialTextureCanvases } from '../../../utils/modelRenderer';
import { collectUpstreamNodeIds } from '../../../utils/nodeGraph';
import { renderGraphTarget } from '../../../utils/renderer';
import {
  edgeRenderSig,
  environmentNodeRenderSig,
  grimeShadowNodeRenderSig,
  layerRenderSig,
  maskNodeRenderSig,
  materialNodeRenderSig,
  mergeNodeRenderSig,
  repeatNodeRenderSig,
  scene3DNodeRenderSig,
  shaderNodeRenderSig,
  transformNodeRenderSig,
} from '../../../utils/renderSignature';
import type { PrimitiveViewportState } from '../../PrimitiveViewportState';

export function useGeneratedMaterialTextureCanvases({
  materialNode,
  directTextureSourceId,
  doc,
  graph,
  imageCache,
  primitiveViewStates,
}: {
  materialNode: GraphMaterialNode | null;
  directTextureSourceId?: string | null;
  doc: Parameters<typeof renderGraphTarget>[0];
  graph: Parameters<typeof renderGraphTarget>[1];
  imageCache: Map<string, HTMLImageElement>;
  primitiveViewStates: Record<string, PrimitiveViewportState>;
}) {
  const sources = useMemo(
    () =>
      directTextureSourceId
        ? [{ port: 'albedo' as const, sourceId: directTextureSourceId }]
        : materialNode
          ? materialTextureInputSources(graph, materialNode.id)
          : [],
    [directTextureSourceId, graph, materialNode],
  );
  const renderKey = sources.length > 0 ? materialTextureInputSignature(doc, graph, sources) : null;
  const [renderedCanvases, setRenderedCanvases] = useState<{
    key: string;
    textures: SceneMaterialTextureCanvases | null;
  } | null>(null);
  useEffect(() => {
    if (!renderKey) return;
    if (sources.length === 0) return;
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
  }, [doc, graph, imageCache, primitiveViewStates, renderKey, sources]);
  return renderedCanvases?.key === renderKey ? renderedCanvases.textures : null;
}

function materialTextureInputSources(graph: Parameters<typeof renderGraphTarget>[1], materialId: string) {
  return MATERIAL_TEXTURE_INPUT_PORTS.flatMap((port) => {
    const sourceId = graph.edges.find((edge) => edge.toId === materialId && edge.toPort === port)?.fromId;
    return sourceId ? [{ port, sourceId }] : [];
  });
}

function materialTextureInputSignature(
  doc: CanvasDocument,
  graph: CanvasGraph,
  sources: Array<{ port: (typeof MATERIAL_TEXTURE_INPUT_PORTS)[number]; sourceId: string }>,
) {
  const upstream = new Set<string>();
  for (const source of sources) {
    for (const nodeId of collectUpstreamNodeIds(source.sourceId, graph)) upstream.add(nodeId);
  }
  return [
    sources.map((source) => `${source.port}:${source.sourceId}`).join('|'),
    signatureList(
      doc.layers.filter((layer) => upstream.has(layer.id)).map((layer) => `${layer.id}:${layerRenderSig(layer)}`),
    ),
    signatureList(
      (graph.mergeNodes ?? [])
        .filter((node) => upstream.has(node.id))
        .map((node) => `${node.id}:${mergeNodeRenderSig(node)}`),
    ),
    signatureList(
      (graph.colorNodes ?? [])
        .filter((node) => upstream.has(node.id))
        .map((node) => `${node.id}:${node.contrast},${node.brightness},${node.saturation},${node.hue}`),
    ),
    signatureList(
      (graph.repeatNodes ?? [])
        .filter((node) => upstream.has(node.id))
        .map((node) => `${node.id}:${repeatNodeRenderSig(node)}`),
    ),
    signatureList(
      (graph.materialNodes ?? [])
        .filter((node) => upstream.has(node.id))
        .map((node) => `${node.id}:${materialNodeRenderSig(node)}`),
    ),
    signatureList(
      (graph.maskNodes ?? [])
        .filter((node) => upstream.has(node.id))
        .map((node) => `${node.id}:${maskNodeRenderSig(node)}`),
    ),
    signatureList(
      (graph.transformNodes ?? [])
        .filter((node) => upstream.has(node.id))
        .map((node) => `${node.id}:${transformNodeRenderSig(node)}`),
    ),
    signatureList(
      (graph.grimeShadowNodes ?? [])
        .filter((node) => upstream.has(node.id))
        .map((node) => `${node.id}:${grimeShadowNodeRenderSig(node)}`),
    ),
    signatureList(
      (graph.scene3dNodes ?? [])
        .filter((node) => upstream.has(node.id))
        .map((node) => `${node.id}:${scene3DNodeRenderSig(node)}`),
    ),
    signatureList(
      (graph.environmentNodes ?? [])
        .filter((node) => upstream.has(node.id))
        .map((node) => `${node.id}:${environmentNodeRenderSig(node)}`),
    ),
    signatureList(
      (graph.shaderNodes ?? [])
        .filter((node) => upstream.has(node.id))
        .map((node) => `${node.id}:${shaderNodeRenderSig(node)}`),
    ),
    signatureList(
      graph.edges
        .filter((edge) => upstream.has(edge.fromId) && upstream.has(edge.toId))
        .map((edge) => `${edge.id}:${edgeRenderSig(edge)}`),
    ),
  ].join('::');
}

function signatureList(signatures: string[]) {
  return signatures.sort().join(',');
}
