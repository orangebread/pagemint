import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { registerRemoveElementsModeTabMessageHandler } from '../lib/remove-elements-mode';

export default defineUnlistedScript(() => {
  registerRemoveElementsModeTabMessageHandler();
});
