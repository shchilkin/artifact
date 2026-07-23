import { Input } from '@artifact/ui';
import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';
import { IconButton } from './IconButton';

import './primitives.css';

interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  clearClassName?: string;
  inputClassName?: string;
  onClear?: () => void;
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { className, clearClassName, inputClassName, onClear, value, ...props },
  ref,
) {
  const hasValue = typeof value === 'string' ? value.length > 0 : Boolean(value);
  return (
    <div className={cn('artifact-search-field', className)}>
      <span className="artifact-search-icon" aria-hidden="true">
        ⌕
      </span>
      <Input ref={ref} className={cn('artifact-search-input', inputClassName)} type="search" value={value} {...props} />
      {onClear && hasValue && (
        <IconButton
          icon="×"
          label="Clear search"
          size="compact"
          className={cn('artifact-search-clear', clearClassName)}
          onClick={onClear}
        />
      )}
    </div>
  );
});
