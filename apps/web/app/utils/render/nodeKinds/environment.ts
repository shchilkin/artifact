import type { GraphEnvironmentNode } from '../../nodeKinds';
import { createCanvas } from '../canvas';
import { findIncomingSource } from '../graphInputs';
import { type GraphNodeRenderContext } from './context';

export const ENVIRONMENT_RENDER_MAX = 1024;

function environmentRenderSize(width: number, height: number) {
  const requestedWidth = Math.max(2, width);
  const widthFromHeight = Math.max(2, height * 2);
  const envWidth = Math.min(ENVIRONMENT_RENDER_MAX, Math.max(requestedWidth, widthFromHeight));
  const evenWidth = Math.max(2, Math.round(envWidth / 2) * 2);
  return { width: evenWidth, height: Math.max(1, Math.round(evenWidth / 2)) };
}

export async function renderEnvironmentGraphNode(node: GraphEnvironmentNode, context: GraphNodeRenderContext) {
  const nodeId = node.id;
  const sourceId = findIncomingSource(context.graph, nodeId, 'in');
  if (!sourceId) return createCanvas(context.W, context.H);
  return context.renderDependency(sourceId, environmentRenderSize(context.W, context.H));
}
