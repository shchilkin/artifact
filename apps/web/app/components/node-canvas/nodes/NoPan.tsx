import {
  type ComponentPropsWithoutRef,
  type ElementType,
  type ForwardedRef,
  forwardRef,
  type ReactElement,
  type SyntheticEvent,
} from 'react';

import { callAll, stopNodeEvent } from '../helpers';

type NoPanProps<T extends ElementType = 'div'> = {
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, 'as'>;

const NoPanImpl = function NoPan<T extends ElementType = 'div'>(
  { as, className, onPointerDown, onMouseDown, onClick, onDoubleClick, ...props }: NoPanProps<T>,
  ref: ForwardedRef<Element>,
) {
  const Component = as ?? 'div';
  return (
    <Component
      ref={ref}
      className={className ? `nodrag ${className}` : 'nodrag'}
      onPointerDown={callAll(stopNodeEvent, onPointerDown as ((event: SyntheticEvent) => void) | undefined)}
      onMouseDown={callAll(stopNodeEvent, onMouseDown as ((event: SyntheticEvent) => void) | undefined)}
      onClick={callAll(stopNodeEvent, onClick as ((event: SyntheticEvent) => void) | undefined)}
      onDoubleClick={callAll(stopNodeEvent, onDoubleClick as ((event: SyntheticEvent) => void) | undefined)}
      {...props}
    />
  );
};

export const NoPan = forwardRef(NoPanImpl) as <T extends ElementType = 'div'>(
  props: NoPanProps<T> & { ref?: ForwardedRef<Element> },
) => ReactElement | null;
