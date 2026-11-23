import {parseToml} from '../models/config.mjs';
const MARKER='{{ARC_OUTPUT_LANGUAGE_POLICY}}';
const RUN_MODE_MARKER = '{{ARC_RUN_MODE_POLICY}}';
export const RUN_MODES = Object.freeze(['supervised', 'full-auto']);

export function validateLanguage(language){if(!['en','ko'].includes(language))throw new Error(`Invalid language: ${language}`);return language;}

export function validateRunMode(value) {
  if (!RUN_MODES.includes(value)) throw new Error(`Invalid run mode: ${String(value)}`);
  return value;
}

export function parseSettings(bytes) {
  if (!Buffer.isBuffer(bytes)) throw new Error('Language settings must be bytes');
  const data = parseToml(new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes));
  const keyCount = Object.keys(data).length;
  const isV1 = (data.version === 1 || data.version === 1n) && keyCount === 2;
  const isV2 = (data.version === 2 || data.version === 2n) && keyCount === 3 && Object.hasOwn(data, 'run_mode');
  if (!Object.hasOwn(data, 'version') || !Object.hasOwn(data, 'language') || (!isV1 && !isV2)) {
    throw new Error('Invalid ARC settings schema or version');
  }
  return {
    version: isV1 ? 1 : 2,
    language: validateLanguage(data.language),
    runMode: isV1 ? 'supervised' : validateRunMode(data.run_mode),
  };
}

export function serializeSettings({language, runMode = 'supervised'}) {
  const validatedLanguage = validateLanguage(language);
  if (validateRunMode(runMode) === 'supervised') {
    return Buffer.from(`version = 1\nlanguage = "${validatedLanguage}"\n`);
  }
  return Buffer.from(`version = 2\nlanguage = "${validatedLanguage}"\nrun_mode = "full-auto"\n`);
}

export function parseLanguage(bytes) {
  const {version, language} = parseSettings(bytes);
  return {version, language};
}

export function serializeLanguage(language) {
  return serializeSettings({language});
}

export function defaultLanguage(existing){return existing.length&&existing.every(value=>value===existing[0])&&existing[0]?validateLanguage(existing[0]):'en';}
export function languagePolicy(language){return `Use ${validateLanguage(language)==='ko'?'Korean':'English'} by default for user-facing responses, progress updates, reports, and document titles and prose, including designs, specs, and plans. An explicit user language request overrides this installed default. Preserve identifiers, skill/API names, code, paths, commands, and literal values exactly.`;}
export function renderLanguagePolicy(bytes,language){const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(text.split(MARKER).length!==2)throw new Error('Expected exactly one ARC output language policy marker');return Buffer.from(text.replace(MARKER,languagePolicy(language)));}

export function runModePolicy(runMode) {
  if (validateRunMode(runMode) === 'supervised') {
    return "**Run mode:** Supervised. Every approval and choice gate in this skill and its references requires the user's explicit answer; Orchestrator does not auto-decide gates.";
  }
  return "**Run mode:** Full Auto. Orchestrator decides the gates listed in [planning](references/planning.md#full-auto-run-mode) itself: it completes that gate's required checks first, then chooses the recommended option; without a recommendation and supporting evidence, it asks the user. New product decisions outside the original request, external actions, failures, partial completion, holds, unknown state, ownership conflicts, preservation-rule Git actions, permission or sandbox approvals, and unknown slots or exhausted capacity still go to the user. Plan depth, local commit rules, Tester, Reviewer and acceptance are unchanged. Record each decision as `auto-decided (Full Auto): <gate> → <choice>; reason; alternatives; evidence` in a user-visible progress message and in the canonical handoff record. If the user asks in this chat to stop auto-deciding or to use Supervised, apply Supervised from the next gate; this overrides the installed default, and earlier auto-decisions stay recorded.";
}

export function renderRunModePolicy(bytes, runMode) {
  const text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  if (text.split(RUN_MODE_MARKER).length !== 2) throw new Error('Expected exactly one ARC run mode policy marker');
  return Buffer.from(text.replace(RUN_MODE_MARKER, runModePolicy(runMode)));
}
