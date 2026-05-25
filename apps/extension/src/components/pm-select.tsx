import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from 'react';

import './pm-select.css';

export interface PmSelectOption<T extends string | number | boolean> {
  value: T;
  label: string;
}

export interface PmSelectProps<T extends string | number | boolean> {
  id?: string;
  value: T;
  options: ReadonlyArray<PmSelectOption<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  className?: string;
  size?: 'default' | 'compact';
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 4.5 3 3 3-3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m2.5 6 2.5 2.5L9.5 3.5" />
    </svg>
  );
}

export function PmSelect<T extends string | number | boolean>({
  id,
  value,
  options,
  onChange,
  disabled = false,
  placeholder,
  ariaLabel,
  ariaLabelledBy,
  className,
  size = 'default'
}: PmSelectProps<T>) {
  const reactId = useId();
  const rootId = id ?? `pm-select-${reactId}`;
  const listboxId = `${rootId}-listbox`;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeaheadBufferRef = useRef<{ buffer: string; lastKeyAt: number }>({ buffer: '', lastKeyAt: 0 });
  const shouldRestoreFocusRef = useRef(false);

  const selectedIndex = useMemo(
    () => Math.max(0, options.findIndex((option) => option.value === value)),
    [options, value]
  );
  const selectedOption = options[selectedIndex];
  const [activeIndex, setActiveIndex] = useState(selectedIndex);

  useEffect(() => {
    if (!open) {
      setActiveIndex(selectedIndex);
    }
  }, [open, selectedIndex]);

  const closeAndRestore = useCallback(() => {
    shouldRestoreFocusRef.current = true;
    setOpen(false);
  }, []);

  const commitSelection = useCallback(
    (nextIndex: number) => {
      const option = options[nextIndex];
      if (!option) return;
      if (option.value !== value) {
        onChange(option.value);
      }
      closeAndRestore();
    },
    [closeAndRestore, onChange, options, value]
  );

  useLayoutEffect(() => {
    if (!open && shouldRestoreFocusRef.current) {
      shouldRestoreFocusRef.current = false;
      triggerRef.current?.focus();
      return;
    }
    if (open) {
      listRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeAndRestore();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [closeAndRestore, open]);

  useEffect(() => {
    if (!open) return;
    const activeOption = listRef.current?.querySelector<HTMLElement>(`[data-pm-option-index="${activeIndex}"]`);
    activeOption?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Enter':
      case ' ':
        event.preventDefault();
        setOpen(true);
        setActiveIndex(selectedIndex);
        return;
      case 'Home':
        event.preventDefault();
        setOpen(true);
        setActiveIndex(0);
        return;
      case 'End':
        event.preventDefault();
        setOpen(true);
        setActiveIndex(options.length - 1);
        return;
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          setOpen(true);
          applyTypeahead(event.key, selectedIndex);
        }
    }
  };

  const handleListKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % options.length);
        return;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + options.length) % options.length);
        return;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        return;
      case 'End':
        event.preventDefault();
        setActiveIndex(options.length - 1);
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        commitSelection(activeIndex);
        return;
      case 'Tab':
        closeAndRestore();
        return;
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          applyTypeahead(event.key, activeIndex);
        }
    }
  };

  const applyTypeahead = (char: string, startIndex: number) => {
    const now = Date.now();
    const prev = typeaheadBufferRef.current;
    const buffer = now - prev.lastKeyAt > 600 ? char.toLowerCase() : (prev.buffer + char).toLowerCase();
    typeaheadBufferRef.current = { buffer, lastKeyAt: now };

    const start = (startIndex + 1) % options.length;
    for (let offset = 0; offset < options.length; offset += 1) {
      const index = (start + offset) % options.length;
      if (options[index]?.label.toLowerCase().startsWith(buffer)) {
        setActiveIndex(index);
        return;
      }
    }
    if (buffer.length > 1) {
      const single = char.toLowerCase();
      for (let offset = 0; offset < options.length; offset += 1) {
        const index = (start + offset) % options.length;
        if (options[index]?.label.toLowerCase().startsWith(single)) {
          typeaheadBufferRef.current = { buffer: single, lastKeyAt: now };
          setActiveIndex(index);
          return;
        }
      }
    }
  };

  const handleOptionPointerDown = (event: ReactMouseEvent<HTMLLIElement>, index: number) => {
    event.preventDefault();
    commitSelection(index);
  };

  const handleOptionMouseEnter = (index: number) => {
    setActiveIndex(index);
  };

  return (
    <div
      className={`pm-select${open ? ' pm-select--open' : ''}${disabled ? ' pm-select--disabled' : ''}${size === 'compact' ? ' pm-select--compact' : ''}${className ? ` ${className}` : ''}`}
    >
      <button
        ref={triggerRef}
        id={rootId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-activedescendant={open ? `${rootId}-option-${activeIndex}` : undefined}
        className="pm-select-trigger"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
          if (!open) setActiveIndex(selectedIndex);
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="pm-select-value">
          {selectedOption?.label ?? placeholder ?? ''}
        </span>
        <span className="pm-select-chevron" aria-hidden="true">
          <ChevronIcon />
        </span>
      </button>
      {open ? (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-activedescendant={`${rootId}-option-${activeIndex}`}
          tabIndex={-1}
          className="pm-select-list"
          onKeyDown={handleListKeyDown}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <li
                key={`${String(option.value)}-${index}`}
                id={`${rootId}-option-${index}`}
                role="option"
                aria-selected={isSelected}
                data-pm-option-index={index}
                className={`pm-select-option${isActive ? ' pm-select-option--active' : ''}${isSelected ? ' pm-select-option--selected' : ''}`}
                onMouseDown={(event) => handleOptionPointerDown(event, index)}
                onMouseEnter={() => handleOptionMouseEnter(index)}
              >
                <span className="pm-select-option-check" aria-hidden="true">
                  {isSelected ? <CheckIcon /> : null}
                </span>
                <span className="pm-select-option-label">{option.label}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
