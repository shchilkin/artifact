import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

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
    <label className={cn('artifact-search-field', className)}>
      <span className="artifact-search-icon" aria-hidden="true">
        ⌕
      </span>
      <input ref={ref} className={cn('artifact-search-input', inputClassName)} type="search" value={value} {...props} />
      {onClear && hasValue && (
        <button
          type="button"
          className={cn('artifact-search-clear', clearClassName)}
          onClick={onClear}
          aria-label="Clear search"
        >
          ×
        </button>
      )}
    </label>
  );
});
