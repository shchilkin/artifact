import { NodeAddMenu } from './NodeAddMenu';
import type { PaneMenuProps } from '../types';

export function PaneContextMenu(props: PaneMenuProps) {
  return <NodeAddMenu {...props} />;
}
