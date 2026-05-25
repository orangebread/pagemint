import { parseHTML } from 'linkedom';

export interface PreparedCleanModeDom {
  window: Window & typeof globalThis;
  document: Document;
}

export function prepareCleanModeDomEnvironment(html: string): PreparedCleanModeDom {
  const { window } = parseHTML(html);
  const { document } = window;

  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
    configurable: true,
    get() {
      return this.textContent ?? '';
    }
  });

  const inferWidth = (element: HTMLElement) => {
    if (element.tagName === 'ASIDE' || element.classList.contains('pane')) {
      return 280;
    }

    if (element.tagName === 'ARTICLE') {
      return 720;
    }

    if (element.tagName === 'MAIN') {
      return 760;
    }

    if (element.tagName === 'SECTION') {
      return element.closest('.grid') ? 520 : 680;
    }

    if (element.classList.contains('result')) {
      return 680;
    }

    return 640;
  };

  Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get() {
      if (this.hasAttribute('hidden')) {
        return 0;
      }

      return inferWidth(this as HTMLElement);
    }
  });

  Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      if (this.hasAttribute('hidden')) {
        return 0;
      }

      const textLength = (this.textContent ?? '').replace(/\s+/g, ' ').trim().length;
      return Math.max(36, Math.min(920, (textLength * 0.9) + (this.querySelectorAll('*').length * 12)));
    }
  });

  window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    const width = this.offsetWidth;
    const height = this.offsetHeight;

    return {
      x: 0,
      y: 0,
      top: 0,
      right: width,
      bottom: height,
      left: 0,
      width,
      height,
      toJSON() {
        return this;
      }
    };
  };

  window.HTMLElement.prototype.getClientRects = function getClientRects() {
    return this.offsetWidth > 0 || this.offsetHeight > 0
      ? [this.getBoundingClientRect()]
      : [];
  };

  window.getComputedStyle = ((element: Element) => {
    const htmlElement = element as HTMLElement;
    const hidden = htmlElement.hasAttribute('hidden');

    return {
      display: hidden ? 'none' : 'block',
      visibility: hidden ? 'hidden' : 'visible',
      position: 'static'
    } as CSSStyleDeclaration;
  }) as typeof window.getComputedStyle;

  window.innerWidth = 1280;
  window.innerHeight = 900;

  return { window, document };
}

export async function withCleanModeWindowGlobals<T>(
  pageWindow: Window & typeof globalThis,
  callback: () => T | Promise<T>
): Promise<T> {
  const eventListeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const addEventListener = typeof pageWindow.addEventListener === 'function'
    ? pageWindow.addEventListener.bind(pageWindow)
    : ((type: string, listener: EventListenerOrEventListenerObject) => {
        const listeners = eventListeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
        listeners.add(listener);
        eventListeners.set(type, listeners);
      });
  const removeEventListener = typeof pageWindow.removeEventListener === 'function'
    ? pageWindow.removeEventListener.bind(pageWindow)
    : ((type: string, listener: EventListenerOrEventListenerObject) => {
        eventListeners.get(type)?.delete(listener);
      });
  const dispatchEvent = typeof pageWindow.dispatchEvent === 'function'
    ? pageWindow.dispatchEvent.bind(pageWindow)
    : ((event: Event) => {
        for (const listener of eventListeners.get(event.type) ?? []) {
          if (typeof listener === 'function') {
            listener.call(pageWindow, event);
          } else {
            listener.handleEvent(event);
          }
        }

        return true;
      });
  const boundGetComputedStyle = typeof pageWindow.getComputedStyle === 'function'
    ? pageWindow.getComputedStyle.bind(pageWindow)
    : (() => ({ display: 'block', visibility: 'visible', position: 'static' } as CSSStyleDeclaration));
  const boundScrollTo = typeof pageWindow.scrollTo === 'function'
    ? pageWindow.scrollTo.bind(pageWindow)
    : (() => undefined);
  const boundRequestAnimationFrame = typeof pageWindow.requestAnimationFrame === 'function'
    ? pageWindow.requestAnimationFrame.bind(pageWindow)
    : ((callback: FrameRequestCallback) => {
        const timeoutHandle = setTimeout(() => callback(0), 0);
        return timeoutHandle as unknown as number;
      });
  const boundCancelAnimationFrame = typeof pageWindow.cancelAnimationFrame === 'function'
    ? pageWindow.cancelAnimationFrame.bind(pageWindow)
    : ((handle: number) => clearTimeout(handle));
  const globalKeys = [
    'window',
    'self',
    'document',
    'Node',
    'Element',
    'HTMLElement',
    'HTMLDetailsElement',
    'HTMLImageElement',
    'HTMLLinkElement',
    'HTMLSourceElement',
    'HTMLPictureElement',
    'HTMLStyleElement',
    'MutationObserver',
    'addEventListener',
    'removeEventListener',
    'dispatchEvent',
    'navigator',
    'location',
    'getComputedStyle',
    'scrollTo',
    'scrollX',
    'scrollY',
    'innerWidth',
    'innerHeight',
    'requestAnimationFrame',
    'cancelAnimationFrame'
  ] as const;

  const previousDescriptors = globalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const pageEntries = {
    window: pageWindow,
    self: pageWindow,
    document: pageWindow.document,
    Node: pageWindow.Node,
    Element: pageWindow.Element,
    HTMLElement: pageWindow.HTMLElement,
    HTMLDetailsElement: pageWindow.HTMLDetailsElement,
    HTMLImageElement: pageWindow.HTMLImageElement,
    HTMLLinkElement: pageWindow.HTMLLinkElement,
    HTMLSourceElement: pageWindow.HTMLSourceElement,
    HTMLPictureElement: pageWindow.HTMLPictureElement,
    HTMLStyleElement: pageWindow.HTMLStyleElement,
    MutationObserver: pageWindow.MutationObserver,
    addEventListener,
    removeEventListener,
    dispatchEvent,
    navigator: pageWindow.navigator,
    location: pageWindow.location,
    getComputedStyle: boundGetComputedStyle,
    scrollTo: boundScrollTo,
    scrollX: pageWindow.scrollX,
    scrollY: pageWindow.scrollY,
    innerWidth: pageWindow.innerWidth,
    innerHeight: pageWindow.innerHeight,
    requestAnimationFrame: boundRequestAnimationFrame,
    cancelAnimationFrame: boundCancelAnimationFrame
  } satisfies Record<string, unknown>;

  for (const [key, value] of Object.entries(pageEntries)) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value
    });
  }

  try {
    return await callback();
  } finally {
    for (const [key, descriptor] of previousDescriptors) {
      if (typeof descriptor === 'undefined') {
        delete (globalThis as Record<string, unknown>)[key];
        continue;
      }

      Object.defineProperty(globalThis, key, descriptor);
    }
  }
}
