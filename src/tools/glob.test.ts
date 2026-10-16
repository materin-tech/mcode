/**
 * materin-mcode — terminal AI coding agent
 * Copyright (c) 2026 Materin-tech. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expect } from 'vitest';
import { globToRegExp } from './glob.js';

describe('globToRegExp', () => {
  it('matches single star within a segment', () => {
    const re = globToRegExp('*.ts');
    expect(re.test('a.ts')).toBe(true);
    expect(re.test('sub/a.ts')).toBe(false);
  });
  it('double star crosses directories', () => {
    const re = globToRegExp('**.ts');
    expect(re.test('a.ts')).toBe(true);
  });
  it('question mark matches one char', () => {
    expect(globToRegExp('a?c.ts').test('abc.ts')).toBe(true);
    expect(globToRegExp('a?c.ts').test('ac.ts')).toBe(false);
  });
  it('escapes regex metachars', () => {
    expect(globToRegExp('a+b.ts').test('a+b.ts')).toBe(true);
    expect(globToRegExp('a+b.ts').test('aab.ts')).toBe(false);
  });
});
