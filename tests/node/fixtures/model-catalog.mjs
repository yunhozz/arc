import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';

// Claude Models API: https://platform.claude.com/docs/en/api/models/list
const claudeModel = (id, effort) => ({
  id, type: 'model', display_name: id, created_at: '2026-01-01T00:00:00Z',
  deprecated_at: null, retires_at: null, lifecycle: 'active', line: 'sonnet', max_input_tokens: 200000, max_tokens: 32000,
  capabilities: {
    batch: { supported: true }, citations: { supported: true }, code_execution: { supported: true },
    context_management: { supported: true, clear_thinking_20251015: { supported: true }, clear_tool_uses_20250919: { supported: true }, compact_20260112: { supported: true } },
    effort, image_input: { supported: true }, pdf_input: { supported: true },
    server_tools: { supported: true, code_execution: { supported: true }, web_search: { supported: true } },
    structured_outputs: { supported: true }, thinking: { supported: true, types: { adaptive: { supported: true }, between_tools: { supported: true }, disabled: { supported: true }, enabled: { supported: true } } },
  },
});
export const claudePages = [
  {
    data: [claudeModel('claude-a', { supported: true, low: { supported: true }, medium: { supported: false }, high: { supported: true }, xhigh: { supported: false }, max: { supported: false } })],
    first_id: 'claude-a', last_id: 'claude-a', has_more: true,
  },
  {
    data: [claudeModel('claude-b', { supported: true, low: { supported: false }, medium: { supported: true }, high: { supported: false }, xhigh: { supported: true }, max: { supported: true } })],
    first_id: 'claude-b', last_id: 'claude-b', has_more: false,
  },
];

// Codex 0.163.0 protocol: https://github.com/openai/codex/blob/rust-v0.163.0/codex-rs/app-server-protocol/src/protocol/v2/model.rs
const codexModel = (id, model, efforts) => ({
  id, model, displayName: id, description: 'Fixture', hidden: false,
  upgrade: null, upgradeInfo: null, availabilityNux: null, modelSpecialty: null,
  defaultReasoningEffort: efforts[0], supportedReasoningEfforts: efforts.map(reasoningEffort => ({ reasoningEffort, description: 'Fixture' })),
  inputModalities: ['text'], supportsPersonality: false, multiAgentVersion: null,
  additionalSpeedTiers: [], serviceTiers: [], defaultServiceTier: null, availableAccessPrograms: null, isDefault: false,
});
export const codexPages = [
  { data: [codexModel('display-a', 'exec-a', ['low', 'high'])], nextCursor: 'page-2' },
  { data: [codexModel('display-b', 'exec-b', ['medium'])], nextCursor: null },
];

export function fakeCodex({ pages = codexPages, closeOnEnd = true, closeOnKill = true, hang = false, initializeResult = { userAgent: 'fixture', platformFamily: 'unix', platformOs: 'macos' }, afterModelReply = () => {}, responseIdOffset = 0 } = {}) {
  const child = new EventEmitter(), messages = [], signals = [];
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.stdin = new Writable({
    write(chunk, _encoding, callback) {
      const message = JSON.parse(String(chunk)); messages.push(message);
      if (!hang && message.method === 'initialize') setImmediate(() => {
        child.stdout.write(JSON.stringify({ method: 'fixture/notification', params: {} }) + '\n');
        child.stdout.write(JSON.stringify({ id: message.id + responseIdOffset, result: initializeResult }) + '\n');
      });
      if (!hang && message.method === 'model/list') setImmediate(() => {
        const page = message.params?.cursor ? pages[1] : pages[0];
        child.stdout.write(JSON.stringify({ id: message.id, result: structuredClone(page) }) + '\n');
        afterModelReply();
      });
      callback();
    },
    final(callback) { if (closeOnEnd) setImmediate(() => child.emit('close', 0, null)); callback(); },
  });
  child.kill = signal => { signals.push(signal); if (typeof closeOnKill === 'function' ? closeOnKill(signal) : closeOnKill) setImmediate(() => child.emit('close', null, signal)); return true; };
  return { child, messages, signals };
}
