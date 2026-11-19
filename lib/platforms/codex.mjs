import path from 'node:path';
import {getPlatform} from '../runtime/platform-registry.mjs';
import * as format from './formats/toml.mjs';
import {renderWaitSettings} from '../installer/global-config.mjs';
import {listCodexModelCapabilities} from '../models/codex-catalog.mjs';

export const CODEX_INSTALLER = Object.freeze({
  runtime: getPlatform('codex'),
  defaultComposite: true,
  payloadPrefix: 'codex', instructionFile: 'AGENTS.md', runtimeConfigFile: 'config.toml',
  globalPaths: Object.freeze(['AGENTS.md', 'config.toml']),
  models: Object.freeze({staticCatalog: new URL('../models/codex-models.json', import.meta.url), effortField: getPlatform('codex').models.effortField, discover: listCodexModelCapabilities}),
  profiles: Object.freeze({render: format.render, isOwnedStandalone: format.isOwnedStandalone, renameForRouting: format.renameForRouting}),
  runtimeConfig: Object.freeze({readConcurrency: format.readConcurrency, renderConcurrency: format.renderConcurrency, extraRender: renderWaitSettings}),
  uninstallSummary: 'Codex config.toml wait settings and native concurrency key are preserved.',
  isolationEnv: work => ({CODEX_HOME: path.join(work, 'codex-runtime')}),
});
