import { createHighFidelityAccessResult } from '@pagemint/render-core';
import type { HighFidelityAccessResult } from '@pagemint/shared-types';

export async function resolveHighFidelityAccess(): Promise<HighFidelityAccessResult> {
  return createHighFidelityAccessResult('local-free');
}
