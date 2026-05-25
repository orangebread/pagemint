import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';

import { registerSelectionModeTabMessageHandler } from '../lib/selection-mode';

export default defineUnlistedScript(() => {
  registerSelectionModeTabMessageHandler();
});
