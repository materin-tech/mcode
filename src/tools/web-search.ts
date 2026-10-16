import { decodeEntities } from './web.js';
import { clampOutput } from './guard.js';
import type { ToolDefinition, ToolResult } from './types.js';

const TIMEOUT_MS = 15_000;
const MAX_RESULTS = 8;

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function unwrapDdgHref(href: string): string {
  // DDG wraps outbound links: //duckduckgo.com/l/?uddg=<encoded>&rut=...
  const match = /[?&]uddg=([^&]+)/.exec(href);
  return match ? decodeURIComponent(match[1]!) : href;
}

/** Parse DuckDuckGo HTML results. */
export function parseDuckDuckGo(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const blockRe = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  const titles: Array<{ url: string; title: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null) {
    titles.push({ url: decodeEntities(m[1]!), title: stripTags(m[2]!) });
  }
  const snippets: string[] = [];
  while ((m = snippetRe.exec(html)) !== null) {
    snippets.push(stripTags(m[1]!));
  }
  for (let i = 0; i < titles.length; i++) {
    results.push({ ...titles[i]!, url: unwrapDdgHref(titles[i]!.url), snippet: snippets[i] ?? '' });
  }
  return results;
}

/** Parse Bing (cn.bing.com) HTML results — fallback for regions blocking DDG. */
export function parseBing(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const blockRe = /<li class="b_algo"[\s\S]*?<h2><a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null) {
    const rest = m[3] ?? '';
    const pMatch = /<p[^>]*>([\s\S]*?)<\/p>/.exec(rest);
    results.push({ url: decodeEntities(m[1]!), title: stripTags(m[2]!), snippet: pMatch ? stripTags(pMatch[1]!) : '' });
  }
  return results;
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

/** Search via DuckDuckGo HTML, falling back to Bing CN. */
export async function runSearch(query: string, maxResults: number): Promise<SearchResult[]> {
  const raw = await rawFetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  if (raw) {
    const parsed = parseDuckDuckGo(raw);
    if (parsed.length > 0) return parsed.slice(0, maxResults);
  }
  const bing = await rawFetch(`https://cn.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults}`);
  if (bing) {
    const parsed = parseBing(bing);
    if (parsed.length > 0) return parsed.slice(0, maxResults);
  }
  return [];
}

async function rawFetch(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const webSearchTool: ToolDefinition = {
  name: 'websearch',
  description:
    'Search the web with a search engine and return ranked results (title, URL, snippet). Use for current events, real-time data, docs lookup, or anything beyond your knowledge.',
  isReadOnly: true,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query (any language).' },
      max_results: { type: 'number', description: 'Optional max results (default 5, max 8).' },
    },
    required: ['query'],
  },
  async execute(input): Promise<ToolResult> {
    const query = String(input['query']).trim();
    if (query.length === 0) return { success: false, output: 'error: empty query' };
    const maxResults =
      typeof input['max_results'] === 'number' && input['max_results'] > 0
        ? Math.min(Math.floor(input['max_results']), MAX_RESULTS)
        : 5;
    const results = await runSearch(query, maxResults);
    if (results.length === 0) {
      return { success: false, output: 'error: no results (search engines may be unreachable from this network)' };
    }
    const lines = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}${r.snippet ? `\n   ${r.snippet.slice(0, 200)}` : ''}`);
    return { success: true, output: clampOutput(lines.join('\n')) };
  },
};
