import { fetchText } from './web.js';
import { clampOutput } from './guard.js';
import type { ToolDefinition, ToolResult } from './types.js';

const MAX_CHARS = 20_000;
const TIMEOUT_MS = 20_000;

/** Fetch a URL and return its readable text content. */
export const webFetchTool: ToolDefinition = {
  name: 'webfetch',
  description:
    'Fetch a web page by URL and return its readable text (title + body). Use for docs, APIs, articles, or any URL the user asks about.',
  isReadOnly: true,
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Absolute http(s) URL to fetch.' },
      max_chars: { type: 'number', description: 'Optional max characters of returned text.' },
    },
    required: ['url'],
  },
  async execute(input): Promise<ToolResult> {
    const url = String(input['url']).trim();
    const maxChars =
      typeof input['max_chars'] === 'number' && input['max_chars'] > 0
        ? Math.min(input['max_chars'], MAX_CHARS)
        : MAX_CHARS;
    const result = await fetchText(url, { maxChars, timeoutMs: TIMEOUT_MS });
    if (!result.ok) {
      return { success: false, output: result.error ?? 'error: fetch failed' };
    }
    const header = result.title ? `# ${result.title}\n\n` : '';
    const body = result.text ?? '';
    if (body.trim().length === 0) {
      return { success: true, output: '(page returned no readable text — it may be JS-rendered)' };
    }
    return { success: true, output: clampOutput(`${header}${body}`, maxChars) };
  },
};
