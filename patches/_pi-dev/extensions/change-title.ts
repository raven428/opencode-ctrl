import { Type } from 'typebox';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export const CHANGE_TITLE_SYSTEM_PROMPT = [
  '# Session title',
  '',
  'At the start of the session (before you respond to the first user ' +
    'message), you MUST call the change_title tool once to set a short, descriptive ' +
    "session title based on the user's message.",
  '',
  'This title-change tool call is always allowed and does not require asking the user ' +
    'for permission.',
  '',
  'The tool may be exposed under different names depending on the provider. Prefer ' +
    '"mcp__happier__change_title" when available; otherwise use an equivalent alias ' +
    '(for example: change_title).',
  '',
  'Call the title tool again if the task changes significantly.',
].join('\n');

const ChangeTitleParams = Type.Object(
  {
    title: Type.String({ minLength: 1 }),
  },
  { additionalProperties: true },
);

export default function changeTitle(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'change_title',
    label: 'Change Chat Title',
    description: 'Change the title of the current chat session',
    parameters: ChangeTitleParams,
    async execute(_toolCallId, params) {
      pi.setSessionName(params.title);
      const result = { success: true as const, title: params.title };
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        details: result,
      };
    },
  });

  pi.on('before_agent_start', (event) => {
    if (!event.systemPromptOptions.selectedTools?.includes('change_title')) return;
    if (event.systemPrompt.includes(CHANGE_TITLE_SYSTEM_PROMPT)) return;

    const appendSystemPrompt = event.systemPromptOptions.appendSystemPrompt ?? '';
    if (!appendSystemPrompt.includes(CHANGE_TITLE_SYSTEM_PROMPT)) {
      event.systemPromptOptions.appendSystemPrompt = appendSystemPrompt
        ? `${appendSystemPrompt}\n\n${CHANGE_TITLE_SYSTEM_PROMPT}`
        : CHANGE_TITLE_SYSTEM_PROMPT;
    }

    return {
      systemPrompt: `${event.systemPrompt}\n\n${CHANGE_TITLE_SYSTEM_PROMPT}`,
    };
  });
}
