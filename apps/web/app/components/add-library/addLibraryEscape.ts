interface AddLibraryEscapeEvent {
  currentTarget: EventTarget | null;
  preventDefault: () => void;
}

export function preserveScopedAddLibraryEscape(event: AddLibraryEscapeEvent) {
  const overlay =
    event.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : document.querySelector<HTMLElement>('.add-library-surface');
  const activeScope =
    overlay?.querySelector('[data-add-library-scope-active="true"]') ??
    document.querySelector('[data-add-library-scope-active="true"]');
  if (activeScope) event.preventDefault();
}
