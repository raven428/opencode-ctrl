import { readFileSync } from 'node:fs';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

type PromptConfig = {
  reminders: string[];
  system: string[];
};

type ProviderMessage = {
  role: string;
  content: unknown;
  [key: string]: unknown;
};

type ProviderPayload = {
  messages?: ProviderMessage[];
  tools?: unknown;
  [key: string]: unknown;
};

const promptConfigPath = '/home/coder/.pi/agent/omni-claude-code-prompt.json';

function isProviderPayload(payload: unknown): payload is ProviderPayload {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload);
}

function loadPromptConfig(): PromptConfig {
  const config = JSON.parse(readFileSync(promptConfigPath, 'utf8')) as PromptConfig;
  if (config.reminders.length !== 3 || config.system.length === 0) {
    throw new Error('Invalid Omni Claude Code prompt configuration.');
  }
  return config;
}

export default function prependClaudeCodePrompt(pi: ExtensionAPI) {
  const prompt = loadPromptConfig();

  pi.on('before_agent_start', () => ({ systemPrompt: '' }));

  pi.on('before_provider_request', (event, ctx) => {
    if (ctx.model?.provider !== 'omni' || !isProviderPayload(event.payload)) return;

    const { tools, messages = [], ...payload } = event.payload;
    const filteredMessages = messages.filter((message) => message.role !== 'developer');
    const system = prompt.system.map((text, index) => ({
      type: 'text',
      text: index === 0 ? text.replace('cc_version=2.1.137.954', 'cc_version=2.1.137.955') : text,
      ...(index === 0 ? {} : { cache_control: { type: 'ephemeral' } }),
    }));

    return {
      ...payload,
      messages: [
        {
          role: 'user',
          content: prompt.reminders.map((text) => ({ type: 'text', text })),
        },
        ...filteredMessages,
      ],
      system,
      ...(tools === undefined ? {} : { tools }),
    };
  });
}
