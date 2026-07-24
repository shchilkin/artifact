import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ShaderStatusMessage } from './ShaderStatusMessage';

describe('ShaderStatusMessage', () => {
  it.each([
    ['info', 'Checking AI access'],
    ['warning', 'Could not validate shader'],
    ['success', 'Shader accepted'],
  ] as const)('uses the shared inspector %s status contract', (tone, title) => {
    const html = renderToStaticMarkup(<ShaderStatusMessage title={title} message="Status detail" tone={tone} />);

    expect(html).toContain(`data-inspector-status="${tone}"`);
    expect(html).toContain(title);
    expect(html).toContain('Status detail');
  });
});
