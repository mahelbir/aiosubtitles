import {describe, expect, it} from 'vitest';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {
  canDetectLanguageCode,
  detectLanguageCode,
  isLatinScriptText,
} from '../../src/file-format/detect-language.js';

const TURKISH_TEXT =
  'Günaydın, bugün hava çok güzel. İstanbul’a gitmek için erken çıktık. Şoför yolu bilmiyordu, ağaçların arasında kaybolduk. Çocuklar arka koltukta şarkı söylüyordu.';
const ENGLISH_TEXT =
  'Good morning, the weather is lovely today. We left early to catch the train to the city. The driver did not know the way, so we got lost on the old road.';
const GERMAN_TEXT =
  'Guten Morgen, das Wetter ist heute sehr schön. Wir sind früh losgefahren, um den Zug in die Stadt zu erreichen. Der Fahrer kannte den Weg nicht.';
const FRENCH_TEXT =
  'Bonjour, il fait très beau aujourd’hui. Nous sommes partis tôt pour prendre le train vers la ville. Le chauffeur ne connaissait pas le chemin.';

const ARABIC_TEXT =
  'صباح الخير، الطقس جميل جدا اليوم. خرجنا مبكرا لنلحق بالقطار إلى المدينة. السائق لم يكن يعرف الطريق، فضللنا في الطريق القديم.';
const PERSIAN_TEXT =
  'صبح بخیر، هوا امروز خیلی خوب است. ما زود بیرون رفتیم تا به قطار شهر برسیم. راننده راه را نمی‌دانست و ما در جاده قدیمی گم شدیم.';

describe('detectLanguageCode', () => {
  it.each([
    ['Turkish', TURKISH_TEXT, SubtitleLanguage.TUR],
    ['English', ENGLISH_TEXT, SubtitleLanguage.ENG],
    ['German', GERMAN_TEXT, SubtitleLanguage.GER],
    ['French', FRENCH_TEXT, SubtitleLanguage.FRE],
    ['Arabic', ARABIC_TEXT, SubtitleLanguage.ARA],
    ['Persian', PERSIAN_TEXT, SubtitleLanguage.FAS],
  ])('detects %s as its subtitle language code', (_, text, languageCode) => {
    expect(detectLanguageCode(text)).toBe(languageCode);
  });

  it('knows which expected languages it can confirm', () => {
    expect(canDetectLanguageCode(SubtitleLanguage.TUR)).toBe(true);
    expect(canDetectLanguageCode(SubtitleLanguage.POB)).toBe(true);
    expect(canDetectLanguageCode(SubtitleLanguage.NOR)).toBe(false);
    expect(canDetectLanguageCode('xyz')).toBe(false);
  });

  it('gives null for a language the subtitle language list lacks', () => {
    expect(
      detectLanguageCode(
        'Maayong buntag, nindot kaayo ang panahon karon. Mibiya mi sayo aron makasakay sa tren paingon sa siyudad. Wala kahibalo ang drayber sa dalan, mao nga nawala mi sa daang karsada.',
      ),
    ).toBeNull();
  });

  it('tells Latin-script text from other scripts and from text with no letter', () => {
    expect(isLatinScriptText(ENGLISH_TEXT)).toBe(true);
    expect(isLatinScriptText(ARABIC_TEXT)).toBe(false);
    expect(isLatinScriptText('1 2 3 ... 42 !!')).toBe(false);
  });

  it('does not count a writing script as a language it can name', () => {
    expect(canDetectLanguageCode(SubtitleLanguage.LAT)).toBe(false);
  });

  it('gives a code the subtitle language list knows', () => {
    expect(SubtitleLanguage.has(detectLanguageCode(GERMAN_TEXT))).toBe(true);
  });

  it.each([
    ['empty text', ''],
    ['numbers and symbols', '1 2 3 ... ♪ ♪ -- 42 !!'],
    ['one short word', 'Evet'],
  ])('gives null for %s', (_, text) => {
    expect(detectLanguageCode(text)).toBeNull();
  });
});
