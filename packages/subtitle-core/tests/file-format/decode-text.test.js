import iconv from 'iconv-lite';
import {describe, expect, it} from 'vitest';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {computeContentKey} from '../../src/file-format/content-key.js';
import {
  decodeSubtitleBytes,
  decodeSubtitleBytesAs,
} from '../../src/file-format/decode-text.js';
import {parseSubtitleText} from '../../src/file-format/parse-subtitle.js';
import {
  buildSrtText,
  toCrlf,
  turkishSrtFixture,
  utf16beWithBom,
  utf16leWithBom,
  utf8WithBom,
} from '../helpers/file-format-fixtures.js';

const LEGACY_TURKISH_ENCODING_PATTERN = /^(windows-1254|iso-8859-9)$/;

const SERBIAN_LATIN_LINES = [
  'Dobro jutro, vreme je danas veoma lepo.',
  'Krenuli smo rano da bismo stigli na voz za grad.',
  'Vozač nije znao put pa smo se izgubili na starom putu.',
  'Deca su pevala na zadnjem sedištu celim putem.',
  'Svi su ućutali kada su se upalila svetla.',
  'Mislim da smo trebali da idemo drugim putem.',
  'Izvini, zaboravio sam da ti kažem za sastanak.',
  'Kad sada pogledam unazad, sve mi izgleda čudno.',
  'Ne ostavljaj vrata otvorena, mačka će pobeći.',
  'Sutra ujutru krećemo rano.',
  'Ko će večeras da spremi večeru?',
  'Zbogom, i čuvaj se.',
];

const SERBIAN_CYRILLIC_LINES = [
  'Добро јутро, време је данас веома лепо.',
  'Кренули смо рано да бисмо стигли на воз за град.',
  'Возач није знао пут па смо се изгубили на старом путу.',
  'Деца су певала на задњем седишту целим путем.',
  'Сви су ућутали када су се упалила светла.',
  'Мислим да смо требали да идемо другим путем.',
  'Извини, заборавио сам да ти кажем за састанак.',
  'Кад сада погледам уназад, све ми изгледа чудно.',
  'Не остављај врата отворена, мачка ће побећи.',
  'Сутра ујутру крећемо рано.',
  'Ко ће вечерас да спреми вечеру?',
  'Збогом, и чувај се.',
];

const FRENCH_LINES = [
  'Bonjour, il fait très beau aujourd’hui.',
  'Nous sommes partis tôt pour prendre le train.',
  'Le chauffeur ne connaissait pas le chemin.',
  'Les enfants chantaient à l’arrière.',
  'Tout le monde s’est tu quand la lumière est revenue.',
  'Je pense qu’on aurait dû prendre l’autre route.',
  'Désolé, j’ai oublié de te parler de la réunion.',
  'Avec le recul, tout semble très étrange.',
  'Ne laisse pas la porte ouverte, le chat va s’enfuir.',
  'Nous partirons tôt demain matin.',
  'Qui va préparer le dîner ce soir ?',
  'Au revoir, et prends bien soin de toi.',
];

const keyOf = text => computeContentKey(parseSubtitleText({text}).cues);

describe('decodeSubtitleBytes', () => {
  it('decodes Windows-1254 Turkish text and keys it like its UTF-8 twin', () => {
    const srt = turkishSrtFixture();
    const legacy = decodeSubtitleBytes(iconv.encode(srt, 'win1254'));
    const modern = decodeSubtitleBytes(Buffer.from(srt, 'utf8'));

    expect(legacy.text).toBe(srt);
    expect(keyOf(legacy.text)).toBe(keyOf(modern.text));
  });

  it('names a legacy Turkish encoding for Windows-1254 bytes', () => {
    const legacy = decodeSubtitleBytes(
      iconv.encode(turkishSrtFixture(), 'win1254'),
    );

    expect(legacy.encoding).toMatch(LEGACY_TURKISH_ENCODING_PATTERN);
  });

  it('decodes ISO-8859-9 Turkish text like Windows-1254', () => {
    const srt = turkishSrtFixture();
    const latin5 = decodeSubtitleBytes(iconv.encode(srt, 'iso-8859-9'));

    expect(latin5.text).toBe(srt);
    expect(latin5.encoding).toMatch(LEGACY_TURKISH_ENCODING_PATTERN);
    expect(keyOf(latin5.text)).toBe(keyOf(srt));
  });

  it('keeps Windows-1254 punctuation from the 0x80-0x9F range', () => {
    const srt = `${turkishSrtFixture()}\n13\n00:00:41,000 --> 00:00:43,000\n“Şimdi değil…” dedi ağabeyi.\n`;

    expect(decodeSubtitleBytes(iconv.encode(srt, 'win1254')).text).toBe(srt);
  });

  it('keeps CRLF line endings of Windows-1254 text', () => {
    const srt = toCrlf(turkishSrtFixture());

    expect(decodeSubtitleBytes(iconv.encode(srt, 'win1254')).text).toBe(srt);
  });

  it('reads plain UTF-8 as UTF-8', () => {
    const srt = turkishSrtFixture();
    const modern = decodeSubtitleBytes(Buffer.from(srt, 'utf8'));

    expect(modern).toEqual({text: srt, encoding: 'utf-8'});
  });

  it('reads pure ASCII as UTF-8', () => {
    const srt = '1\n00:00:01,000 --> 00:00:02,000\nHello there.\n';

    expect(decodeSubtitleBytes(Buffer.from(srt, 'utf8'))).toEqual({
      text: srt,
      encoding: 'utf-8',
    });
  });

  it('reads UTF-8 with a byte-order mark and drops the mark', () => {
    const srt = turkishSrtFixture();

    expect(decodeSubtitleBytes(utf8WithBom(srt))).toEqual({
      text: srt,
      encoding: 'utf-8',
    });
  });

  it('reads UTF-16LE with a byte-order mark', () => {
    expect(decodeSubtitleBytes(utf16leWithBom(turkishSrtFixture())).text).toBe(
      turkishSrtFixture(),
    );
  });

  it('names UTF-16LE for a little-endian byte-order mark', () => {
    expect(
      decodeSubtitleBytes(utf16leWithBom(turkishSrtFixture())).encoding,
    ).toBe('utf-16le');
  });

  it('reads UTF-16BE with a byte-order mark', () => {
    expect(decodeSubtitleBytes(utf16beWithBom(turkishSrtFixture()))).toEqual({
      text: turkishSrtFixture(),
      encoding: 'utf-16be',
    });
  });

  it('decodes a minimum-size Windows-1254 file with few Turkish letters', () => {
    const srt = buildSrtText([
      'Evet, tamam.',
      'Ne oldu?',
      'Bilmiyorum.',
      'Hadi gidelim.',
      'Bekle beni.',
      'Kim o?',
      'Annem geldi.',
      'Kapıyı kapat.',
      'Tamam, abi.',
      'Saat kaç?',
      'Geç kaldık.',
      'Gel buraya.',
    ]);
    const legacy = decodeSubtitleBytes(iconv.encode(srt, 'win1254'));

    expect(legacy).toEqual({text: srt, encoding: 'windows-1254'});
    expect(keyOf(legacy.text)).toBe(keyOf(srt));
  });

  it('names windows-1254 for Turkish bytes a detector calls ISO-8859-9', () => {
    expect(
      decodeSubtitleBytes(iconv.encode(turkishSrtFixture(), 'iso-8859-9'))
        .encoding,
    ).toBe('windows-1254');
  });

  it('decodes binary bytes to text with a lower-case label without throwing', () => {
    const bytes = Uint8Array.from({length: 512}, (_, byteIndex) => byteIndex);
    const decoded = decodeSubtitleBytes(bytes);

    expect(decoded.text.length).toBeGreaterThan(0);
    expect(decoded.encoding).toBe(decoded.encoding.toLowerCase());
    expect(() => new TextDecoder(decoded.encoding)).not.toThrow();
  });

  it('reads UTF-16LE without a byte-order mark', () => {
    expect(
      decodeSubtitleBytes(Buffer.from(turkishSrtFixture(), 'utf16le')),
    ).toEqual({text: turkishSrtFixture(), encoding: 'utf-16le'});
  });

  it('reads UTF-16BE without a byte-order mark', () => {
    const bytes = Buffer.from(turkishSrtFixture(), 'utf16le').swap16();

    expect(decodeSubtitleBytes(bytes)).toEqual({
      text: turkishSrtFixture(),
      encoding: 'utf-16be',
    });
  });

  it('falls back to a decodable label for an encoding the platform lacks', () => {
    const text = '1\n00:00:01,000 --> 00:00:02,000\nHello there friend.\n';
    const bytes = Buffer.alloc(text.length * 4);
    [...text].forEach((character, characterIndex) =>
      bytes.writeUInt32LE(character.codePointAt(0), characterIndex * 4),
    );
    const decoded = decodeSubtitleBytes(bytes);

    expect(decoded.encoding).not.toBe('utf-8');
    expect(() => new TextDecoder(decoded.encoding)).not.toThrow();
  });

  it('keeps a UTF-8 file with one stray invalid byte as UTF-8', () => {
    const srt = turkishSrtFixture();
    const utf8Bytes = Buffer.from(srt, 'utf8');
    const strayByteIndex = utf8Bytes.indexOf('\n\n2\n');
    const bytes = Buffer.concat([
      utf8Bytes.subarray(0, strayByteIndex),
      Buffer.from([0xff]),
      utf8Bytes.subarray(strayByteIndex),
    ]);
    const decoded = decodeSubtitleBytes(bytes);

    expect(decoded.encoding).toBe('utf-8');
    const strayByteIndexInText = srt.indexOf('\n\n2\n');
    const replacementCharacter = String.fromCharCode(0xfffd);

    expect(decoded.text).toBe(
      `${srt.slice(0, strayByteIndexInText)}${replacementCharacter}${srt.slice(strayByteIndexInText)}`,
    );
    expect(parseSubtitleText({text: decoded.text}).cues[1]).toEqual(
      parseSubtitleText({text: srt}).cues[1],
    );
  });

  it('drops trailing NUL padding from a UTF-8 file', () => {
    const srt = turkishSrtFixture();
    const bytes = Buffer.concat([Buffer.from(srt, 'utf8'), Buffer.alloc(16)]);

    expect(decodeSubtitleBytes(bytes)).toEqual({text: srt, encoding: 'utf-8'});
  });

  it.each([
    ['Hayır.', 'win1254', SubtitleLanguage.TUR, 'windows-1254'],
    [
      'Crème brûlée, déjà vu à la française.',
      'win1252',
      SubtitleLanguage.FRE,
      'windows-1252',
    ],
  ])(
    'decodes the short legacy line %s with its language hint',
    (cueText, iconvEncoding, languageCodeHint, encoding) => {
      const srt = `1\n00:00:01,000 --> 00:00:03,000\n${cueText}\n`;

      expect(
        decodeSubtitleBytes(iconv.encode(srt, iconvEncoding), {
          languageCodeHint,
        }),
      ).toEqual({text: srt, encoding});
    },
  );

  it('lets a confident detection win over a hint of another script', () => {
    const srt = turkishSrtFixture();

    expect(
      decodeSubtitleBytes(iconv.encode(srt, 'win1254'), {
        languageCodeHint: SubtitleLanguage.RUS,
      }),
    ).toEqual({text: srt, encoding: 'windows-1254'});
  });

  it.each([
    ['Latin Serbian', 'win1250', SERBIAN_LATIN_LINES, 'windows-1250'],
    ['Cyrillic Serbian', 'win1251', SERBIAN_CYRILLIC_LINES, 'windows-1251'],
  ])(
    'decodes %s with a Serbian hint',
    (_, iconvEncoding, cueTexts, encoding) => {
      const srt = buildSrtText(cueTexts);

      expect(
        decodeSubtitleBytes(iconv.encode(srt, iconvEncoding), {
          languageCodeHint: SubtitleLanguage.SRP,
        }),
      ).toEqual({text: srt, encoding});
    },
  );

  it('keeps a confident detection over the hint even when it misreads a short line', () => {
    const srt = '1\n00:00:01,000 --> 00:00:03,000\nŞimdi değil.\n';

    expect(
      decodeSubtitleBytes(iconv.encode(srt, 'win1254'), {
        languageCodeHint: SubtitleLanguage.TUR,
      }).encoding,
    ).toBe('windows-1252');
  });

  it('takes the first hint code page when an unsure detection lists none of them', () => {
    const srt = '1\n00:00:01,000 --> 00:00:03,000\nHayır.\n';

    expect(
      decodeSubtitleBytes(iconv.encode(srt, 'win1254'), {
        languageCodeHint: SubtitleLanguage.ELL,
      }).encoding,
    ).toBe('windows-1253');
  });

  it('keeps a confident detection over a hint of another code page', () => {
    const srt = buildSrtText(FRENCH_LINES);

    expect(
      decodeSubtitleBytes(iconv.encode(srt, 'win1252'), {
        languageCodeHint: SubtitleLanguage.POL,
      }),
    ).toEqual({text: srt, encoding: 'windows-1252'});
  });

  it.each([
    ['UTF-8', utf8WithBom, 'utf-8'],
    ['UTF-16LE', utf16leWithBom, 'utf-16le'],
    ['UTF-16BE', utf16beWithBom, 'utf-16be'],
  ])(
    'drops trailing NUL padding after a %s byte-order mark',
    (_, withByteOrderMark, encoding) => {
      const srt = turkishSrtFixture();
      const bytes = Buffer.concat([withByteOrderMark(srt), Buffer.alloc(16)]);

      expect(decodeSubtitleBytes(bytes)).toEqual({text: srt, encoding});
    },
  );

  it('decodes no bytes to empty UTF-8 text', () => {
    expect(decodeSubtitleBytes(new Uint8Array())).toEqual({
      text: '',
      encoding: 'utf-8',
    });
  });

  it('accepts a plain Uint8Array', () => {
    const srt = turkishSrtFixture();
    const bytes = new Uint8Array(iconv.encode(srt, 'win1254'));

    expect(decodeSubtitleBytes(bytes).text).toBe(srt);
  });
});

describe('decodeSubtitleBytesAs', () => {
  it('decodes stored bytes with their recorded encoding', () => {
    const srt = turkishSrtFixture();
    const bytes = Buffer.concat([
      iconv.encode(srt, 'win1254'),
      Buffer.alloc(4),
    ]);
    const {encoding} = decodeSubtitleBytes(bytes);

    expect(decodeSubtitleBytesAs(bytes, encoding)).toBe(srt);
  });
});
