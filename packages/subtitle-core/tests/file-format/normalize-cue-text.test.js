import {describe, expect, it} from 'vitest';
import {normalizeCueText} from '../../src/file-format/normalize-cue-text.js';

describe('normalizeCueText', () => {
  it('drops tags and override blocks and joins \\N into one space', () => {
    expect(normalizeCueText('<i>Hi</i>\\N{\\an8}there  ')).toBe('Hi there');
  });

  it('drops HTML tags with attributes', () => {
    expect(
      normalizeCueText('<font color="#ff0000">Kırmızı</font> <b>elma</b>'),
    ).toBe('Kırmızı elma');
  });

  it('drops WebVTT voice and class tags', () => {
    expect(normalizeCueText('<v Ayşe>Selam</v> <c.yellow>dünya</c>')).toBe(
      'Selam dünya',
    );
  });

  it('drops ASS override blocks inside a word', () => {
    expect(normalizeCueText('{\\i1}Ağ{\\i0}abey {\\c&H00FFFF&}geldi')).toBe(
      'Ağabey geldi',
    );
  });

  it('drops an ASS drawing as a whole', () => {
    expect(normalizeCueText('{\\p1}m 0 0 l 100 0 100 100 0 100{\\p0}')).toBe(
      '',
    );
  });

  it('keeps the text after an ASS drawing', () => {
    expect(
      normalizeCueText('{\\p1}m 0 0 l 10 0 10 10{\\p0}Tabelada yazan bu'),
    ).toBe('Tabelada yazan bu');
  });

  it('drops a drawing whose block also carries other overrides', () => {
    expect(
      normalizeCueText('{\\an7\\pos(10,10)\\p2}m 0 0 b 10 0 20 10 20 20{\\p0}'),
    ).toBe('');
  });

  it('turns \\n, \\h and real line breaks into one space', () => {
    expect(normalizeCueText('Bir\\nİki\\hÜç\nDört\r\nBeş\rAltı')).toBe(
      'Bir İki Üç Dört Beş Altı',
    );
  });

  it('collapses runs of spaces and tabs and trims the ends', () => {
    const noBreakSpace = String.fromCharCode(0xa0);

    expect(normalizeCueText(`  Çok \t  boşluk${noBreakSpace} var.  `)).toBe(
      'Çok boşluk var.',
    );
  });

  it('composes decomposed letters to NFC', () => {
    const decomposed = 'güzel çiçek şeker'.normalize('NFD');

    expect(decomposed).not.toBe('güzel çiçek şeker');
    expect(normalizeCueText(decomposed)).toBe('güzel çiçek şeker');
    expect(normalizeCueText(decomposed)).toBe(
      normalizeCueText('güzel çiçek şeker'),
    );
  });

  it('keeps case, punctuation and Turkish dotted capitals', () => {
    expect(normalizeCueText('İSTANBUL, Işık! "Evet?" - Hayır.')).toBe(
      'İSTANBUL, Işık! "Evet?" - Hayır.',
    );
  });

  it('gives an empty string for styling-only text', () => {
    expect(normalizeCueText('{\\an8}<i></i>  \\N ')).toBe('');
  });
});
