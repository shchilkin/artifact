import { useEffect, useState } from 'react';

const ADD_LIBRARY_MOBILE_QUERY = '(max-width: 640px)';

export function useAddLibraryMobileSheet() {
  const [mobileSheet, setMobileSheet] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(ADD_LIBRARY_MOBILE_QUERY);
    const handleChange = () => setMobileSheet(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return mobileSheet;
}
