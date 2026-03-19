import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { KeyboardEvent } from 'react';
import styles from './Combobox.module.css';

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  onChange?: (value: string | undefined) => void;
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  error?: string;
  creatable?: boolean;
  searchable?: boolean;
  clearable?: boolean;
  onSearch?: (query: string) => void;
  maxDisplayItems?: number;
  className?: string;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  loading = false,
  disabled = false,
  error,
  creatable = false,
  searchable = true,
  clearable = false,
  onSearch,
  maxDisplayItems = 100,
  className,
}: ComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  const filtered = useMemo(() => {
    if (!query) return options.slice(0, maxDisplayItems);
    const q = query.toLowerCase();
    return options
      .filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
      .slice(0, maxDisplayItems);
  }, [options, query, maxDisplayItems]);

  const open = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    setHighlightIndex(-1);
  }, [disabled]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setHighlightIndex(-1);
  }, []);

  const selectValue = useCallback(
    (val: string) => {
      onChange?.(val);
      close();
    },
    [onChange, close],
  );

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, close]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        open();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && filtered[highlightIndex]) {
          selectValue(filtered[highlightIndex].value);
        } else if (creatable && query.trim()) {
          selectValue(query.trim());
        }
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
    }
  };

  const handleInputChange = (val: string) => {
    setQuery(val);
    setHighlightIndex(-1);
    if (!isOpen) open();
    onSearch?.(val);
  };

  const displayValue = isOpen ? query : (selectedOption?.label ?? value ?? '');

  const wrapperCls = [
    styles.wrapper,
    error && styles.hasError,
    disabled && styles.disabled,
    isOpen && styles.open,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div ref={wrapperRef} className={wrapperCls}>
      <div className={styles.inputWrapper} onClick={() => !isOpen && open()}>
        {searchable ? (
          <input
            ref={inputRef}
            className={styles.input}
            value={displayValue}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(e) => handleInputChange(e.currentTarget.value)}
            onFocus={open}
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />
        ) : (
          <div
            className={styles.display}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={handleKeyDown}
            onFocus={open}
          >
            {selectedOption?.label || value || <span className={styles.placeholder}>{placeholder}</span>}
          </div>
        )}
        <div className={styles.controls}>
          {loading && <span className={styles.spinner} />}
          {clearable && value && !disabled && (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={(e) => {
                e.stopPropagation();
                onChange?.(undefined);
                setQuery('');
              }}
              tabIndex={-1}
            >
              ×
            </button>
          )}
          <span className={styles.chevron}>▾</span>
        </div>
      </div>

      {isOpen && (
        <ul ref={listRef} className={styles.dropdown} role="listbox">
          {filtered.length === 0 && !creatable && (
            <li className={styles.empty}>
              {loading ? 'Loading...' : 'No options'}
            </li>
          )}
          {filtered.map((opt, i) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={[
                styles.option,
                i === highlightIndex && styles.highlighted,
                opt.value === value && styles.selected,
              ].filter(Boolean).join(' ')}
              onMouseEnter={() => setHighlightIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                selectValue(opt.value);
              }}
            >
              <span className={styles.optionLabel}>{opt.label}</span>
              {opt.description && (
                <span className={styles.optionDesc}>{opt.description}</span>
              )}
            </li>
          ))}
          {creatable && query.trim() && !filtered.some((o) => o.value === query.trim()) && (
            <li
              className={[styles.option, styles.creatableOption].filter(Boolean).join(' ')}
              onMouseDown={(e) => {
                e.preventDefault();
                selectValue(query.trim());
              }}
            >
              Create "{query.trim()}"
            </li>
          )}
        </ul>
      )}

      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
