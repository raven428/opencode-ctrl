import { createHash, randomUUID } from 'node:crypto';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
const CLAUDE_CODE_VERSION = '2.1.281';
const CLAUDE_CODE_STAINLESS_VERSION = '0.112.1';
const CLAUDE_CODE_RUNTIME_VERSION = 'v26.3.0';
const VERSION_HASH_SALT = '59cf53e54c78';
const VERSION_HASH_CHARACTER_INDEXES = [4, 7, 20] as const;
const BILLING_PREFIX = 'x-anthropic-billing-header:';
const BASE_BETAS = [
  'claude-code-20250219',
  'oauth-2025-04-20',
  'interleaved-thinking-2025-05-14',
  'redact-thinking-2026-02-12',
  'thinking-token-count-2026-05-13',
  'context-management-2025-06-27',
  'prompt-caching-scope-2026-01-05',
];
const COMMON_BETAS = [...BASE_BETAS, 'mid-conversation-system-2026-04-07'];
const SONNET_BETAS = [
  ...COMMON_BETAS,
  'effort-2025-11-24',
  'extended-cache-ttl-2025-04-11',
];
const OPUS_5_5_BETAS = [
  ...COMMON_BETAS,
  'per-turn-control-2026-07-01',
  'mid-conversation-tool-changes-2026-07-01',
  'effort-2025-11-24',
  'fallback-credit-2026-06-01',
  'extended-cache-ttl-2025-04-11',
];
const OPUS_5_BETAS = [
  ...COMMON_BETAS,
  'mid-conversation-tool-changes-2026-07-01',
  'effort-2025-11-24',
  'fallback-credit-2026-06-01',
  'extended-cache-ttl-2025-04-11',
];
const OPUS_4_8_BETAS = [
  ...COMMON_BETAS,
  'mid-conversation-tool-changes-2026-07-01',
  'effort-2025-11-24',
  'extended-cache-ttl-2025-04-11',
];
const OPUS_4_7_BETAS = [
  ...BASE_BETAS,
  'effort-2025-11-24',
  'extended-cache-ttl-2025-04-11',
];
const BETAS_BY_MODEL: Record<string, string[]> = {
  'claude-sonnet-5': SONNET_BETAS,
  'claude-opus-5-5': OPUS_5_5_BETAS,
  'claude-opus-5': OPUS_5_BETAS,
  'claude-opus-4-8': OPUS_4_8_BETAS,
  'claude-opus-4-7': OPUS_4_7_BETAS,
};
export type ProviderPayload = Record<string, unknown>;
export type ProviderSystemBlock = Record<string, unknown>;
function isProviderPayload(payload: unknown): payload is ProviderPayload {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload);
}
function isSystemTextBlock(block: unknown): block is ProviderSystemBlock & { text: string } {
  return (
    typeof block === 'object' &&
    block !== null &&
    !Array.isArray(block) &&
    (block as ProviderSystemBlock).type === 'text' &&
    typeof (block as ProviderSystemBlock).text === 'string'
  );
}
function isAnthropicOAuth(ctx: ExtensionContext): boolean {
  return (
    ctx.model !== undefined &&
    ctx.model.provider === 'anthropic' &&
    ctx.modelRegistry.isUsingOAuth(ctx.model)
  );
}
export function buildHashFor(version: string, firstUserPrompt: string): string {
  const characters = VERSION_HASH_CHARACTER_INDEXES
    .map((index) => firstUserPrompt[index] ?? '0')
    .join('');
  return createHash('sha256')
    .update(`${VERSION_HASH_SALT}${characters}${version}`)
    .digest('hex')
    .slice(0, 3);
}
function firstUserPrompt(payload: ProviderPayload): string {
  if (!Array.isArray(payload.messages)) return '';
  for (const message of payload.messages) {
    if (!isProviderPayload(message) || message.role !== 'user') continue;
    const content = message.content;
    if (typeof content === 'string') {
      if (!content.startsWith('<system-reminder>')) return content;
      continue;
    }
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!isSystemTextBlock(block)) continue;
      if (block.text.startsWith('<system-reminder>')) continue;
      return block.text;
    }
  }
  return '';
}
function systemWithoutBilling(system: unknown): unknown[] {
  const blocks = typeof system === 'string'
    ? [{ type: 'text', text: system }]
    : Array.isArray(system)
      ? [...system]
      : [];
  return blocks.filter(
    (block) => !isSystemTextBlock(block) || !block.text.startsWith(BILLING_PREFIX),
  );
}
function stainlessOS(): string {
  switch (process.platform) {
    case 'darwin':
      return 'MacOS';
    case 'win32':
      return 'Windows';
    case 'linux':
      return 'Linux';
    case 'freebsd':
      return 'FreeBSD';
    default:
      return 'Unknown';
  }
}
function stainlessArch(): string {
  switch (process.arch) {
    case 'x64':
      return 'x64';
    case 'arm64':
      return 'arm64';
    case 'ia32':
      return 'x32';
    default:
      return process.arch;
  }
}
function setHeader(headers: Record<string, string | null>, name: string, value: string): void {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) delete headers[key];
  }
  headers[name] = value;
}
export default function anthropicOAuthFingerprint(pi: ExtensionAPI) {
  const sessionId = randomUUID();
  pi.on('before_provider_headers', (event, ctx) => {
    if (!isAnthropicOAuth(ctx)) return;
    const headers = event.headers as Record<string, string | null>;
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'x-client-request-id') delete headers[key];
    }
    setHeader(headers, 'Accept', 'application/json');
    setHeader(headers, 'anthropic-version', '2023-06-01');
    setHeader(headers, 'anthropic-dangerous-direct-browser-access', 'true');
    setHeader(headers, 'x-app', 'cli');
    setHeader(headers, 'User-Agent', `claude-cli/${CLAUDE_CODE_VERSION} (external, cli)`);
    setHeader(headers, 'X-Stainless-Package-Version', CLAUDE_CODE_STAINLESS_VERSION);
    setHeader(headers, 'X-Stainless-Timeout', '600');
    setHeader(headers, 'X-Stainless-Arch', stainlessArch());
    setHeader(headers, 'X-Stainless-Lang', 'js');
    setHeader(headers, 'X-Stainless-OS', stainlessOS());
    setHeader(headers, 'X-Stainless-Runtime', 'node');
    setHeader(headers, 'X-Stainless-Runtime-Version', CLAUDE_CODE_RUNTIME_VERSION);
    setHeader(headers, 'X-Stainless-Retry-Count', '0');
    setHeader(headers, 'X-Claude-Code-Session-Id', sessionId);
  });
  pi.on('before_provider_request', (event, ctx) => {
    if (!isAnthropicOAuth(ctx) || !isProviderPayload(event.payload)) return;
    const prompt = firstUserPrompt(event.payload);
    const billingBlock: ProviderSystemBlock & { text: string } = {
      type: 'text',
      text: (
        `x-anthropic-billing-header: cc_version=${CLAUDE_CODE_VERSION}.` +
        `${buildHashFor(CLAUDE_CODE_VERSION, prompt)}; cc_entrypoint=cli;`
      ),
    };
    const betas = BETAS_BY_MODEL[ctx.model?.id ?? ''] ?? event.payload.betas;
    return {
      ...event.payload,
      ...(betas === undefined ? {} : { betas }),
      system: [billingBlock, ...systemWithoutBilling(event.payload.system)],
    };
  });
}
