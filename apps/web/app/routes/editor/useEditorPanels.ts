import { useCallback } from 'react';

export function useEditorPanels({
  closeProjects,
  toggleProjects,
}: {
  closeProjects: () => void;
  toggleProjects: () => void;
}) {
  const handleToggleProjects = useCallback(() => {
    toggleProjects();
  }, [toggleProjects]);

  const closePanels = useCallback(() => {
    closeProjects();
  }, [closeProjects]);

  return { handleToggleProjects, closePanels };
}
