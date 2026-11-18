import {getPlatform} from '../runtime/platform-registry.mjs';
import * as format from './formats/grok-markdown.mjs';

export const GROK_INSTALLER = Object.freeze({
  runtime: getPlatform('grok'),
  payloadPrefix: 'grok', instructionTemplates: Object.freeze(['AGENTS.md', 'instructions.md']), instructionFile: 'AGENTS.md', runtimeConfigFile: 'config.toml',
  globalPaths: Object.freeze(['AGENTS.md', 'config.toml']),
  models: Object.freeze({staticCatalog: new URL('../models/grok-models.json', import.meta.url), effortField: getPlatform('grok').models.effortField}),
  profiles: Object.freeze({render: format.render, isOwnedStandalone: format.isOwnedStandalone, renameForRouting: format.renameForRouting}),
  runtimeConfig: Object.freeze({}),
  uninstallSummary: 'Grok config.toml is preserved.',
  isolationEnv: () => ({}),
});
