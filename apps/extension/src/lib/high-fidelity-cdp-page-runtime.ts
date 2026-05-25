import {
  executeScriptInTab
} from './extension-script-runtime';
import {
  raceWithHighFidelityTimeout,
  type HighFidelityCdpPageMetrics,
  type HighFidelityScriptingLike
} from './high-fidelity-cdp-support';

interface HighFidelityDynamicContentAction {
  kind: 'stabilize-high-fidelity-dynamic-content';
  maxScrollTargets: number;
  maxScrollContainers: number;
  maxSweepCheckpoints: number;
  maxContainerSweepCheckpoints: number;
  scrollDelayMs: number;
  trailingIdleMs: number;
}

const highFidelityDynamicHydrationMaxScrollTargets = 24;
const highFidelityDynamicHydrationMaxScrollContainers = 6;
const highFidelityDynamicHydrationMaxSweepCheckpoints = 8;
const highFidelityDynamicHydrationMaxContainerSweepCheckpoints = 6;
const highFidelityDynamicHydrationScrollDelayMs = 120;

function readHighFidelityPageMetricsInTab(): HighFidelityCdpPageMetrics {
  const scrollContainerOverflowThresholdPx = 96;
  const excludedMeasurementSelector = [
    'head',
    'title',
    'base',
    'meta',
    'link',
    'script',
    'style',
    'noscript',
    'template',
    'slot',
    'param',
    'source',
    'track',
    'map',
    'area',
    'colgroup',
    'col',
    'iframe'
  ].map((selector) => `:not(${selector})`).join('');
  const getScrollRoot = () => {
    const candidate = document.scrollingElement;
    if (candidate instanceof HTMLElement) {
      return candidate;
    }

    return document.documentElement ?? document.body ?? null;
  };
  const getScopedRoot = () => document.querySelector<HTMLElement>('[data-pagemint-scoped-root="true"]');
  const getViewportWidth = () => (
    globalThis.innerWidth
    || document.documentElement?.clientWidth
    || document.body?.clientWidth
    || 0
  );
  const getViewportHeight = () => (
    globalThis.innerHeight
    || document.documentElement?.clientHeight
    || document.body?.clientHeight
    || 0
  );
  const getWindowScrollX = () => globalThis.scrollX ?? globalThis.pageXOffset ?? 0;
  const getWindowScrollY = () => globalThis.scrollY ?? globalThis.pageYOffset ?? 0;
  const isScrollableOverflowValue = (value: string | null | undefined) => /^(auto|scroll|overlay)$/i.test(value?.trim() ?? '');
  const isRenderableElement = (element: HTMLElement) => {
    const computed = globalThis.getComputedStyle(element);
    if (computed.display === 'none' || computed.visibility === 'hidden') {
      return false;
    }

    if (element.hidden) {
      return false;
    }

    return Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
  };
  const collectScrollableContainers = (root: ParentNode) => {
    const candidates = Array.from(root.querySelectorAll<HTMLElement>('*'))
      .filter((element) => element !== document.body && element !== document.documentElement)
      .filter((element) => isRenderableElement(element))
      .map((element) => {
        const computed = globalThis.getComputedStyle(element);
        const overflowX = computed.overflowX || computed.overflow;
        const overflowY = computed.overflowY || computed.overflow;
        const hasVerticalOverflow = isScrollableOverflowValue(overflowY)
          && element.scrollHeight > element.clientHeight + scrollContainerOverflowThresholdPx;
        const hasHorizontalOverflow = isScrollableOverflowValue(overflowX)
          && element.scrollWidth > element.clientWidth + scrollContainerOverflowThresholdPx;

        if (!hasVerticalOverflow && !hasHorizontalOverflow) {
          return null;
        }

        const rect = element.getBoundingClientRect();
        const visibleArea = Math.max(0, rect.width) * Math.max(0, rect.height);
        const overflowMagnitude = Math.max(
          hasVerticalOverflow ? element.scrollHeight - element.clientHeight : 0,
          hasHorizontalOverflow ? element.scrollWidth - element.clientWidth : 0
        );

        return {
          element,
          score: visibleArea + overflowMagnitude
        };
      })
      .filter((candidate): candidate is {
        element: HTMLElement;
        score: number;
      } => candidate !== null)
      .sort((left, right) => right.score - left.score);

    const selected: HTMLElement[] = [];
    for (const candidate of candidates) {
      if (selected.some((existing) => existing.contains(candidate.element))) {
        continue;
      }

      selected.push(candidate.element);
    }

    return selected;
  };
  const documentElement = document.documentElement;
  const body = document.body;
  const scrollingElement = getScrollRoot();
  const scopedRoot = getScopedRoot();
  let contentWidth = Math.max(
    getViewportWidth(),
    documentElement?.scrollWidth ?? 0,
    documentElement?.offsetWidth ?? 0,
    body?.scrollWidth ?? 0,
    body?.offsetWidth ?? 0,
    scrollingElement?.scrollWidth ?? 0,
    scrollingElement?.clientWidth ?? 0
  );
  let contentHeight = Math.max(
    getViewportHeight(),
    documentElement?.scrollHeight ?? 0,
    documentElement?.offsetHeight ?? 0,
    body?.scrollHeight ?? 0,
    body?.offsetHeight ?? 0,
    scrollingElement?.scrollHeight ?? 0,
    scrollingElement?.clientHeight ?? 0
  );
  const scrollContainerClientHeight = scrollingElement?.clientHeight ?? documentElement?.clientHeight ?? body?.clientHeight ?? 0;
  const scrollableContainers = !scopedRoot && body ? collectScrollableContainers(body) : [];

  for (const container of scrollableContainers) {
    const rect = container.getBoundingClientRect();
    const contentBottom = rect.top + getWindowScrollY() + Math.max(container.scrollHeight, container.clientHeight);
    const contentRight = rect.left + getWindowScrollX() + Math.max(container.scrollWidth, container.clientWidth);
    contentHeight = Math.max(contentHeight, Math.ceil(contentBottom));
    contentWidth = Math.max(contentWidth, Math.ceil(contentRight));
  }

  if (contentHeight <= scrollContainerClientHeight + 1 || scrollableContainers.length > 0) {
    let measuredBottom = contentHeight;
    let measuredRight = contentWidth;

    for (const element of Array.from(document.body?.querySelectorAll<HTMLElement>(`*${excludedMeasurementSelector}`) ?? [])) {
      if (!isRenderableElement(element)) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      const elementBottom = rect.bottom + getWindowScrollY();
      const elementRight = rect.right + getWindowScrollX();
      if (elementBottom > measuredBottom) {
        measuredBottom = elementBottom;
      }
      if (elementRight > measuredRight) {
        measuredRight = elementRight;
      }
    }

    contentHeight = Math.max(contentHeight, Math.ceil(measuredBottom));
    contentWidth = Math.max(contentWidth, Math.ceil(measuredRight));
  }

  return {
    width: getViewportWidth(),
    height: getViewportHeight(),
    contentWidth,
    contentHeight,
    deviceScaleFactor: Math.max(1, globalThis.devicePixelRatio || 1)
  };
}

async function stabilizeHighFidelityDynamicContentInTab(
  action: HighFidelityDynamicContentAction
): Promise<void> {
  if (action.kind !== 'stabilize-high-fidelity-dynamic-content') {
    return;
  }

  const scrollContainerOverflowThresholdPx = 96;
  const root = document.querySelector<HTMLElement>('[data-pagemint-scoped-root="true"]')
    ?? document.body
    ?? document.documentElement;
  const getScrollRoot = () => {
    const candidate = document.scrollingElement;
    if (candidate instanceof HTMLElement) {
      return candidate;
    }

    return document.documentElement ?? document.body ?? null;
  };
  const getScopedRoot = () => document.querySelector<HTMLElement>('[data-pagemint-scoped-root="true"]');
  const getViewportHeight = () => (
    globalThis.innerHeight
    || document.documentElement?.clientHeight
    || document.body?.clientHeight
    || 0
  );
  const getWindowScrollX = () => globalThis.scrollX ?? globalThis.pageXOffset ?? 0;
  const getWindowScrollY = () => globalThis.scrollY ?? globalThis.pageYOffset ?? 0;
  const isScrollableOverflowValue = (value: string | null | undefined) => /^(auto|scroll|overlay)$/i.test(value?.trim() ?? '');
  const isRenderableElement = (element: HTMLElement) => {
    const computed = globalThis.getComputedStyle(element);
    if (computed.display === 'none' || computed.visibility === 'hidden') {
      return false;
    }

    if (element.hidden) {
      return false;
    }

    return Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
  };
  const collectScrollableContainers = (parent: ParentNode) => {
    const candidates = Array.from(parent.querySelectorAll<HTMLElement>('*'))
      .filter((element) => element !== document.body && element !== document.documentElement)
      .filter((element) => isRenderableElement(element))
      .map((element) => {
        const computed = globalThis.getComputedStyle(element);
        const overflowX = computed.overflowX || computed.overflow;
        const overflowY = computed.overflowY || computed.overflow;
        const hasVerticalOverflow = isScrollableOverflowValue(overflowY)
          && element.scrollHeight > element.clientHeight + scrollContainerOverflowThresholdPx;
        const hasHorizontalOverflow = isScrollableOverflowValue(overflowX)
          && element.scrollWidth > element.clientWidth + scrollContainerOverflowThresholdPx;

        if (!hasVerticalOverflow && !hasHorizontalOverflow) {
          return null;
        }

        const rect = element.getBoundingClientRect();
        const visibleArea = Math.max(0, rect.width) * Math.max(0, rect.height);
        const overflowMagnitude = Math.max(
          hasVerticalOverflow ? element.scrollHeight - element.clientHeight : 0,
          hasHorizontalOverflow ? element.scrollWidth - element.clientWidth : 0
        );

        return {
          element,
          score: visibleArea + overflowMagnitude
        };
      })
      .filter((candidate): candidate is {
        element: HTMLElement;
        score: number;
      } => candidate !== null)
      .sort((left, right) => right.score - left.score);

    const selected: HTMLElement[] = [];
    for (const candidate of candidates) {
      if (selected.some((existing) => existing.contains(candidate.element))) {
        continue;
      }

      selected.push(candidate.element);
    }

    return selected;
  };
  const createSweepTargets = (
    maxScrollOffset: number,
    viewportExtent: number,
    maxCheckpoints: number
  ) => {
    if (maxScrollOffset <= 0) {
      return [];
    }

    const checkpointCount = Math.min(
      Math.max(2, Math.round(maxCheckpoints)),
      Math.max(3, Math.ceil(maxScrollOffset / Math.max(1, viewportExtent)) + 1)
    );
    const targets = new Set<number>();

    for (let index = 0; index < checkpointCount; index += 1) {
      const ratio = checkpointCount === 1 ? 1 : index / (checkpointCount - 1);
      targets.add(Math.round(maxScrollOffset * ratio));
    }

    targets.add(0);
    targets.add(maxScrollOffset);
    return Array.from(targets).sort((left, right) => left - right);
  };
  const scopedRoot = getScopedRoot();


  if (!root) {
    return;
  }

  const wait = (delayMs: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, Math.max(0, Math.round(delayMs)));
  });
  const nextFrame = () => new Promise<void>((resolve) => {
    globalThis.requestAnimationFrame(() => resolve());
  });
  const originalScrollX = getWindowScrollX();
  const originalScrollY = getWindowScrollY();
  const scrollRoot = getScrollRoot();
  const scrollableContainers = (!scopedRoot ? collectScrollableContainers(root) : [])
    .filter((container) => container !== scrollRoot)
    .slice(0, Math.max(0, Math.round(action.maxScrollContainers)));
  const originalContainerScrollOffsets = new Map(
    scrollableContainers.map((container) => [container, {
      scrollTop: container.scrollTop,
      scrollLeft: container.scrollLeft
    }])
  );
  const decodeVisibleImages = async (
    visibleRoot: ParentNode,
    maxImages: number
  ) => {
    const visibleImages = Array.from(visibleRoot.querySelectorAll<HTMLImageElement>('img'))
      .filter((image) => {
        const rect = image.getBoundingClientRect();
        return rect.width > 0
          && rect.height > 0
          && rect.bottom >= 0
          && rect.top <= (getViewportHeight() || document.documentElement?.clientHeight || rect.bottom)
          && !image.complete;
      })
      .slice(0, Math.max(0, Math.round(maxImages)));

    await Promise.all(
      visibleImages.map(async (image) => {
        if (typeof image.decode === 'function') {
          await Promise.race([
            image.decode().catch(() => undefined),
            wait(action.scrollDelayMs)
          ]);
          return;
        }

        await wait(action.scrollDelayMs);
      })
    );
  };
  const sweepDocument = async () => {
    const maxDocumentScrollTop = Math.max(
      0,
      (scrollRoot?.scrollHeight ?? document.documentElement?.scrollHeight ?? document.body?.scrollHeight ?? 0)
        - getViewportHeight()
    );
    const targets = createSweepTargets(
      maxDocumentScrollTop,
      Math.max(1, getViewportHeight()),
      action.maxSweepCheckpoints
    );

    for (const target of targets) {
      if (typeof globalThis.scrollTo === 'function') {
        globalThis.scrollTo(originalScrollX, target);
      } else if (scrollRoot) {
        scrollRoot.scrollTop = target;
      }

      await nextFrame();
      await wait(action.scrollDelayMs);
      await decodeVisibleImages(root, 8);
    }
  };
  const sweepScrollContainer = async (container: HTMLElement) => {
    const maxContainerScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const targets = createSweepTargets(
      maxContainerScrollTop,
      Math.max(1, container.clientHeight),
      action.maxContainerSweepCheckpoints
    );

    for (const target of targets) {
      container.scrollTop = target;
      await nextFrame();
      await wait(action.scrollDelayMs);
      await decodeVisibleImages(container, 6);
    }
  };

  await sweepDocument();

  for (const container of scrollableContainers) {
    await sweepScrollContainer(container);
  }

  const seenImageSources = new Set<string>();
  const imageTargets = Array.from(root.querySelectorAll<HTMLImageElement>('img'))
    .map((image, index) => {
      const sourceKey = image.getAttribute('data-src')
        || image.currentSrc
        || image.src
        || image.getAttribute('src')
        || image.getAttribute('srcset')
        || `image-${index}`;
      const hydrationPriority = image.loading === 'lazy' || image.getAttribute('data-src') || !image.complete
        ? 0
        : 1;

      return {
        image,
        sourceKey,
        hydrationPriority,
        index
      };
    })
    .filter(({ sourceKey }) => {
      if (seenImageSources.has(sourceKey)) {
        return false;
      }

      seenImageSources.add(sourceKey);
      return sourceKey.length > 0;
    })
    .filter(({ image }) => image.loading === 'lazy' || image.getAttribute('data-src') || !image.complete)
    .sort((left, right) => left.hydrationPriority - right.hydrationPriority || left.index - right.index)
    .slice(0, Math.max(0, Math.round(action.maxScrollTargets)));

  for (const { image } of imageTargets) {
    image.scrollIntoView({ block: 'end', inline: 'nearest' });

    if (!image.complete && typeof image.decode === 'function') {
      await Promise.race([
        image.decode().catch(() => undefined),
        wait(action.scrollDelayMs)
      ]);
    } else {
      await wait(action.scrollDelayMs);
    }

    await nextFrame();
  }

  for (const [container, scrollOffsets] of originalContainerScrollOffsets) {
    container.scrollTop = scrollOffsets.scrollTop;
    container.scrollLeft = scrollOffsets.scrollLeft;
  }

  if (typeof globalThis.scrollTo === 'function') {
    globalThis.scrollTo(originalScrollX, originalScrollY);
  } else if (scrollRoot) {
    scrollRoot.scrollTop = originalScrollY;
  }

  await nextFrame();
  await wait(action.trailingIdleMs);
}

async function waitForHighFidelityQuiescenceInTab(
  framesToWait: number,
  settleIdleMs: number
): Promise<void> {
  const quietWindowFloorMs = 250;
  const observationTimeoutFloorMs = 1_500;
  const visibleImageDecodeLimit = 24;
  const frameCount = Math.max(1, Math.round(framesToWait));
  const quietWindowMs = Math.max(
    quietWindowFloorMs,
    Math.max(0, Math.round(settleIdleMs))
  );
  const observationTimeoutMs = Math.max(
    observationTimeoutFloorMs,
    quietWindowMs * 4
  );
  const wait = (delayMs: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, Math.max(0, Math.round(delayMs)));
  });

  for (let currentFrame = 0; currentFrame < frameCount; currentFrame += 1) {
    await new Promise<void>((resolve) => globalThis.requestAnimationFrame(() => resolve()));
  }

  const root = document.querySelector<HTMLElement>('[data-pagemint-scoped-root="true"]')
    ?? document.body
    ?? document.documentElement;
  const visibleImages = root
    ? Array.from(root.querySelectorAll<HTMLImageElement>('img'))
      .filter((image) => {
        const rect = image.getBoundingClientRect();
        return rect.width > 0
          && rect.height > 0
          && rect.bottom >= 0
          && rect.top <= (globalThis.innerHeight || document.documentElement?.clientHeight || rect.bottom);
      })
      .slice(0, visibleImageDecodeLimit)
    : [];

  await Promise.all(
    visibleImages.map(async (image) => {
      if (image.complete) {
        return;
      }

      if (typeof image.decode === 'function') {
        await Promise.race([
          image.decode().catch(() => undefined),
          wait(quietWindowMs)
        ]);
        return;
      }

      await new Promise<void>((resolve) => {
        let resolved = false;
        const finish = () => {
          if (resolved) {
            return;
          }

          resolved = true;
          clearTimeout(timeoutId);
          image.removeEventListener('load', finish);
          image.removeEventListener('error', finish);
          resolve();
        };
        const timeoutId = setTimeout(finish, quietWindowMs);

        image.addEventListener('load', finish, { once: true });
        image.addEventListener('error', finish, { once: true });
      });
    })
  );

  await new Promise<void>((resolve) => {
    let resolved = false;
    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    let observationTimer: ReturnType<typeof setTimeout> | undefined;
    let mutationObserver: MutationObserver | undefined;
    let resizeObserver: ResizeObserver | undefined;
    const cleanupCallbacks: Array<() => void> = [];
    const finish = () => {
      if (resolved) {
        return;
      }

      resolved = true;
      if (quietTimer) {
        clearTimeout(quietTimer);
      }
      if (observationTimer) {
        clearTimeout(observationTimer);
      }
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      for (const cleanup of cleanupCallbacks) {
        cleanup();
      }
      resolve();
    };
    const scheduleQuietWindow = () => {
      if (resolved) {
        return;
      }

      if (quietTimer) {
        clearTimeout(quietTimer);
      }

      quietTimer = setTimeout(finish, quietWindowMs);
    };

    if (typeof MutationObserver === 'function' && root) {
      mutationObserver = new MutationObserver(() => {
        scheduleQuietWindow();
      });
      mutationObserver.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true
      });
    }

    if (typeof ResizeObserver === 'function' && root) {
      resizeObserver = new ResizeObserver(() => {
        scheduleQuietWindow();
      });
      resizeObserver.observe(root);
    }

    const onLoad = () => {
      scheduleQuietWindow();
    };

    globalThis.addEventListener('load', onLoad, true);
    cleanupCallbacks.push(() => {
      globalThis.removeEventListener('load', onLoad, true);
    });

    observationTimer = setTimeout(finish, observationTimeoutMs);
    scheduleQuietWindow();
  });
}

async function triggerHighFidelityPdfDownloadInTab(
  base64Data: string,
  suggestedFileName: string
): Promise<void> {
  const objectUrlRevokeDelayMs = 5_000;
  const binary = globalThis.atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const blob = new Blob([bytes], { type: 'application/pdf' });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const downloadLink = document.createElement('a');
    downloadLink.href = objectUrl;
    downloadLink.download = suggestedFileName;
    downloadLink.rel = 'noopener';
    downloadLink.style.display = 'none';
    document.body.append(downloadLink);
    downloadLink.click();
    downloadLink.remove();
  } finally {
    // Chrome resolves blob-backed downloads asynchronously after the click.
    setTimeout(() => URL.revokeObjectURL(objectUrl), objectUrlRevokeDelayMs);
  }
}

export async function readHighFidelityPageMetrics(
  tabId: number,
  scripting: HighFidelityScriptingLike,
  timeoutMs: number
): Promise<HighFidelityCdpPageMetrics> {
  return raceWithHighFidelityTimeout(
    executeScriptInTab(scripting, tabId, readHighFidelityPageMetricsInTab, []),
    timeoutMs
  );
}

export async function stabilizeHighFidelityDynamicContent(
  tabId: number,
  scripting: HighFidelityScriptingLike,
  trailingIdleMs: number,
  timeoutMs: number
): Promise<void> {
  await raceWithHighFidelityTimeout(
    executeScriptInTab(
      scripting,
      tabId,
      stabilizeHighFidelityDynamicContentInTab,
      [{
        kind: 'stabilize-high-fidelity-dynamic-content',
        maxScrollTargets: highFidelityDynamicHydrationMaxScrollTargets,
        maxScrollContainers: highFidelityDynamicHydrationMaxScrollContainers,
        maxSweepCheckpoints: highFidelityDynamicHydrationMaxSweepCheckpoints,
        maxContainerSweepCheckpoints: highFidelityDynamicHydrationMaxContainerSweepCheckpoints,
        scrollDelayMs: highFidelityDynamicHydrationScrollDelayMs,
        trailingIdleMs
      }],
      {
        allowUndefinedResult: true
      }
    ),
    timeoutMs
  );
}

export async function waitForHighFidelityQuiescence(
  tabId: number,
  scripting: HighFidelityScriptingLike,
  animationFrames: number,
  idleMs: number,
  timeoutMs: number
): Promise<void> {
  await raceWithHighFidelityTimeout(
    executeScriptInTab(
      scripting,
      tabId,
      waitForHighFidelityQuiescenceInTab,
      [animationFrames, idleMs],
      {
        allowUndefinedResult: true
      }
    ),
    timeoutMs
  );
}

export async function triggerHighFidelityPdfDownload(
  tabId: number,
  scripting: HighFidelityScriptingLike,
  pdfData: string,
  fileName: string,
  timeoutMs: number
): Promise<void> {
  await raceWithHighFidelityTimeout(
    executeScriptInTab(
      scripting,
      tabId,
      triggerHighFidelityPdfDownloadInTab,
      [pdfData, fileName],
      {
        allowUndefinedResult: true
      }
    ),
    timeoutMs
  );
}
