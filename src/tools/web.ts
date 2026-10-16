const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export interface FetchTextResult {
  ok: boolean;
  status?: number;
  title?: string;
  text?: string;
  error?: string;
}

/** Extract a readable text body from HTML (no dependencies). */
export function htmlToText(html: string): { title: string; text: string } {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = decodeEntities((titleMatch?.[1] ?? '').trim());
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const text = decodeEntities(body)
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
  return { title, text };
}

export function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/gi, "'");
}

/** Fetch a URL with timeout + size cap, returning extracted text. */
export async function fetchText(url: string, options: { maxChars: number; timeoutMs: number }): Promise<FetchTextResult> {
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: 'error: only http(s) URLs are supported' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' },
      signal: controller.signal,
      redirect: 'follow',
    });
    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok) {
      return { ok: false, status: res.status, error: `error: HTTP ${res.status}` };
    }
    if (contentType.includes('application/json')) {
      const raw = await res.text();
      return { ok: true, status: res.status, text: raw.slice(0, options.maxChars) };
    }
    const raw = await res.text();
    const { title, text } = htmlToText(raw);
    return { ok: true, status: res.status, title, text: text.slice(0, options.maxChars) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: controller.signal.aborted ? `error: timeout after ${options.timeoutMs}ms` : `error: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}
