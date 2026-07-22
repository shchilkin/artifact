import type { CommandSize, CommandVariant } from './commands';

export function commandClassName(variant: CommandVariant, className?: string, size: CommandSize = 'default') {
  return ['ui-command', `ui-command--${variant}`, size === 'compact' ? 'ui-command--compact' : undefined, className]
    .filter(Boolean)
    .join(' ');
}
