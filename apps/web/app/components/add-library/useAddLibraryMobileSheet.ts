import { useMediaQuery } from '../../hooks/useMediaQuery';

const ADD_LIBRARY_MOBILE_QUERY = '(max-width: 640px)';

export function useAddLibraryMobileSheet() {
  return useMediaQuery(ADD_LIBRARY_MOBILE_QUERY);
}
