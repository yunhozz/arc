export function asciiToken(s) {
  return String(s ?? '').replace(/[^A-Za-z0-9._:-]/g, '-').replace(/-+/g, '-');
}

export function roleFromName(name) {
  return typeof name === 'string' ? /^arc[_-](?:routing[_-])?(scouter|planner|implementer|qa|reviewer)$/.exec(name)?.[1] ?? null : null;
}

export function topLabel({platform, origin, sessionId}) {
  const kind = platform === 'claude'
    ? (!origin || origin === 'cli' ? 'main' : `main:${asciiToken(origin)}`)
    : origin === 'codex-tui' ? 'tui' : origin === 'codex_exec' ? 'exec' : asciiToken(origin);
  return `${kind}#${asciiToken(String(sessionId ?? '').slice(-4))}`;
}

export function childLabel(parentLabel, {agentRole, agentType, nickname}) {
  const child = roleFromName(agentRole) ?? roleFromName(agentType) ?? nickname ?? agentRole ?? agentType ?? 'agent';
  // Parent separators are structural, so normalize each token separately.
  return `${String(parentLabel).split('/').map(part => part.split(/([#@])/).map(token => token === '#' || token === '@' ? token : asciiToken(token)).join('')).join('/')}/${asciiToken(child)}`;
}

export function dispatchLabel(rawRole, dispatchId) {
  return `${asciiToken(roleFromName(rawRole) ?? rawRole ?? 'dispatch')}@${String(dispatchId).replace(/[^A-Za-z0-9]/g, '').slice(0,4)}`;
}
