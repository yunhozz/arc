import {getPlatform} from '../runtime/platform-registry.mjs';
import * as format from './formats/markdown.mjs';
import {discoverAnthropicCatalog} from '../models/catalog-anthropic.mjs';

export const CLAUDE_INSTALLER = Object.freeze({
  runtime: getPlatform('claude'),
  defaultComposite: true,
  payloadPrefix: 'claude', instructionFile: 'CLAUDE.md', runtimeConfigFile: 'settings.json',
  globalPaths: Object.freeze(['CLAUDE.md', 'settings.json']),
  models: Object.freeze({staticCatalog: new URL('../models/claude-models.json', import.meta.url), effortField: getPlatform('claude').models.effortField, discover: discoverAnthropicCatalog}),
  profiles: Object.freeze({render: format.render, isOwnedStandalone: format.isOwnedStandalone, renameForRouting: format.renameForRouting}),
  runtimeConfig: Object.freeze({readConcurrency: format.readConcurrency, renderConcurrency: format.renderConcurrency, extraRender: null}),
  uninstallSummary: 'Claude settings.json native concurrency key is preserved.',
  isolationEnv: () => ({}),
});
