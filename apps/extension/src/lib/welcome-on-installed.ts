export type ChromeOnInstalledDetails = {
  reason: 'install' | 'update' | 'chrome_update' | 'shared_module_update';
  previousVersion?: string;
  id?: string;
};

export type WelcomeOnInstalledRuntimeLike = {
  getURL(path: string): string;
  onInstalled: {
    addListener(callback: (details: ChromeOnInstalledDetails) => void): void;
  };
};

export type WelcomeOnInstalledTabsLike = {
  create(options: { url: string; active: boolean }): Promise<{ id?: number }>;
};

export function registerWelcomeOnInstalledHandler(
  runtime: WelcomeOnInstalledRuntimeLike,
  tabs: WelcomeOnInstalledTabsLike
): void {
  runtime.onInstalled.addListener((details) => {
    if (details.reason !== 'install') return;
    const url = runtime.getURL('welcome.html');
    void tabs.create({ url, active: true }).catch(() => {
      // Tab creation can be blocked by enterprise policy in rare edge cases.
      // Swallow — surfacing a notification would be a telemetry-adjacent surface
      // and the user can still find the extension via the puzzle icon.
    });
  });
}
