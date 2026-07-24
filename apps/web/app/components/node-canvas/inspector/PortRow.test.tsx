import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PortRow } from './PortRow';

describe('PortRow', () => {
  it('exposes connected and disconnected graph input states accessibly', () => {
    const html = renderToStaticMarkup(
      <PortRow
        inputs={[
          { label: 'Source', nodeId: 'merge', portId: 'a' },
          { label: 'Backdrop', nodeId: 'merge', portId: 'b' },
        ]}
        outputs={[{ label: 'Image', nodeId: 'merge', portId: 'out' }]}
        connected={{
          sources: new Set(['merge::out']),
          targets: new Set(['merge::a']),
        }}
      />,
    );

    expect(html).toContain('aria-label="Source input, connected"');
    expect(html).toContain('aria-label="Backdrop input, disconnected"');
    expect(html).toContain('aria-label="Image output, connected"');
    expect(html.match(/data-inspector-connection-state="connected"/g)).toHaveLength(2);
  });
});
