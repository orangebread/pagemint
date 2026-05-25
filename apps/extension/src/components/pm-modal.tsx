import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from 'react';

import './pm-modal.css';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

export interface PmModalProps {
  open: boolean;
  onRequestClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  initialFocusSelector?: string;
}

export function PmModal({
  open,
  onRequestClose,
  title,
  description,
  children,
  initialFocusSelector
}: PmModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const reactId = useId();
  const titleId = `pm-modal-title-${reactId}`;
  const descriptionId = description ? `pm-modal-description-${reactId}` : undefined;

  useEffect(() => {
    if (!open) return;
    previousActiveElementRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTarget = initialFocusSelector
      ? dialogRef.current?.querySelector<HTMLElement>(initialFocusSelector)
      : dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    focusTarget?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      previousActiveElementRef.current?.focus?.();
    };
  }, [initialFocusSelector, open]);

  const handleBackdropPointerDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        onRequestClose();
      }
    },
    [onRequestClose]
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onRequestClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((element) => !element.hasAttribute('aria-hidden'));
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      }
    },
    [onRequestClose]
  );

  if (!open) return null;

  return (
    <div className="pm-modal-backdrop" onMouseDown={handleBackdropPointerDown}>
      <div
        ref={dialogRef}
        className="pm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
      >
        <div className="pm-modal__header">
          <h2 id={titleId} className="pm-modal__title">{title}</h2>
          <button
            type="button"
            className="pm-modal__close"
            aria-label="Close"
            onClick={onRequestClose}
          >
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
              <path d="m3 3 6 6M9 3l-6 6" />
            </svg>
          </button>
        </div>
        {description ? (
          <p id={descriptionId} className="pm-modal__description">{description}</p>
        ) : null}
        <div className="pm-modal__body">{children}</div>
      </div>
    </div>
  );
}
