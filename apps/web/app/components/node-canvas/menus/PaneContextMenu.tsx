import type { PaneMenuProps } from '../types';
import { NodeAddMenu } from './NodeAddMenu';

export function PaneContextMenu(props: PaneMenuProps) {
  return <NodeAddMenu {...props} />;
}
