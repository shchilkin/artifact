import { useCallback } from 'react';

export function useGeneratorPanels({
  closePresets,
  closeProjects,
  togglePresets,
  toggleProjects,
}: {
  closePresets: () => void;
  closeProjects: () => void;
  togglePresets: () => void;
  toggleProjects: () => void;
}) {
  const handleTogglePresets = useCallback(() => {
    closeProjects();
    togglePresets();
  }, [closeProjects, togglePresets]);

  const handleToggleProjects = useCallback(() => {
    closePresets();
    toggleProjects();
  }, [closePresets, toggleProjects]);

  const closePanels = useCallback(() => {
    closePresets();
    closeProjects();
  }, [closePresets, closeProjects]);

  return { handleTogglePresets, handleToggleProjects, closePanels };
}
