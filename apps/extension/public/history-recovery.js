(() => {
  const stateKey = 'pagemint.historyRecovery.state';
  const reloadingHash = '#pagemint-history-reloading';
  const status = document.getElementById('status');
  const retry = document.getElementById('retry');

  const setStatus = (message) => {
    if (status) {
      status.textContent = message;
    }
  };

  const readState = () => {
    try {
      return sessionStorage.getItem(stateKey);
    } catch {
      return null;
    }
  };

  const writeState = (value) => {
    try {
      sessionStorage.setItem(stateKey, value);
    } catch {
      // Session storage can be unavailable in unusual extension contexts.
    }
  };

  const clearState = () => {
    try {
      sessionStorage.removeItem(stateKey);
    } catch {
      // Session storage can be unavailable in unusual extension contexts.
    }
  };

  const openNativeHistory = () => {
    window.location.replace('chrome://history/');
  };

  const reloadExtension = () => {
    const runtime = globalThis.chrome?.runtime;
    if (runtime && typeof runtime.reload === 'function') {
      runtime.reload();
      return true;
    }
    return false;
  };

  const startRepair = () => {
    writeState('reloading');
    if (window.location.hash !== reloadingHash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${reloadingHash}`);
    }
    setStatus('Reloading PageMint, then reopening Chrome history...');
    setTimeout(() => {
      if (!reloadExtension()) {
        writeState('done');
        openNativeHistory();
      }
    }, 100);
    setTimeout(() => {
      writeState('done');
      openNativeHistory();
    }, 1500);
  };

  retry?.addEventListener('click', () => {
    clearState();
    startRepair();
  });

  const state = readState();
  if (state === 'reloading' || window.location.hash === reloadingHash) {
    writeState('done');
    setStatus('PageMint reloaded. Opening Chrome history...');
    setTimeout(openNativeHistory, 250);
    return;
  }

  if (state === 'done') {
    setStatus('Chrome is still routing History to PageMint. Reload PageMint from chrome://extensions, then open History again.');
    return;
  }

  startRepair();
})();
