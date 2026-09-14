import { createHash, randomUUID } from 'node:crypto';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

const CLAUDE_CODE_VERSION = '2.1.131';
const CLAUDE_CODE_STAINLESS_VERSION = '0.81.0';
const CCH_SEED = 0x6e52736ac806831en;
const CCH_MASK = 0xfffffn;
const CCH_PLACEHOLDER = '00000';
const UINT64_MASK = 0xffffffffffffffffn;
const PRIME64_1 = 0x9e3779b185ebca87n;
const PRIME64_2 = 0xc2b2ae3d27d4eb4fn;
const PRIME64_3 = 0x165667b19e3779f9n;
const PRIME64_4 = 0x85ebca77c2b2ae63n;
const PRIME64_5 = 0x27d4eb2f165667c5n;
const BILLING_PREFIX = 'x-anthropic-billing-header:';

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

export function rotateLeft64(value: bigint, bits: bigint): bigint {
  return ((value << bits) | (value >> (64n - bits))) & UINT64_MASK;
}

export function readUint64LE(bytes: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let index = 0; index < 8; index += 1) {
    value |= BigInt(bytes[offset + index]) << BigInt(index * 8);
  }
  return value;
}

export function readUint32LE(bytes: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let index = 0; index < 4; index += 1) {
    value |= BigInt(bytes[offset + index]) << BigInt(index * 8);
  }
  return value;
}

function round(accumulator: bigint, input: bigint): bigint {
  const mixed = (accumulator + input * PRIME64_2) & UINT64_MASK;
  return (rotateLeft64(mixed, 31n) * PRIME64_1) & UINT64_MASK;
}

function mergeRound(accumulator: bigint, value: bigint): bigint {
  const mixed = accumulator ^ round(0n, value);
  return (mixed * PRIME64_1 + PRIME64_4) & UINT64_MASK;
}

export function xxhash64(bytes: Uint8Array, seed: bigint): bigint {
  let offset = 0;
  let hash: bigint;
  if (bytes.length >= 32) {
    let lane1 = (seed + PRIME64_1 + PRIME64_2) & UINT64_MASK;
    let lane2 = (seed + PRIME64_2) & UINT64_MASK;
    let lane3 = seed & UINT64_MASK;
    let lane4 = (seed - PRIME64_1) & UINT64_MASK;
    const limit = bytes.length - 32;
    while (offset <= limit) {
      lane1 = round(lane1, readUint64LE(bytes, offset));
      lane2 = round(lane2, readUint64LE(bytes, offset + 8));
      lane3 = round(lane3, readUint64LE(bytes, offset + 16));
      lane4 = round(lane4, readUint64LE(bytes, offset + 24));
      offset += 32;
    }
    hash = (
      rotateLeft64(lane1, 1n) +
      rotateLeft64(lane2, 7n) +
      rotateLeft64(lane3, 12n) +
      rotateLeft64(lane4, 18n)
    ) & UINT64_MASK;
    hash = mergeRound(hash, lane1);
    hash = mergeRound(hash, lane2);
    hash = mergeRound(hash, lane3);
    hash = mergeRound(hash, lane4);
  } else {
    hash = (seed + PRIME64_5) & UINT64_MASK;
  }
  hash = (hash + BigInt(bytes.length)) & UINT64_MASK;
  while (offset + 8 <= bytes.length) {
    const lane = round(0n, readUint64LE(bytes, offset));
    hash ^= lane;
    hash = (rotateLeft64(hash, 27n) * PRIME64_1 + PRIME64_4) & UINT64_MASK;
    offset += 8;
  }
  if (offset + 4 <= bytes.length) {
    hash ^= (readUint32LE(bytes, offset) * PRIME64_1) & UINT64_MASK;
    hash = (rotateLeft64(hash, 23n) * PRIME64_2 + PRIME64_3) & UINT64_MASK;
    offset += 4;
  }
  while (offset < bytes.length) {
    hash ^= (BigInt(bytes[offset]) * PRIME64_5) & UINT64_MASK;
    hash = (rotateLeft64(hash, 11n) * PRIME64_1) & UINT64_MASK;
    offset += 1;
  }
  hash ^= hash >> 33n;
  hash = (hash * PRIME64_2) & UINT64_MASK;
  hash ^= hash >> 29n;
  hash = (hash * PRIME64_3) & UINT64_MASK;
  return (hash ^ (hash >> 32n)) & UINT64_MASK;
}

export function computeCCH(bodyString: string): string {
  const hash = xxhash64(new TextEncoder().encode(bodyString), CCH_SEED);
  return (hash & CCH_MASK).toString(16).padStart(5, '0');
}

export function buildHashFor(version: string, dayStamp: string): string {
  return createHash('sha256').update(`${dayStamp}${version}`).digest('hex').slice(0, 3);
}

export function normalizeAnthropicBodyForSigning(payload: ProviderPayload): ProviderPayload {
  const { output_format: outputFormat, output_config: outputConfig, ...body } = payload;
  if (!outputFormat) return payload;
  if (isProviderPayload(outputConfig) && outputConfig.format) {
    throw new Error('Cannot specify both output_format and output_config.format.');
  }
  return {
    ...body,
    output_config: {
      ...(isProviderPayload(outputConfig) ? outputConfig : {}),
      format: outputFormat,
    },
  };
}

function buildSigningBody(payload: ProviderPayload): ProviderPayload {
  const normalized = normalizeAnthropicBodyForSigning(payload);
  const { betas, user_profile_id, workspace_id, ...body } = normalized;
  void betas;
  void user_profile_id;
  void workspace_id;
  return body;
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
    setHeader(headers, 'X-Stainless-Runtime-Version', process.version);
    setHeader(headers, 'X-Stainless-Retry-Count', '0');
    setHeader(headers, 'x-client-request-id', randomUUID());
    setHeader(headers, 'X-Claude-Code-Session-Id', sessionId);
  });

  // This handler must load after every payload rewriter so CCH signs final bytes.
  pi.on('before_provider_request', (event, ctx) => {
    if (!isAnthropicOAuth(ctx) || !isProviderPayload(event.payload)) return;
    const dayStamp = new Date().toISOString().slice(0, 10);
    const billing = (
      `x-anthropic-billing-header: cc_version=${CLAUDE_CODE_VERSION}.` +
      `${buildHashFor(CLAUDE_CODE_VERSION, dayStamp)}; cc_entrypoint=cli; ` +
      `cch=${CCH_PLACEHOLDER};`
    );
    const billingBlock: ProviderSystemBlock & { text: string } = {
      type: 'text',
      text: billing,
    };
    const system: unknown[] = [billingBlock, ...systemWithoutBilling(event.payload.system)];
    const payload = { ...event.payload, system };
    // SDK moves these fields into headers before serializing the body for transport.
    const cch = computeCCH(JSON.stringify(buildSigningBody(payload)));
    billingBlock.text = billing.replace(`cch=${CCH_PLACEHOLDER};`, `cch=${cch};`);
    return payload;
  });
}
