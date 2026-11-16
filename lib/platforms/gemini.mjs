import {getPlatform} from '../runtime/platform-registry.mjs';
import * as format from './formats/gemini-markdown.mjs';
import {discoverGeminiCatalog} from '../models/catalog-gemini.mjs';

export const GEMINI_INSTALLER = Object.freeze({
  runtime: getPlatform('gemini'),
  payloadPrefix: 'gemini', instructionTemplates: Object.freeze(['GEMINI.md', 'instructions.md']), instructionFile: 'GEMINI.md', runtimeConfigFile: 'settings.json',
  globalPaths: Object.freeze(['GEMINI.md', 'settings.json']),
  models: Object.freeze({staticCatalog: new URL('../models/gemini-models.json', import.meta.url), effortField: getPlatform('gemini').models.effortField, discover: discoverGeminiCatalog}),
  profiles: Object.freeze({render: format.render, isOwnedStandalone: format.isOwnedStandalone, renameForRouting: format.renameForRouting}),
  runtimeConfig: Object.freeze({}),
  uninstallSummary: 'Gemini settings.json is preserved.',
  isolationEnv: () => ({}),
});
