import type { MetaDescriptor } from 'react-router';

export const SITE_ORIGIN = 'https://artifact.shchilkin.dev';

export interface PageMetaInput {
  title: string;
  description: string;
  /** Site-relative path used for og:url, e.g. `/docs`. */
  path: string;
}

/**
 * Title, description, and share metadata for one page. A route's `meta` replaces the root's, so every route
 * returns the full set; static share fields (image, card type) live in the root document head.
 */
export function pageMeta({ title, description, path }: PageMetaInput): MetaDescriptor[] {
  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: `${SITE_ORIGIN}${path}` },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
  ];
}
