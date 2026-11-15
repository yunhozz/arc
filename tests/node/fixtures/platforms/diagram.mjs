import {createInstallerRegistry} from '../../../../lib/platforms/index.mjs';
import {createPlatformRegistry} from '../../../../lib/runtime/platform-registry.mjs';
import {ZETA_RUNTIME,ZETA_INSTALLER} from './zeta.mjs';

export function diagramRegistry(label){
 const runtime=createPlatformRegistry([{...ZETA_RUNTIME,label}]);
 return createInstallerRegistry({runtime,descriptors:[{...ZETA_INSTALLER,runtime:runtime.getPlatform('zeta')}]});
}
