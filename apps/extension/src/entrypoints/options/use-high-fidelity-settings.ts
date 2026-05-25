import { useCallback, useState, type ChangeEvent, type MutableRefObject } from 'react';

import {
  applyExactExportPopupSettingsChange,
  persistExactExportPopupSettingsChange,
  saveExactExportPopupSettings,
  type ExactExportPopupSettingsState,
  type ExactExportPopupStoredValue
} from '../../lib/exact-export-popup';
import {
  chooseHighFidelityOutputFolder,
  clearHighFidelityOutputFolder,
  isHighFidelityOutputFolderPickerAvailable
} from '../../lib/high-fidelity-managed-pdf';

export interface UseHighFidelitySettingsOptions {
  latestSettingsStateRef: MutableRefObject<ExactExportPopupSettingsState>;
  syncSettingsState: (nextSettingsState: ExactExportPopupSettingsState) => void;
  flashSavedToast: () => void;
}

export function useHighFidelitySettings({
  latestSettingsStateRef,
  syncSettingsState,
  flashSavedToast
}: UseHighFidelitySettingsOptions) {
  const [highFidelityBusy, setHighFidelityBusy] = useState(false);
  const [highFidelityError, setHighFidelityError] = useState<string | null>(null);
  const [outputFolderBusy, setOutputFolderBusy] = useState(false);
  const [outputFolderError, setOutputFolderError] = useState<string | null>(null);

  const persistStoredValueAndPingToast = useCallback((
    nextCandidate: ExactExportPopupStoredValue,
    onError?: () => void
  ) => {
    const currentState = latestSettingsStateRef.current;
    const nextState = applyExactExportPopupSettingsChange(nextCandidate, {
      currentState
    });
    syncSettingsState(nextState);
    void persistExactExportPopupSettingsChange(nextCandidate, {
      currentState
    }).then(
      () => {
        flashSavedToast();
      },
      () => {
        onError?.();
      }
    );
  }, [flashSavedToast, latestSettingsStateRef, syncSettingsState]);

  const saveHighFidelityPreference = useCallback((enabled: boolean) => {
    const currentState = latestSettingsStateRef.current;
    setHighFidelityBusy(true);
    setHighFidelityError(null);
    setOutputFolderError(null);

    void saveExactExportPopupSettings(
      {
        config: currentState.config,
        highFidelityMode: enabled
      },
      undefined,
      {
        currentState,
        highFidelityPermissionGranted: currentState.highFidelityPermissionGranted
      }
    )
      .then((nextSettingsState) => {
        syncSettingsState(nextSettingsState);
        flashSavedToast();
      })
      .catch(() => {
        setHighFidelityError(
          enabled
            ? 'Couldn’t turn on high-fidelity rendering. Try again.'
            : 'Couldn’t turn off high-fidelity rendering. Try again.'
        );
      })
      .finally(() => {
        setHighFidelityBusy(false);
      });
  }, [flashSavedToast, latestSettingsStateRef, syncSettingsState]);

  const handleHighFidelityToggle = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    saveHighFidelityPreference(event.currentTarget.checked);
  }, [saveHighFidelityPreference]);

  const saveAutosavePreference = useCallback((nextAutosaveEnabled: boolean) => {
    const currentState = latestSettingsStateRef.current;

    if (nextAutosaveEnabled && !isHighFidelityOutputFolderPickerAvailable()) {
      setOutputFolderError('This browser blocks output-folder access by default, so autosave can’t be turned on here.');
      return;
    }

    setOutputFolderError(null);
    persistStoredValueAndPingToast(
      {
        config: currentState.config,
        highFidelityMode: currentState.highFidelityModePreferenceEnabled,
        highFidelityAutosaveEnabled: nextAutosaveEnabled,
        highFidelityOutputFolder: {
          configured: currentState.highFidelityOutputFolder.configured,
          name: currentState.highFidelityOutputFolder.name
        }
      },
      () => {
        setOutputFolderError('Couldn’t update autosave. Try again.');
      }
    );
  }, [latestSettingsStateRef, persistStoredValueAndPingToast]);

  const handleAutosaveToggle = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    saveAutosavePreference(event.currentTarget.checked);
  }, [saveAutosavePreference]);

  const handleChooseOutputFolder = useCallback(() => {
    if (!isHighFidelityOutputFolderPickerAvailable()) {
      setOutputFolderError('This browser blocks output-folder access by default.');
      return;
    }

    setOutputFolderBusy(true);
    setOutputFolderError(null);

    void chooseHighFidelityOutputFolder()
      .then((folderSummary) => {
        const currentState = latestSettingsStateRef.current;
        persistStoredValueAndPingToast(
          {
            config: currentState.config,
            highFidelityMode: currentState.highFidelityModePreferenceEnabled,
            highFidelityAutosaveEnabled: currentState.highFidelityAutosaveEnabled,
            highFidelityOutputFolder: {
              configured: folderSummary.configured,
              name: folderSummary.name
            }
          },
          () => {
            setOutputFolderError('The folder was chosen, but PageMint couldn’t save that setting.');
          }
        );
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : '';
        if (!/abort/i.test(message)) {
          setOutputFolderError('Couldn’t choose an output folder. Try again.');
        }
      })
      .finally(() => {
        setOutputFolderBusy(false);
      });
  }, [latestSettingsStateRef, persistStoredValueAndPingToast]);

  const handleClearOutputFolder = useCallback(() => {
    setOutputFolderBusy(true);
    setOutputFolderError(null);

    void clearHighFidelityOutputFolder()
      .then(() => {
        const currentState = latestSettingsStateRef.current;
        persistStoredValueAndPingToast(
          {
            config: currentState.config,
            highFidelityMode: currentState.highFidelityModePreferenceEnabled,
            highFidelityAutosaveEnabled: currentState.highFidelityAutosaveEnabled,
            highFidelityOutputFolder: {
              configured: false
            }
          },
          () => {
            setOutputFolderError('The folder was cleared locally, but PageMint couldn’t save that setting.');
          }
        );
      })
      .catch(() => {
        setOutputFolderError('Couldn’t clear the saved output folder. Try again.');
      })
      .finally(() => {
        setOutputFolderBusy(false);
      });
  }, [latestSettingsStateRef, persistStoredValueAndPingToast]);

  return {
    highFidelityBusy,
    highFidelityError,
    outputFolderBusy,
    outputFolderError,
    outputFolderPickerAvailable: isHighFidelityOutputFolderPickerAvailable(),
    saveHighFidelityPreference,
    saveAutosavePreference,
    handleHighFidelityToggle,
    handleAutosaveToggle,
    handleChooseOutputFolder,
    handleClearOutputFolder
  };
}
