import { describe, it, expect } from 'vitest';
import { createThinkingFilter, stripThinkingTags } from '../src/agent/thinking-filter';

describe('ThinkingFilter', () => {
  it('passes through normal text unchanged', () => {
    const filter = createThinkingFilter();
    const chunks: string[] = [];

    chunks.push(...filter.push('Hello '));
    chunks.push(...filter.push('world!'));
    chunks.push(...filter.flush());

    expect(chunks.join('')).toBe('Hello world!');
  });

  it('strips a complete <thinking> block in a single chunk', () => {
    const filter = createThinkingFilter();
    const chunks: string[] = [];

    chunks.push(...filter.push('<thinking>some internal reasoning</thinking>The actual response'));
    chunks.push(...filter.flush());

    expect(chunks.join('')).toBe('The actual response');
  });

  it('strips a <thinking> block split across multiple chunks', () => {
    const filter = createThinkingFilter();
    const chunks: string[] = [];

    chunks.push(...filter.push('Here is '));
    chunks.push(...filter.push('<think'));
    chunks.push(...filter.push('ing>\nLet me reason about'));
    chunks.push(...filter.push(' this carefully.\n</think'));
    chunks.push(...filter.push('ing>'));
    chunks.push(...filter.push(' the answer.'));
    chunks.push(...filter.flush());

    expect(chunks.join('')).toBe('Here is  the answer.');
  });

  it('strips thinking block at the start of response', () => {
    const filter = createThinkingFilter();
    const chunks: string[] = [];

    chunks.push(...filter.push('<thinking>'));
    chunks.push(...filter.push('Internal reasoning here'));
    chunks.push(...filter.push('</thinking>'));
    chunks.push(...filter.push('\nActual response'));
    chunks.push(...filter.flush());

    expect(chunks.join('')).toBe('\nActual response');
  });

  it('strips multiple thinking blocks', () => {
    const filter = createThinkingFilter();
    const chunks: string[] = [];

    chunks.push(...filter.push('Part 1. <thinking>first block</thinking> Part 2. <thinking>second block</thinking> Part 3.'));
    chunks.push(...filter.flush());

    expect(chunks.join('')).toBe('Part 1.  Part 2.  Part 3.');
  });

  it('handles a partial tag that turns out not to be a thinking tag', () => {
    const filter = createThinkingFilter();
    const chunks: string[] = [];

    chunks.push(...filter.push('Use <th'));
    chunks.push(...filter.push('e> tag for tables'));
    chunks.push(...filter.flush());

    expect(chunks.join('')).toBe('Use <the> tag for tables');
  });

  it('handles newlines inside thinking blocks', () => {
    const filter = createThinkingFilter();
    const chunks: string[] = [];

    chunks.push(...filter.push('<thinking>\nLine 1\nLine 2\nLine 3\n</thinking>Response'));
    chunks.push(...filter.flush());

    expect(chunks.join('')).toBe('Response');
  });

  it('flushes buffered content that is not a thinking tag', () => {
    const filter = createThinkingFilter();
    const chunks: string[] = [];

    chunks.push(...filter.push('Ends with <thin'));
    // Stream ends without completing the tag
    chunks.push(...filter.flush());

    expect(chunks.join('')).toBe('Ends with <thin');
  });

  it('strips thinking from complete strings via stripThinkingTags', () => {
    expect(stripThinkingTags('<thinking>foo</thinking>bar')).toBe('bar');
    expect(stripThinkingTags('a<thinking>b</thinking>c<thinking>d</thinking>e')).toBe('ace');
    expect(stripThinkingTags('no tags here')).toBe('no tags here');
    expect(stripThinkingTags('<thinking>\nmultiline\n</thinking>ok')).toBe('ok');
  });

  it('handles empty chunks', () => {
    const filter = createThinkingFilter();
    const chunks: string[] = [];

    chunks.push(...filter.push(''));
    chunks.push(...filter.push('hello'));
    chunks.push(...filter.push(''));
    chunks.push(...filter.flush());

    expect(chunks.join('')).toBe('hello');
  });
});
