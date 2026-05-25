import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';

import {
  containsHighFidelityPermission,
  observeHighFidelityPermissionState
} from './high-fidelity-permissions';
import {
  createExactExportPopupSettingsState,
  exactExportPopupSettingsStorageKey,
  loadExactExportPopupSettings,
  syncExactExportPopupSettingsStateFromStorage,
  syncExactExportPopupSettingsStateWithPermission,
  type ExactExportPopupSettingsState
} from './exact-export-popup-settings';

interface UseExactExportSettingsStateOptions {
  onSettingsUpdated?: (settingsState: ExactExportPopupSettingsState) => void;
}

export interface ExactExportSettingsStateController {
  settingsState: ExactExportPopupSettingsState;
  settingsLoaded: boolean;
  latestSettingsStateRef: MutableRefObject<ExactExportPopupSettingsState>;
  settingsHydrationRef: MutableRefObject<Promise<ExactExportPopupSettingsState> | null>;
  syncSettingsState: (nextSettingsState: ExactExportPopupSettingsState) => void;
}

async function hydrateExactExportSettingsState(): Promise<ExactExportPopupSettingsState> {
  const permissionGranted = await containsHighFidelityPermission().catch(() => false);
  return loadExactExportPopupSettings(undefined, {
    highFidelityPermissionGranted: permissionGranted
  });
}

export function useExactExportSettingsState(
  options: UseExactExportSettingsStateOptions = {}
): ExactExportSettingsStateController {
  const initialSettingsState = createExactExportPopupSettingsState();
  const [settingsState, setSettingsState] = useState<ExactExportPopupSettingsState>(() => initialSettingsState);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const latestSettingsStateRef = useRef(initialSettingsState);
  const settingsHydrationRef = useRef<Promise<ExactExportPopupSettingsState> | null>(null);

  const syncSettingsState = useCallback((nextSettingsState: ExactExportPopupSettingsState) => {
    latestSettingsStateRef.current = nextSettingsState;
    setSettingsState(nextSettingsState);
    options.onSettingsUpdated?.(nextSettingsState);
  }, [options.onSettingsUpdated]);

  useEffect(() => {
    let isMounted = true;
    const settingsHydration = hydrateExactExportSettingsState();
    settingsHydrationRef.current = settingsHydration;

    void settingsHydration
      .then((nextSettingsState) => {
        if (!isMounted) {
          return;
        }

        syncSettingsState(nextSettingsState);
        setSettingsLoaded(true);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        syncSettingsState(createExactExportPopupSettingsState());
        setSettingsLoaded(true);
      });

    return () => {
      isMounted = false;
      settingsHydrationRef.current = null;
    };
  }, [syncSettingsState]);

  useEffect(() => {
    const unsubscribe = observeHighFidelityPermissionState((permissionGranted) => {
      syncSettingsState(
        syncExactExportPopupSettingsStateWithPermission(
          latestSettingsStateRef.current,
          permissionGranted
        )
      );
    });

    return unsubscribe;
  }, [syncSettingsState]);

  useEffect(() => {
    const storageApi = (globalThis as typeof globalThis & {
      chrome?: {
        storage?: {
          onChanged?: {
            addListener?: (
              listener: (
                changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
                areaName: string
              ) => void
            ) => void;
            removeListener?: (
              listener: (
                changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
                areaName: string
              ) => void
            ) => void;
          };
        };
      };
    }).chrome?.storage?.onChanged;

    const handleStorageChanged = (
      changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
      areaName: string
    ) => {
      if (areaName !== 'local') {
        return;
      }

      const nextStoredSettings = changes[exactExportPopupSettingsStorageKey]?.newValue;

      if (typeof nextStoredSettings === 'undefined') {
        return;
      }

      syncSettingsState(
        syncExactExportPopupSettingsStateFromStorage(
          nextStoredSettings,
          latestSettingsStateRef.current
        )
      );
    };

    storageApi?.addListener?.(handleStorageChanged);

    return () => {
      storageApi?.removeListener?.(handleStorageChanged);
    };
  }, [syncSettingsState]);

  return {
    settingsState,
    settingsLoaded,
    latestSettingsStateRef,
    settingsHydrationRef,
    syncSettingsState
  };
}
