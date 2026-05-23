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
    if (areaActionTargetId) {
      onGraphChange(addNodesToGraphArea(graphRef.current, areaActionTargetId, areaActionNodeIds));
      setSelectedAreaId(areaActionTargetId);
      return;
    }
    const areaNumber = (graphRef.current.areas?.length ?? 0) + 1;
    const color = GRAPH_AREA_COLORS[(areaNumber - 1) % GRAPH_AREA_COLORS.length];
    onGraphChange(
      addGraphArea(graphRef.current, {
        id: `area-${Date.now().toString(36)}`,
        name: `Area ${areaNumber}`,
        color,
        nodeIds: areaActionNodeIds,
      }),
    );
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
