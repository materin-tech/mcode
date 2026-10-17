/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { readFile } from 'node:fs/promises';

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'icns', 'tiff',
  'pdf', 'zip', 'gz', 'tar', 'rar', '7z', 'bz2', 'xz',
  'mp3', 'mp4', 'mov', 'avi', 'mkv', 'wav', 'flac',
  'woff', 'woff2', 'ttf', 'otf', 'eot', 'exe', 'dll', 'dylib', 'so', 'bin',
  'ds_store', 'pptx', 'docx', 'xlsx', 'key', 'pages', 'numbers',
]);

function isBinaryPath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return BINARY_EXTENSIONS.has(ext);
}

/** Detect binary content by NUL bytes / control-char ratio in the head. */
function looksBinary(content: string): boolean {
  const head = content.slice(0, 8000);
  if (head.includes('\u0000')) return true;
  let suspicious = 0;
  for (let i = 0; i < head.length; i++) {
    const code = head.charCodeAt(i);
    if (code < 9 || (code > 13 && code < 32)) suspicious++;
  }
  return suspicious / head.length > 0.1;
}
import { guardPath } from '../tools/guard.js';
import { MAX_AT_FILE_CHARS } from '../config/constants.js';

/**
 * Matches '@path' refs. The path must end on a word char so trailing
 * sentence punctuation ('@src/a.ts.') is not swallowed into the path.
 */
export const FILE_REF_PATTERN = /@([\w\-./]*[\w\-])/g;

export interface FileRefResult {
  /** Input with @path references expanded to annotated content blocks. */
  text: string;
  /** Paths that were successfully injected. */
  injected: string[];
  /** @refs that looked like paths but could not be resolved. */
  missing: string[];
  /** Images to attach as input_image parts (multimodal models). */
  attachments: Array<{ path: string; dataUrl: string }>;
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function imageMime(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'bmp') return 'image/bmp';
  return 'image/png';
}

/**
 * Expand '@path' references in user input into annotated file-content
 * blocks for the model. The original @mention is kept as a header so the
 * transcript stays readable. Missing files are reported, not silently dropped.
 */
export async function expandFileRefs(input: string, cwd: string): Promise<FileRefResult> {
  const refs = new Set<string>();
  for (const match of input.matchAll(FILE_REF_PATTERN)) {
    refs.add(match[1]!);
  }
  if (refs.size === 0) return { text: input, injected: [], missing: [], attachments: [] };

  const injected: string[] = [];
  const missing: string[] = [];
  const blocks: string[] = [];
  const attachments: Array<{ path: string; dataUrl: string }> = [];
  for (const ref of refs) {
    const abs = guardPath(ref, cwd);
    if (!abs) {
      missing.push(ref);
      continue;
    }
    try {
      if (IMAGE_EXTENSIONS.has(ref.split('.').pop()?.toLowerCase() ?? '')) {
        // multimodal path: attach as an input_image part, never as text
        const { stat } = await import('node:fs/promises');
        const info = await stat(abs);
        if (info.size > MAX_IMAGE_BYTES) {
          missing.push(`${ref} (image too large: ${info.size} bytes)`);
          continue;
        }
        const buf = await readFile(abs);
        attachments.push({ path: ref, dataUrl: `data:${imageMime(ref)};base64,${buf.toString('base64')}` });
        injected.push(ref);
        continue;
      }
      if (isBinaryPath(ref)) {
        missing.push(`${ref} (binary file — skipped, cannot render as text)`);
        continue;
      }
      const content = await readFile(abs, 'utf8');
      if (looksBinary(content)) {
        missing.push(`${ref} (binary content detected — skipped)`);
        continue;
      }
      injected.push(ref);
      blocks.push(
        `--- file: ${ref} ---\n${content.slice(0, MAX_AT_FILE_CHARS)}${content.length > MAX_AT_FILE_CHARS ? '\n…[truncated]' : ''}\n--- end of ${ref} ---`,
      );
    } catch {
      missing.push(ref);
    }
  }

  if (blocks.length === 0) return { text: input, injected, missing, attachments };
  const text = `${input}\n\n${blocks.join('\n\n')}`;
  return { text, injected, missing, attachments };
}
