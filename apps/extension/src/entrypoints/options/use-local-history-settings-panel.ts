import { useCallback, useState } from 'react';

import type { LocalHistoryCapabilityMetadata } from '@pagemint/shared-types';

import type { LocalHistoryListLoadedState } from '../../components/local-history-list';
import {
  localHistoryStoragePolicy,
  type LocalHistoryStorageSummary
} from '../../lib/local-history-store';

const emptyLocalHistoryStorageSummary: LocalHistoryStorageSummary = {
  entryCount: 0,
  totalBytes: 0,
  maxTotalBytes: localHistoryStoragePolicy.maxTotalBytes,
  maxEntryBytes: localHistoryStoragePolicy.maxEntryBytes,
  remainingBytes: localHistoryStoragePolicy.maxTotalBytes
};

export function useLocalHistorySettingsPanel() {
  const [localHistoryError, setLocalHistoryError] = useState<string | null>(null);
  const [localHistoryStorageSummary, setLocalHistoryStorageSummary] = useState<LocalHistoryStorageSummary>(
    emptyLocalHistoryStorageSummary
  );
  const [localHistoryQuarantinedCount, setLocalHistoryQuarantinedCount] = useState(0);
  const [localHistoryCapability, setLocalHistoryCapability] = useState<LocalHistoryCapabilityMetadata | null>(null);

  const handleLocalHistoryScanComplete = useCallback(
    (state: LocalHistoryListLoadedState | null) => {
      if (state) {
        setLocalHistoryStorageSummary(state.storage);
        setLocalHistoryQuarantinedCount(state.quarantinedCount);
        setLocalHistoryCapability(state.capability);
        setLocalHistoryError(null);
      } else {
        setLocalHistoryCapability(null);
        setLocalHistoryError('PageMint could not read local history from this browser profile.');
      }
    },
    []
  );

  return {
    localHistoryError,
    localHistoryStorageSummary,
    localHistoryQuarantinedCount,
    localHistoryCapability,
    localHistoryDisabled: localHistoryCapability?.status === 'unavailable'
      && localHistoryCapability.reason === 'history-disabled',
    handleLocalHistoryScanComplete
  };
}
