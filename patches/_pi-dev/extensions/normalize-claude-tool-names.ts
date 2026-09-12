import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

const omniModels = new Set([
  'co-opus47',
  'co-opus48',
  'co-opus50',
  'co-sonnet50',
]);

export default function normalizeOmniToolNames(pi: ExtensionAPI) {
  pi.on('message_end', (event) => {
    const message = event.message;
    if (
      message.role !== 'assistant' ||
      message.provider !== 'omni' ||
      !omniModels.has(message.model)
    ) {
      return;
    }

    const toolsByLowerName = new Map<string, string>();
    const ambiguousNames = new Set<string>();
    for (const name of pi.getActiveTools()) {
      const lowerName = name.toLowerCase();
      if (toolsByLowerName.has(lowerName)) {
        toolsByLowerName.delete(lowerName);
        ambiguousNames.add(lowerName);
      } else if (!ambiguousNames.has(lowerName)) {
        toolsByLowerName.set(lowerName, name);
      }
    }

    let changed = false;
    const content = message.content.map((block) => {
      if (block.type !== 'toolCall') return block;

      const name = toolsByLowerName.get(block.name.toLowerCase());
      if (!name || name === block.name) return block;

      changed = true;
      return { ...block, name };
    });

    return changed ? { message: { ...message, content } } : undefined;
  });
}
