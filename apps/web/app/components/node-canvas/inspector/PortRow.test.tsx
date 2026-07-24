import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PortRow } from './PortRow';

describe('PortRow', () => {
  it('exposes connected and disconnected graph port states to assistive technology', () => {
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

    expect(html).toContain('data-inspector-connection-state="connected"');
    expect(html).toContain('data-inspector-connection-state="disconnected"');
    expect(html).toContain('Source input, connected');
    expect(html).toContain('Backdrop input, disconnected');
    expect(html).toContain('Image output, connected');
    expect(html.match(/data-inspector-connection-state="connected"/g)).toHaveLength(2);
  });
});
