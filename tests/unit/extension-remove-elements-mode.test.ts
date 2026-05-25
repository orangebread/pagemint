import assert from 'node:assert/strict';
import test from 'node:test';

import {
  handleRemoveElementsModeTabMessage,
  registerRemoveElementsModeTabMessageHandler,
  runRemoveElementsModePageAction,
  startRemoveElementsModeForActiveTab,
  stopRemoveElementsModeForActiveTab
} from '../../apps/extension/src/lib/remove-elements-mode.ts';

class MockClassList {
  private readonly tokens = new Set<string>();

  add(...tokens: string[]): void {
    for (const token of tokens) {
      this.tokens.add(token);
    }
  }

  remove(...tokens: string[]): void {
    for (const token of tokens) {
      this.tokens.delete(token);
    }
  }

  contains(token: string): boolean {
    return this.tokens.has(token);
  }
}

class MockStyle {
  display = '';
  private priorities = new Map<string, string>();

  setProperty(name: string, value: string, priority = ''): void {
    if (name === 'display') {
      this.display = value;
    }

    this.priorities.set(name, priority);
  }

  getPropertyPriority(name: string): string {
    return this.priorities.get(name) ?? '';
  }

  clear(): void {
    this.display = '';
    this.priorities.clear();
  }
}

class MockElement {
  readonly tagName: string;
  id = '';
  innerHTML = '';
  textContent = '';
  parentNode: MockElement | null = null;
  children: MockElement[] = [];
  readonly classList = new MockClassList();
  readonly style = new MockStyle();
  private readonly attributes = new Map<string, string>();

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

    if (name === 'style') {
      this.style.clear();
      for (const declaration of value.split(';')) {
        const normalizedDeclaration = declaration.trim();
        if (!normalizedDeclaration) {
          continue;
        }

        const separatorIndex = normalizedDeclaration.indexOf(':');
        if (separatorIndex <= 0) {
          continue;
        }

        const propertyName = normalizedDeclaration.slice(0, separatorIndex).trim();
        const propertyValue = normalizedDeclaration.slice(separatorIndex + 1).trim();
        if (propertyName === 'display') {
          this.style.setProperty('display', propertyValue.replace(/\s*!important$/i, ''), /!important/i.test(propertyValue) ? 'important' : '');
        }
      }
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

    if (name === 'style') {
      this.style.clear();
    }
  }

  contains(candidate: unknown): boolean {
    if (candidate === this) {
      return true;
    }

    return this.children.some((child) => child.contains(candidate));
  }

  closest(selector: string): MockElement | null {
    if (!selector.startsWith('#')) {
      return null;
    }

    const expectedId = selector.slice(1);
    let current: MockElement | null = this;

    while (current) {
      if (current.id === expectedId) {
        return current;
      }

      current = current.parentNode;
    }

    return null;
  }
}

class MockDocument {
  readonly head = new MockElement('head');
  readonly body = new MockElement('body');
  readonly documentElement = new MockElement('html');
  readonly listeners = new Map<string, Array<(event: unknown) => void>>();

  constructor() {
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
  }

  createElement(tagName: string): MockElement {
    return new MockElement(tagName);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(type, existing.filter((candidate) => candidate !== listener));
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
}

function createEvent(target: MockElement, overrides: Record<string, unknown> = {}) {
  return {
    target,
    relatedTarget: null,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    key: '',
    defaultPrevented: false,
    propagationStopped: false,
    immediatePropagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    stopImmediatePropagation() {
      this.immediatePropagationStopped = true;
    },
    composedPath() {
      return [target];
    },
    ...overrides
  };
}

function createDomHarness() {
  const globalWithDom = globalThis as typeof globalThis & {
    document?: unknown;
    window?: unknown;
    HTMLElement?: unknown;
    __pagemintRemoveElementsMode?: unknown;
  };
  const previousGlobals = {
    document: globalWithDom.document,
    window: globalWithDom.window,
    HTMLElement: globalWithDom.HTMLElement,
    store: globalWithDom.__pagemintRemoveElementsMode
  };
  const document = new MockDocument();

  return {
    document,
    install() {
      globalWithDom.document = document;
      globalWithDom.window = globalWithDom;
      globalWithDom.HTMLElement = MockElement;
      globalWithDom.__pagemintRemoveElementsMode = undefined;
    },
    restore() {
      globalWithDom.document = previousGlobals.document;
      globalWithDom.window = previousGlobals.window;
      globalWithDom.HTMLElement = previousGlobals.HTMLElement;
      globalWithDom.__pagemintRemoveElementsMode = previousGlobals.store;
    }
  };
}

function createRuntimeHarness() {
  const globalWithRuntime = globalThis as typeof globalThis & {
    chrome?: unknown;
    browser?: unknown;
    __pagemintRemoveElementsModeListenerRegistered?: boolean;
    __pagemintRemoveElementsModeV2ListenerRegistered?: boolean;
  };
  const previousGlobals = {
    chrome: globalWithRuntime.chrome,
    browser: globalWithRuntime.browser,
    legacyRegistered: globalWithRuntime.__pagemintRemoveElementsModeListenerRegistered,
    registered: globalWithRuntime.__pagemintRemoveElementsModeV2ListenerRegistered
  };
  const listeners: Array<(message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | void> = [];
  const runtime = {
    onMessage: {
      addListener(listener: (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | void) {
        listeners.push(listener);
      }
    }
  };

  return {
    listeners,
    installOnChrome() {
      globalWithRuntime.chrome = { runtime };
      globalWithRuntime.browser = undefined;
      globalWithRuntime.__pagemintRemoveElementsModeV2ListenerRegistered = undefined;
    },
    installWithLegacyRegistrationFlag() {
      globalWithRuntime.chrome = { runtime };
      globalWithRuntime.browser = undefined;
      globalWithRuntime.__pagemintRemoveElementsModeListenerRegistered = true;
      globalWithRuntime.__pagemintRemoveElementsModeV2ListenerRegistered = undefined;
    },
    restore() {
      globalWithRuntime.chrome = previousGlobals.chrome;
      globalWithRuntime.browser = previousGlobals.browser;
      globalWithRuntime.__pagemintRemoveElementsModeListenerRegistered = previousGlobals.legacyRegistered;
      globalWithRuntime.__pagemintRemoveElementsModeV2ListenerRegistered = previousGlobals.registered;
    }
  };
}

test('remove-elements mode mirrors click-hide, undo, and exit behavior', () => {
  const harness = createDomHarness();
  const removableSection = new MockElement('section');
  const removableHeading = new MockElement('h2');
  removableSection.appendChild(removableHeading);
  harness.document.body.appendChild(removableSection);

  try {
    harness.install();

    const started = runRemoveElementsModePageAction({ kind: 'start' });
    assert.equal(started.ok, true);
    assert.equal(started.status, 'started');
    assert.equal(harness.document.getElementById('pagemint-remove-elements-style')?.id, 'pagemint-remove-elements-style');
    assert.equal(harness.document.getElementById('pagemint-remove-elements-guide')?.id, 'pagemint-remove-elements-guide');
    assert.equal(harness.document.listeners.get('click')?.length, 1);

    const mouseoverEvent = createEvent(removableHeading);
    harness.document.listeners.get('mouseover')?.[0]?.(mouseoverEvent);
    assert.equal(removableHeading.classList.contains('pagemint-remove-elements-highlight'), true);

    const clickEvent = createEvent(removableHeading);
    harness.document.listeners.get('click')?.[0]?.(clickEvent);
    assert.equal(removableHeading.style.display, 'none');
    assert.equal(removableHeading.style.getPropertyPriority('display'), 'important');
    assert.equal(clickEvent.defaultPrevented, true);
    assert.equal(clickEvent.immediatePropagationStopped, true);

    const undoEvent = createEvent(removableHeading, {
      ctrlKey: true,
      key: 'z'
    });
    harness.document.listeners.get('keydown')?.[0]?.(undoEvent);
    assert.equal(removableHeading.hasAttribute('style'), false);
    assert.equal(removableHeading.style.display, '');

    const escapeEvent = createEvent(removableHeading, {
      key: 'Escape'
    });
    harness.document.listeners.get('keydown')?.[0]?.(escapeEvent);
    assert.equal(harness.document.getElementById('pagemint-remove-elements-style'), null);
    assert.equal(harness.document.getElementById('pagemint-remove-elements-guide'), null);
    assert.equal(harness.document.listeners.get('click')?.length ?? 0, 0);
  } finally {
    harness.restore();
  }
});

test('remove-elements undo restores the original inline style string without reparsing it', () => {
  const harness = createDomHarness();
  const removableCard = new MockElement('section');
  removableCard.setAttribute('style', 'display:grid;background-image:url("data:image/svg+xml;utf8,<svg></svg>")');
  harness.document.body.appendChild(removableCard);

  try {
    harness.install();

    runRemoveElementsModePageAction({ kind: 'start' });

    const clickEvent = createEvent(removableCard);
    harness.document.listeners.get('click')?.[0]?.(clickEvent);
    assert.equal(removableCard.style.display, 'none');

    const undoEvent = createEvent(removableCard, {
      metaKey: true,
      key: 'z'
    });
    harness.document.listeners.get('keydown')?.[0]?.(undoEvent);

    assert.equal(
      removableCard.getAttribute('style'),
      'display:grid;background-image:url("data:image/svg+xml;utf8,<svg></svg>")'
    );
    assert.equal(removableCard.style.display, 'grid');
  } finally {
    harness.restore();
  }
});

test('remove-elements runtime registration is idempotent and ignores unrelated messages', () => {
  const runtimeHarness = createRuntimeHarness();

  try {
    runtimeHarness.installOnChrome();

    registerRemoveElementsModeTabMessageHandler();
    registerRemoveElementsModeTabMessageHandler();

    assert.equal(runtimeHarness.listeners.length, 1);
    assert.equal(runtimeHarness.listeners[0]?.({ kind: 'other' }, {}, () => undefined), undefined);
  } finally {
    runtimeHarness.restore();
  }
});

test('remove-elements runtime registration bypasses stale legacy listener guards', () => {
  const runtimeHarness = createRuntimeHarness();

  try {
    runtimeHarness.installWithLegacyRegistrationFlag();

    registerRemoveElementsModeTabMessageHandler();

    assert.equal(runtimeHarness.listeners.length, 1);
    assert.equal(
      runtimeHarness.listeners[0]?.({ kind: 'pagemint.remove-elements-mode', command: 'ping' }, {}, () => undefined),
      undefined
    );

    let response: unknown;
    runtimeHarness.listeners[0]?.({ kind: 'pagemint.remove-elements-mode:v2', command: 'ping' }, {}, (value) => {
      response = value;
    });
    assert.deepEqual(response, {
      ok: true,
      status: 'ready',
      removedCount: 0
    });
  } finally {
    runtimeHarness.restore();
  }
});

test('remove-elements runtime listener maps ping, start, and stop messages to the page controller', () => {
  const domHarness = createDomHarness();
  const runtimeHarness = createRuntimeHarness();
  const removableHeading = new MockElement('h2');
  domHarness.document.body.appendChild(removableHeading);

  try {
    domHarness.install();
    runtimeHarness.installOnChrome();
    registerRemoveElementsModeTabMessageHandler();

    const listener = runtimeHarness.listeners[0];
    assert.ok(listener);

    let response: unknown;
    listener?.({ kind: 'pagemint.remove-elements-mode:v2', command: 'ping' }, {}, (value) => {
      response = value;
    });
    assert.deepEqual(response, {
      ok: true,
      status: 'ready',
      removedCount: 0
    });

    response = undefined;
    listener?.({ kind: 'pagemint.remove-elements-mode:v2', command: 'start' }, {}, (value) => {
      response = value;
    });
    assert.deepEqual(response, {
      ok: true,
      status: 'started',
      removedCount: 0
    });
    assert.equal(domHarness.document.listeners.get('click')?.length, 1);

    response = undefined;
    listener?.({ kind: 'pagemint.remove-elements-mode:v2', command: 'stop' }, {}, (value) => {
      response = value;
    });
    assert.deepEqual(response, {
      ok: true,
      status: 'stopped',
      removedCount: 0
    });
  } finally {
    runtimeHarness.restore();
    domHarness.restore();
  }
});

test('remove-elements message handler ignores unrelated payloads', () => {
  assert.equal(handleRemoveElementsModeTabMessage({ kind: 'other' }), null);
  assert.equal(handleRemoveElementsModeTabMessage({ kind: 'pagemint.remove-elements-mode', command: 'start' }), null);
  assert.equal(handleRemoveElementsModeTabMessage(null), null);
});

test('starting remove-elements mode requires a supported active tab', async () => {
  const unsupported = await startRemoveElementsModeForActiveTab(
    {
      async query() {
        return [
          {
            id: 7,
            url: 'chrome://extensions',
            title: 'Extensions'
          }
        ];
      },
      async sendMessage() {
        assert.fail('sendMessage should not run on unsupported pages');
      }
    },
    {
      async executeScript() {
        assert.fail('executeScript should not run on unsupported pages');
      }
    }
  );

  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.code, 'unsupported-page');
});

test('starting remove-elements mode classifies runtime injection denials explicitly', async () => {
  const denied = await startRemoveElementsModeForActiveTab(
    {
      async query() {
        return [
          {
            id: 12,
            url: 'https://example.com/article',
            title: 'Article'
          }
        ];
      },
      async sendMessage(_tabId, message) {
        if (message.command === 'ping') {
          throw new Error('Could not establish connection. Receiving end does not exist.');
        }

        assert.fail('start should not run when injection is denied');
      }
    },
    {
      async executeScript() {
        throw new Error('Cannot access contents of the page. Extension manifest must request permission to access the respective host.');
      }
    }
  );

  assert.equal(denied.ok, false);
  assert.equal(denied.code, 'permission-denied');
});

test('starting remove-elements mode classifies missing runtime files distinctly', async () => {
  const failed = await startRemoveElementsModeForActiveTab(
    {
      async query() {
        return [
          {
            id: 12,
            url: 'https://example.com/article',
            title: 'Article'
          }
        ];
      },
      async sendMessage(_tabId, message) {
        if (message.command === 'ping') {
          throw new Error('Could not establish connection. Receiving end does not exist.');
        }

        assert.fail('start should not run when runtime injection fails');
      }
    },
    {
      async executeScript() {
        throw new Error("Could not load file: 'remove-elements-runtime.js'.");
      }
    }
  );

  assert.equal(failed.ok, false);
  assert.equal(failed.code, 'runtime-unavailable');
  assert.match(failed.message, /remove-elements-runtime\.js/);
});

test('starting remove-elements mode reinjects the tab runtime when the receiver is missing', async () => {
  const sentCommands: string[] = [];
  let injectedFiles: string[] | null = null;

  const result = await startRemoveElementsModeForActiveTab(
    {
      async query() {
        return [
          {
            id: 12,
            url: 'https://example.com/article',
            title: 'Article'
          }
        ];
      },
      async sendMessage(_tabId, message) {
        sentCommands.push(message.command);

        if (message.command === 'ping') {
          throw new Error('Could not establish connection. Receiving end does not exist.');
        }

        return {
          ok: true,
          status: 'started',
          removedCount: 0
        };
      }
    },
    {
      async executeScript(details) {
        if (!('files' in details)) {
          assert.fail('remove-elements bootstrap should inject the runtime file, not a page function');
        }

        injectedFiles = details.files.slice();
        return [null];
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, 'started');
  assert.deepEqual(sentCommands, ['ping', 'start']);
  assert.deepEqual(injectedFiles, ['remove-elements-runtime.js']);
});

test('starting remove-elements mode reinjects when a stale receiver returns a malformed ping', async () => {
  const sentCommands: string[] = [];
  let injectedFiles: string[] | null = null;

  const result = await startRemoveElementsModeForActiveTab(
    {
      async query() {
        return [
          {
            id: 12,
            url: 'https://example.com/article',
            title: 'Article'
          }
        ];
      },
      async sendMessage(_tabId, message) {
        sentCommands.push(message.command);

        if (message.command === 'ping') {
          return undefined;
        }

        return {
          ok: true,
          status: 'started',
          removedCount: 0
        };
      }
    },
    {
      async executeScript(details) {
        if (!('files' in details)) {
          assert.fail('remove-elements startup should inject its runtime file');
        }

        injectedFiles = details.files.slice();
        return [null];
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, 'started');
  assert.deepEqual(sentCommands, ['ping', 'start']);
  assert.deepEqual(injectedFiles, ['remove-elements-runtime.js']);
});

test('starting remove-elements mode reuses an existing receiver without reinjecting the runtime', async () => {
  const sentCommands: string[] = [];

  const result = await startRemoveElementsModeForActiveTab(
    {
      async query() {
        return [
          {
            id: 12,
            url: 'https://example.com/article',
            title: 'Article'
          }
        ];
      },
      async sendMessage(_tabId, message) {
        sentCommands.push(message.command);

        return message.command === 'ping'
          ? {
              ok: true,
              status: 'ready',
              removedCount: 0
            }
          : {
              ok: true,
              status: 'already-active',
              removedCount: 2
            };
      }
    },
    {
      async executeScript() {
        assert.fail('executeScript should not run when the remove-elements receiver is already installed');
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, 'already-active');
  assert.equal(result.removedCount, 2);
  assert.deepEqual(sentCommands, ['ping', 'start']);
});

test('stopping remove-elements mode treats a missing receiver as an inactive page runtime', async () => {
  const result = await stopRemoveElementsModeForActiveTab({
    async query() {
      return [
        {
          id: 12,
          url: 'https://example.com/article',
          title: 'Article'
        }
      ];
    },
    async sendMessage() {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    }
  });

  assert.equal(result, null);
});

test('stopping remove-elements mode sends an explicit stop command to the active tab runtime', async () => {
  const sentCommands: string[] = [];

  const result = await stopRemoveElementsModeForActiveTab({
    async query() {
      return [
        {
          id: 12,
          url: 'https://example.com/article',
          title: 'Article'
        }
      ];
    },
    async sendMessage(_tabId, message) {
      sentCommands.push(message.command);
      return {
        ok: true,
        status: 'stopped',
        removedCount: 0
      };
    }
  });

  assert.equal(result?.ok, true);
  assert.deepEqual(sentCommands, ['stop']);
});

test('starting remove-elements mode rejects malformed runtime responses instead of leaking them into the popup', async () => {
  const failed = await startRemoveElementsModeForActiveTab(
    {
      async query() {
        return [
          {
            id: 12,
            url: 'https://example.com/article',
            title: 'Article'
          }
        ];
      },
      async sendMessage(_tabId, message) {
        return message.command === 'ping'
          ? {
              ok: true,
              status: 'ready',
              removedCount: 0
            }
          : {
              ok: true,
              status: 'started'
            };
      }
    },
    {
      async executeScript() {
        assert.fail('executeScript should not run when the receiver is already installed');
      }
    }
  );

  assert.equal(failed.ok, false);
  assert.equal(failed.code, 'active-page-unavailable');
  assert.match(failed.message, /could not start remove-elements mode/i);
});
