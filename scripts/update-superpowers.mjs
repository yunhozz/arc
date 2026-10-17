import {fileURLToPath} from 'node:url';
import {refreshPackageReferences} from '../lib/installer/package-references.mjs';
const result=await refreshPackageReferences({packageRoot:fileURLToPath(new URL('../',import.meta.url))});
console.log(`Updated superpowers references (${result.provenance.revision})`);
