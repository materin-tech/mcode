import { describe, it, expect, vi, afterEach } from 'vitest';
import { htmlToText, decodeEntities, fetchText } from './web.js';
import { parseDuckDuckGo, parseBing } from './web-search.js';
import { webFetchTool } from './web-fetch.js';

const SAMPLE_DDG = `
<div class="result results_links">
  <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa&rut=x">Title <b>A</b></a>
  <a class="result__snippet" href="#">Snippet one &amp; more</a>
  <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fb">Title B</a>
</div>`;

const SAMPLE_BING = `
<li class="b_algo"><h2><a href="https://e.com/1">Bing Result</a></h2>
<div class="b_caption"><p>cap snippet text</p></div></li>`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('htmlToText', () => {
  it('strips scripts/styles and extracts title + text', () => {
    const { title, text } = htmlToText(
      '<html><head><title>My Page</title></head><body><script>evil()</script><style>x{}</style><h1>Head</h1><p>Para <b>bold</b></p></body></html>',
    );
    expect(title).toBe('My Page');
    expect(text).toContain('Head');
    expect(text).toContain('Para bold');
    expect(text).not.toContain('evil()');
  });

  it('decodes entities', () => {
    expect(decodeEntities('a &amp; b &quot;q&quot; &#x27;s&#x27;')).toBe('a & b "q" \'s\'');
  });
});

describe('fetchText', () => {
  it('rejects non-http(s) urls', async () => {
    const r = await fetchText('file:///etc/passwd', { maxChars: 100, timeoutMs: 1000 });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('http(s)');
  });

  it('returns HTTP error status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    const r = await fetchText('https://x.com/missing', { maxChars: 100, timeoutMs: 1000 });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
  });

  it('extracts text from mocked html response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('<html><title>T</title><body><p>hello world</p></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    ));
    const r = await fetchText('https://x.com/', { maxChars: 100, timeoutMs: 1000 });
    expect(r.ok).toBe(true);
    expect(r.title).toBe('T');
    expect(r.text).toContain('hello world');
  });
});

describe('search parsers', () => {
  it('parses DDG results and unwraps uddg links', () => {
    const results = parseDuckDuckGo(SAMPLE_DDG);
    expect(results).toHaveLength(2);
    expect(results[0]!.title).toBe('Title A');
    expect(results[0]!.url).toBe('https://example.com/a');
    expect(results[0]!.snippet).toBe('Snippet one & more');
  });

  it('parses Bing results', () => {
    const results = parseBing(SAMPLE_BING);
    expect(results).toHaveLength(1);
    expect(results[0]!.url).toBe('https://e.com/1');
    expect(results[0]!.snippet).toBe('cap snippet text');
  });
});

describe('webfetch tool', () => {
  it('executes end-to-end with mocked fetch', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('<html><title>Doc</title><body>api usage text</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    ));
    const result = await webFetchTool.execute({ url: 'https://docs.example.com' }, { cwd: '/tmp', mode: 'passon' });
    expect(result.success).toBe(true);
    expect(result.output).toContain('# Doc');
    expect(result.output).toContain('api usage text');
  });

  it('handles empty page gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('<html><body></body></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    ));
    const result = await webFetchTool.execute({ url: 'https://spa.example.com' }, { cwd: '/tmp', mode: 'passon' });
    expect(result.success).toBe(true);
    expect(result.output).toContain('JS-rendered');
  });
});
