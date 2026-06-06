import { type RefObject, useCallback, useMemo, useState } from 'react';
import type { CanvasGraph } from '../../../types/config';
import {
  addGraphArea,
  addNodesToGraphArea,
  EXPORT_NODE_ID,
  GRAPH_AREA_COLORS,
  removeGraphArea,
  removeNodesFromGraphArea,
} from '../../../utils/nodeGraph';

export function useNodeAreaActions({
  graph,
  graphRef,
  selectedNodeIds,
  onGraphChange,
}: {
  graph: CanvasGraph;
  graphRef: RefObject<CanvasGraph>;
  selectedNodeIds: string[];
  onGraphChange: (graph: CanvasGraph) => void;
}) {
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);

  const areaCandidateNodeIds = useMemo(() => selectedNodeIds.filter((id) => id !== EXPORT_NODE_ID), [selectedNodeIds]);
  const areaByNodeId = useMemo(() => {
    const map = new Map<string, string>();
    for (const area of graph.areas ?? []) {
      for (const id of area.nodeIds) map.set(id, area.id);
    }
    return map;
  }, [graph.areas]);
  const selectedArea = useMemo(
    () => (selectedAreaId ? (graph.areas ?? []).find((area) => area.id === selectedAreaId) : undefined),
    [graph.areas, selectedAreaId],
  );
  const inferredAreaId = useMemo(() => {
    const areaIds = [...new Set(areaCandidateNodeIds.map((id) => areaByNodeId.get(id)).filter(Boolean))] as string[];
    return areaIds.length === 1 ? areaIds[0] : null;
  }, [areaByNodeId, areaCandidateNodeIds]);
  const areaActionTargetId = selectedArea?.id ?? inferredAreaId;
  const ungroupedAreaCandidateNodeIds = useMemo(
    () => areaCandidateNodeIds.filter((id) => !areaByNodeId.has(id)),
    [areaByNodeId, areaCandidateNodeIds],
  );
  const areaActionNodeIds = areaActionTargetId ? areaCandidateNodeIds : ungroupedAreaCandidateNodeIds;
  const areaActionDisabled = areaActionNodeIds.length === 0;

  const handleCreateAreaFromSelection = useCallback(() => {
    if (areaActionDisabled) return;
    const result = createAreaSelectionAction(graphRef.current, areaActionNodeIds, areaActionTargetId);
    onGraphChange(result.graph);
    setSelectedAreaId(result.selectedAreaId);
  }, [areaActionDisabled, areaActionNodeIds, areaActionTargetId, graphRef, onGraphChange]);

  const handleRemoveArea = useCallback(
    (id: string) => {
      setSelectedAreaId((current) => (current === id ? null : current));
      onGraphChange(removeGraphArea(graphRef.current, id));
    },
    [graphRef, onGraphChange],
  );

  const handleRemoveNodeFromArea = useCallback(
    (areaId: string, nodeId: string) => {
      onGraphChange(removeNodesFromGraphArea(graphRef.current, areaId, [nodeId]));
    },
    [graphRef, onGraphChange],
  );

  return {
    selectedAreaId,
    areaByNodeId,
    areaActionTargetId,
    areaActionDisabled,
    clearSelectedArea: useCallback(() => setSelectedAreaId(null), []),
    handleCreateAreaFromSelection,
    handleRemoveArea,
    handleRemoveNodeFromArea,
    handleSelectArea: setSelectedAreaId,
  };
}

function createAreaSelectionAction(graph: CanvasGraph, nodeIds: string[], targetAreaId: string | undefined | null) {
  if (targetAreaId) {
    return {
      graph: addNodesToGraphArea(graph, targetAreaId, nodeIds),
      selectedAreaId: targetAreaId,
    };
  }
  const areaNumber = nextGraphAreaNumber(graph);
  return {
    graph: addGraphArea(graph, {
      id: `area-${Date.now().toString(36)}`,
      name: `Area ${areaNumber}`,
      color: graphAreaColor(areaNumber),
      nodeIds,
    }),
    selectedAreaId: null,
  };
}

function nextGraphAreaNumber(graph: CanvasGraph) {
  return (graph.areas?.length ?? 0) + 1;
}

function graphAreaColor(areaNumber: number) {
  return GRAPH_AREA_COLORS[(areaNumber - 1) % GRAPH_AREA_COLORS.length];
}
