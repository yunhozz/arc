import {parseToml} from '../models/config.mjs';
const MARKER='{{ARC_OUTPUT_LANGUAGE_POLICY}}';
export function validateLanguage(language){if(!['en','ko'].includes(language))throw new Error(`Invalid language: ${language}`);return language;}
export function parseLanguage(bytes){
 if(!Buffer.isBuffer(bytes))throw new Error('Language settings must be bytes');
 const data=parseToml(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));
 if(Object.keys(data).length!==2||!Object.hasOwn(data,'version')||!Object.hasOwn(data,'language')||data.version!==1n&&data.version!==1)throw new Error('Invalid language settings schema or version');
 return{version:1,language:validateLanguage(data.language)};
}
export function serializeLanguage(language){return Buffer.from(`version = 1\nlanguage = "${validateLanguage(language)}"\n`);}
export function defaultLanguage(existing){return existing.length&&existing.every(value=>value===existing[0])&&existing[0]?validateLanguage(existing[0]):'en';}
export function languagePolicy(language){return `Use ${validateLanguage(language)==='ko'?'Korean':'English'} by default for user-facing responses, progress updates, reports, and document titles and prose, including designs, specs, and plans. An explicit user language request overrides this installed default. Preserve identifiers, skill/API names, code, paths, commands, and literal values exactly.`;}
export function renderLanguagePolicy(bytes,language){const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(text.split(MARKER).length!==2)throw new Error('Expected exactly one ARC output language policy marker');return Buffer.from(text.replace(MARKER,languagePolicy(language)));}
