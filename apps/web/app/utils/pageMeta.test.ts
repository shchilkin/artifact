import { describe, expect, it } from 'vitest';
import { pageMeta } from './pageMeta';

describe('pageMeta', () => {
  it('mirrors the page title and description into share metadata with the page URL', () => {
    expect(pageMeta({ title: 'Docs | Artifact', description: 'Help.', path: '/docs' })).toEqual([
      { title: 'Docs | Artifact' },
      { name: 'description', content: 'Help.' },
      { property: 'og:title', content: 'Docs | Artifact' },
      { property: 'og:description', content: 'Help.' },
      { property: 'og:url', content: 'https://artifact.shchilkin.dev/docs' },
      { name: 'twitter:title', content: 'Docs | Artifact' },
      { name: 'twitter:description', content: 'Help.' },
    ]);
  });
});
