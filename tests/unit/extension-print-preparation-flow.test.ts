import assert from 'node:assert/strict';
import test from 'node:test';

import { buildExactExportRequest } from '../../packages/render-core/src/index.ts';
import { runBrowserPrintPageAction } from '../../apps/extension/src/lib/exact-export-flow.ts';

class MockStyle {
  contentVisibility = '';
  position = '';
  private priorities = new Map<string, string>();

  setProperty(name: string, value: string, priority = ''): void {
    if (name === 'content-visibility') {
      this.contentVisibility = value;
    }

    if (name === 'position') {
      this.position = value;
    }

    this.priorities.set(name, priority);
  }

  getPropertyPriority(name: string): string {
    return this.priorities.get(name) ?? '';
  }
}

class MockElement {
  tagName: string;
  id = '';
  textContent = '';
  parentNode: MockElement | null = null;
  children: MockElement[] = [];
  style = new MockStyle();
  private attributes = new Map<string, string>();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  appendChild(child: MockElement): MockElement {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove(): void {
    if (!this.parentNode) {
      return;
    }

    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === 'id') {
      this.id = value;
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name === 'id') {
      this.id = '';
    }
  }
}

class MockDetailsElement extends MockElement {
  constructor() {
    super('details');
  }
}

class MockDocument {
  readonly head = new MockElement('head');
  readonly body = new MockElement('body');
  readonly documentElement = new MockElement('html');
  readonly images: never[] = [];
  private readonly closedDetails: MockDetailsElement[];
  private readonly bodyElements: MockElement[];

  constructor(options: { closedDetails?: MockDetailsElement[]; bodyElements?: MockElement[] } = {}) {
    this.closedDetails = options.closedDetails ?? [];
    this.bodyElements = options.bodyElements ?? [];
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    for (const element of this.bodyElements) {
      this.body.appendChild(element);
    }
  }

  createElement(tagName: string): MockElement {
    return new MockElement(tagName);
  }

  getElementById(id: string): MockElement | null {
    const stack = [this.documentElement];

    while (stack.length) {
      const node = stack.pop();
      if (!node) {
        continue;
      }

      if (node.id === id) {
        return node;
      }

      stack.push(...node.children);
    }

    return null;
  }

  querySelectorAll<T extends MockElement>(selector: string): T[] {
    if (selector === 'details:not([open])') {
      return this.closedDetails.filter((element) => !element.hasAttribute('open')) as T[];
    }

    if (selector === 'body *') {
      return [...this.bodyElements, ...this.closedDetails] as T[];
    }

    return [];
  }
}

function createDomHarness(options: {
  getComputedStyle?: (element: MockElement) => { contentVisibility: string; position: string };
  print?: () => void;
} = {}) {
  const listeners = new Map<string, Array<() => void>>();
  const globalWithDom = globalThis as typeof globalThis & {
    window?: unknown;
    document?: unknown;
    addEventListener?: unknown;
    requestAnimationFrame?: unknown;
    requestIdleCallback?: unknown;
    getComputedStyle?: unknown;
    scrollTo?: unknown;
    print?: unknown;
    scrollX?: number;
    scrollY?: number;
  };
  const previousGlobals = {
    window: globalWithDom.window,
    document: globalWithDom.document,
    addEventListener: globalWithDom.addEventListener,
    requestAnimationFrame: globalWithDom.requestAnimationFrame,
    requestIdleCallback: globalWithDom.requestIdleCallback,
    getComputedStyle: globalWithDom.getComputedStyle,
    scrollTo: globalWithDom.scrollTo,
    print: globalWithDom.print,
    scrollX: globalWithDom.scrollX,
    scrollY: globalWithDom.scrollY
  };

  const mockWindow = {
    addEventListener(type: string, listener: () => void) {
      const existing = listeners.get(type) ?? [];
      existing.push(listener);
      listeners.set(type, existing);
    },
    requestAnimationFrame(callback: () => void) {
      callback();
      return 1;
    },
    requestIdleCallback(callback: () => void) {
      callback();
      return 1;
    },
    getComputedStyle(element: MockElement) {
      return options.getComputedStyle?.(element) ?? { contentVisibility: 'visible', position: 'static' };
    },
    scrollTo() {
      return undefined;
    },
    print() {
      options.print?.();
    },
    scrollX: 0,
    scrollY: 0
  };

  return {
    listeners,
    install(document: MockDocument) {
      Object.assign(globalWithDom, mockWindow, {
        window: mockWindow,
        document
      });
    },
    restore() {
      Object.assign(globalWithDom, previousGlobals);
    }
  };
}

test('beforeunload cleanup restores prepared mutations when afterprint does not fire', async () => {
  const closedDetails = new MockDetailsElement();
  const document = new MockDocument({ closedDetails: [closedDetails] });
  let printCalls = 0;
  const harness = createDomHarness({
    print() {
      printCalls += 1;
    }
  });

  try {
    harness.install(document);

    const request = buildExactExportRequest({
      url: 'https://example.com/article',
      title: 'Article'
    });

    const preparationResult = await runBrowserPrintPageAction({
      kind: 'prepare-stage',
      request,
      stageId: 'details-expansion'
    });
    assert.equal('execution' in preparationResult, true);
    assert.equal(closedDetails.hasAttribute('open'), true);

    const launchResult = await runBrowserPrintPageAction({
      kind: 'launch-print',
      request
    });
    assert.deepEqual(launchResult, { ok: true });
    assert.equal(printCalls, 1);
    assert.equal(document.getElementById('pagemint-exact-export-print-style')?.id, 'pagemint-exact-export-print-style');
    assert.equal(document.documentElement.getAttribute('data-pagemint-exact-layout'), request.config.layout);
    assert.equal(harness.listeners.get('afterprint')?.length, 1);
    assert.equal(harness.listeners.get('beforeunload')?.length, 1);

    harness.listeners.get('beforeunload')?.[0]?.();

    assert.equal(closedDetails.hasAttribute('open'), false);
    assert.equal(document.getElementById('pagemint-exact-export-print-style'), null);
    assert.equal(document.documentElement.hasAttribute('data-pagemint-exact-layout'), false);
  } finally {
    harness.restore();
  }
});

test('paginated sticky suppression targets stylesheet-defined sticky and fixed elements instead of broad body children', async () => {
  const stickyHeader = new MockElement('header');
  const fixedSidebar = new MockElement('aside');
  const normalSection = new MockElement('section');
  const document = new MockDocument({ bodyElements: [stickyHeader, fixedSidebar, normalSection] });
  const harness = createDomHarness({
    getComputedStyle(element) {
      return {
        contentVisibility: 'visible',
        position:
          element === stickyHeader ? 'sticky' : element === fixedSidebar ? 'fixed' : 'relative'
      };
    }
  });

  try {
    harness.install(document);

    const request = buildExactExportRequest({
      url: 'https://example.com/dashboard',
      title: 'Dashboard'
    });

    const suppressionResult = await runBrowserPrintPageAction({
      kind: 'prepare-stage',
      request,
      stageId: 'paginated-sticky-suppression'
    });

    assert.equal('execution' in suppressionResult, true);
    if ('execution' in suppressionResult) {
      assert.equal(suppressionResult.execution.affectedCount, 2);
    }
    assert.equal(stickyHeader.style.position, 'static');
    assert.equal(fixedSidebar.style.position, 'static');
    assert.equal(normalSection.style.position, '');

    await runBrowserPrintPageAction({
      kind: 'restore-stage',
      stageId: 'paginated-sticky-suppression'
    });

    assert.equal(stickyHeader.style.position, '');
    assert.equal(fixedSidebar.style.position, '');
    assert.equal(normalSection.style.position, '');
  } finally {
    harness.restore();
  }
});
