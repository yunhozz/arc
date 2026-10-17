import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {runNpmCompletionPostinstall} from '../lib/installer/npm-completion.mjs';

import {refreshPackageReferences} from '../lib/installer/package-references.mjs';

// Reference refresh is required; completion remains best-effort.
await refreshPackageReferences({packageRoot:fileURLToPath(new URL('../',import.meta.url))});
try{
 const user=os.userInfo();
 await runNpmCompletionPostinstall({env:process.env,platform:process.platform,packageRoot:fileURLToPath(new URL('../',import.meta.url)),uid:user.uid,home:user.homedir});
}catch(error){
 process.stderr.write(`ARC completion: skipped (${error.message}). For this zsh session: eval "$(arc completion zsh)"\n`);
}
