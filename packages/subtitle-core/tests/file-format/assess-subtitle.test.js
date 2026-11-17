import {describe, expect, it} from 'vitest';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {
  SubtitleFileFormat,
  SubtitleFileInvalidReason,
} from '../../src/constants/subtitle-core-enums.js';
import {
  REPETITIVE_TEXT_SHARE_MAX,
  SUBTITLE_CUE_COUNT_MIN,
  assessSubtitleFile,
} from '../../src/file-format/assess-subtitle.js';
import {parseSubtitleText} from '../../src/file-format/parse-subtitle.js';
import {
  buildSrtText,
  readFileFormatFixture,
  turkishSrtFixture,
} from '../helpers/file-format-fixtures.js';

const TURKISH_LINES = turkishSrtFixture()
  .split('\n\n')
  .map(block => block.split('\n').slice(2).join(' '));

const VALID_TURKISH_ASSESSMENT = {
  isFileValid: true,
  fileInvalidReasons: [],
  detectedLanguageCode: SubtitleLanguage.TUR,
};

const assessText = (text, expectedLanguageCode = SubtitleLanguage.TUR) =>
  assessSubtitleFile({
    parsedSubtitle: parseSubtitleText({text}),
    expectedLanguageCode,
  });

describe('assessSubtitleFile', () => {
  it('exports the cue count and repetition thresholds', () => {
    expect(SUBTITLE_CUE_COUNT_MIN).toBe(10);
    expect(REPETITIVE_TEXT_SHARE_MAX).toBe(0.2);
  });

  it('accepts a full Turkish file expected in Turkish', () => {
    expect(assessText(turkishSrtFixture())).toEqual(VALID_TURKISH_ASSESSMENT);
  });

  it('accepts a full Turkish ASS file', () => {
    const assHeader = readFileFormatFixture('twin.ass').split('Dialogue:')[0];
    const dialogueLines = TURKISH_LINES.map(
      (cueText, cueIndex) =>
        `Dialogue: 0,0:00:${String(cueIndex * 3 + 1).padStart(2, '0')}.00,0:00:${String(cueIndex * 3 + 3).padStart(2, '0')}.00,Default,,0,0,0,,{\\i1}${cueText}{\\i0}\n`,
    );

    expect(assessText(assHeader + dialogueLines.join(''))).toEqual(
      VALID_TURKISH_ASSESSMENT,
    );
  });

  it.each([
    [
      'a doctype',
      '<!DOCTYPE html>\n<html><head><title>Error</title></head><body>Too many requests</body></html>\n',
    ],
    [
      'an html tag',
      '<html>\n<body><h1>503 Service Unavailable</h1></body>\n</html>\n',
    ],
    [
      'leading whitespace and upper case',
      '\n  <!doctype HTML><HTML><BODY>Forbidden</BODY></HTML>',
    ],
  ])('marks an HTML error page with %s as ERROR_PAGE', (_, text) => {
    const assessment = assessText(text);

    expect(assessment.isFileValid).toBe(false);
    expect(assessment.fileInvalidReasons).toContain(
      SubtitleFileInvalidReason.ERROR_PAGE,
    );
  });

  it('does not take a cue with an HTML tag for an error page', () => {
    const text = turkishSrtFixture().replace(
      'Günaydın, bugün hava çok güzel.',
      '<i>Günaydın</i>, bugün hava çok güzel.',
    );

    expect(assessText(text)).toEqual(VALID_TURKISH_ASSESSMENT);
  });

  it('marks a file with 3 cues as TOO_SHORT', () => {
    const assessment = assessText(buildSrtText(TURKISH_LINES.slice(0, 3)));

    expect(assessment.isFileValid).toBe(false);
    expect(assessment.fileInvalidReasons).toContain(
      SubtitleFileInvalidReason.TOO_SHORT,
    );
  });

  it('marks a file one cue below the minimum as TOO_SHORT', () => {
    const assessment = assessText(
      buildSrtText(TURKISH_LINES.slice(0, SUBTITLE_CUE_COUNT_MIN - 1)),
    );

    expect(assessment.fileInvalidReasons).toContain(
      SubtitleFileInvalidReason.TOO_SHORT,
    );
  });

  it('accepts a file with exactly the minimum cue count', () => {
    const assessment = assessText(
      buildSrtText(TURKISH_LINES.slice(0, SUBTITLE_CUE_COUNT_MIN)),
    );

    expect(assessment).toEqual(VALID_TURKISH_ASSESSMENT);
  });

  it('marks 60 cues of the same line as REPETITIVE', () => {
    const assessment = assessText(
      buildSrtText(Array(60).fill('Altyazılar bir sonraki sürümde gelecek.')),
    );

    expect(assessment.isFileValid).toBe(false);
    expect(assessment.fileInvalidReasons).toContain(
      SubtitleFileInvalidReason.REPETITIVE,
    );
  });

  it('marks a file where one line fills most cues as REPETITIVE', () => {
    const cueTexts = [
      ...TURKISH_LINES,
      ...Array(40).fill('www.ornek-altyazi-sitesi.com'),
    ];

    expect(assessText(buildSrtText(cueTexts)).fileInvalidReasons).toContain(
      SubtitleFileInvalidReason.REPETITIVE,
    );
  });

  it('marks English text expected in Turkish as WRONG_LANGUAGE', () => {
    const assessment = assessText(readFileFormatFixture('english.srt'));

    expect(assessment).toEqual({
      isFileValid: false,
      fileInvalidReasons: [SubtitleFileInvalidReason.WRONG_LANGUAGE],
      detectedLanguageCode: SubtitleLanguage.ENG,
    });
  });

  it('accepts English text expected in English', () => {
    expect(
      assessText(readFileFormatFixture('english.srt'), SubtitleLanguage.ENG),
    ).toEqual({
      isFileValid: true,
      fileInvalidReasons: [],
      detectedLanguageCode: SubtitleLanguage.ENG,
    });
  });

  it('does not mark WRONG_LANGUAGE when detection is not confident', () => {
    const cueTexts = Array.from(
      {length: 12},
      (_, cueIndex) => `${cueIndex + 1} ♪ ${cueIndex * 7} --`,
    );
    const assessment = assessText(buildSrtText(cueTexts));

    expect(assessment.detectedLanguageCode).toBeNull();
    expect(assessment.fileInvalidReasons).not.toContain(
      SubtitleFileInvalidReason.WRONG_LANGUAGE,
    );
  });

  it('counts no drawing-only ASS event toward the cue minimum', () => {
    const assHeader = readFileFormatFixture('twin.ass').split('Dialogue:')[0];
    const dialogueLines = [
      ...TURKISH_LINES.slice(0, SUBTITLE_CUE_COUNT_MIN - 1).map(
        (cueText, cueIndex) =>
          `Dialogue: 0,0:00:${String(cueIndex * 3 + 1).padStart(2, '0')}.00,0:00:${String(cueIndex * 3 + 3).padStart(2, '0')}.00,Default,,0,0,0,,${cueText}\n`,
      ),
      ...Array.from(
        {length: 50},
        (_, drawingIndex) =>
          `Dialogue: 0,0:01:${String(drawingIndex).padStart(2, '0')}.00,0:01:${String(drawingIndex).padStart(2, '0')}.50,Sign,,0,0,0,,{\\p1}m 0 0 l ${drawingIndex} 0{\\p0}\n`,
      ),
    ];

    expect(
      assessText(assHeader + dialogueLines.join('')).fileInvalidReasons,
    ).toEqual([SubtitleFileInvalidReason.TOO_SHORT]);
  });

  it('does not mark a short file of distinct lines as REPETITIVE', () => {
    expect(
      assessText(buildSrtText(TURKISH_LINES.slice(0, 3))).fileInvalidReasons,
    ).toEqual([SubtitleFileInvalidReason.TOO_SHORT]);
  });

  it('reports only ERROR_PAGE for an HTML page', () => {
    expect(
      assessText('<!DOCTYPE html>\n<html><body>Not found</body></html>\n')
        .fileInvalidReasons,
    ).toEqual([SubtitleFileInvalidReason.ERROR_PAGE]);
  });

  it('accepts Portuguese text expected as Brazilian Portuguese', () => {
    const cueTexts = [
      'Bom dia, o tempo está muito bonito hoje.',
      'Saímos cedo para pegar o trem para a cidade.',
      'O motorista não conhecia o caminho, então nos perdemos.',
      'As crianças cantavam no banco de trás.',
      'Todos ficaram em silêncio quando as luzes acenderam.',
      'Acho que devíamos ter pegado a outra estrada.',
      'Desculpe, esqueci de falar sobre a reunião.',
      'Olhando para trás, tudo parece muito estranho.',
      'Não deixe a porta aberta, o gato vai fugir.',
      'Vamos sair cedo amanhã de manhã.',
      'Quem vai preparar o jantar esta noite?',
      'Tchau, e cuide bem de você.',
    ];
    const assessment = assessText(buildSrtText(cueTexts), SubtitleLanguage.POB);

    expect(assessment.detectedLanguageCode).toBe(SubtitleLanguage.POR);
    expect(assessment.fileInvalidReasons).toEqual([]);
  });

  it('does not mark WRONG_LANGUAGE for an expected language the detector cannot name', () => {
    const cueTexts = [
      'God morgen, været er veldig fint i dag.',
      'Vi dro tidlig for å rekke toget til byen.',
      'Sjåføren visste ikke veien, så vi gikk oss vill.',
      'Barna sang i baksetet hele turen.',
      'Alle ble stille da lysene ble skrudd på.',
      'Jeg tror vi burde ha tatt den andre veien.',
      'Beklager, jeg glemte å fortelle deg om møtet.',
      'Når jeg ser tilbake nå, virker alt veldig rart.',
      'Ikke la døren stå åpen, katten løper ut.',
      'Vi skal dra tidlig i morgen tidlig.',
      'Hvem skal lage middag i kveld?',
      'Ha det bra, og ta godt vare på deg selv.',
    ];

    const assessment = assessText(buildSrtText(cueTexts), SubtitleLanguage.NOR);

    expect(assessment.isFileValid).toBe(true);
    expect(assessment.fileInvalidReasons).toEqual([]);
  });

  it.each([
    ['Altyazı alınamadı:\nKaynak 400: hatalı yol'],
    ['Altyazı alınamadı:\nKaynak 500: Arşiv açılamadı veya bozuk.'],
    ['Seçilen altyazı dosyası sunucuda bulunamadı.'],
  ])('marks a one-cue message SRT as TOO_SHORT only: %s', messageText => {
    expect(
      assessText(`1\n00:00:00,000 --> 00:00:15,000\n${messageText}\n`),
    ).toEqual({
      isFileValid: false,
      fileInvalidReasons: [SubtitleFileInvalidReason.TOO_SHORT],
      detectedLanguageCode: null,
    });
  });

  it.each([
    [
      'Serbian',
      SubtitleLanguage.SRP,
      [
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
      ],
    ],
    [
      'Indonesian',
      SubtitleLanguage.MSA,
      [
        'Selamat pagi, cuaca hari ini sangat indah.',
        'Kami berangkat pagi-pagi untuk naik kereta ke kota.',
        'Sopirnya tidak tahu jalan, jadi kami tersesat.',
        'Anak-anak bernyanyi di kursi belakang.',
        'Semua orang diam ketika lampu menyala.',
        'Saya rasa kita seharusnya lewat jalan lain.',
        'Maaf, saya lupa memberitahumu tentang rapat itu.',
        'Kalau dilihat sekarang, semuanya terasa aneh.',
        'Jangan biarkan pintu terbuka, kucingnya akan lari.',
        'Kita akan berangkat pagi-pagi besok.',
        'Siapa yang akan memasak makan malam nanti?',
        'Selamat tinggal, jaga dirimu baik-baik.',
      ],
    ],
  ])(
    'does not mark %s as WRONG_LANGUAGE against a sibling language',
    (_, expectedLanguageCode, cueTexts) => {
      const assessment = assessText(
        buildSrtText(cueTexts),
        expectedLanguageCode,
      );

      expect(assessment.isFileValid).toBe(true);
      expect(assessment.fileInvalidReasons).toEqual([]);
    },
  );

  describe('Cyrillic Serbian', () => {
    const cyrillicSerbianLines = [
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

    it('is detected as Serbian and accepted for Serbian', () => {
      expect(
        assessText(buildSrtText(cyrillicSerbianLines), SubtitleLanguage.SRP),
      ).toEqual({
        isFileValid: true,
        fileInvalidReasons: [],
        detectedLanguageCode: SubtitleLanguage.SRP,
      });
    });

    it('is marked WRONG_LANGUAGE when Croatian is expected', () => {
      expect(
        assessText(buildSrtText(cyrillicSerbianLines), SubtitleLanguage.HRV)
          .fileInvalidReasons,
      ).toEqual([SubtitleFileInvalidReason.WRONG_LANGUAGE]);
    });
  });

  it('marks text with no subtitle format as UNREADABLE', () => {
    const assessment = assessText(
      'Bu bir altyazı dosyası değil.\nSadece düz bir metin dosyası.\n',
    );

    expect(assessment.isFileValid).toBe(false);
    expect(assessment.fileInvalidReasons).toContain(
      SubtitleFileInvalidReason.UNREADABLE,
    );
  });

  it('marks an SRT-looking file with no cue as UNREADABLE', () => {
    const assessment = assessSubtitleFile({
      parsedSubtitle: {
        subtitleFileFormat: SubtitleFileFormat.SRT,
        cues: [],
        frameRate: null,
        sourceText: '1\n',
      },
      expectedLanguageCode: SubtitleLanguage.TUR,
    });

    expect(assessment.isFileValid).toBe(false);
    expect(assessment.fileInvalidReasons).toContain(
      SubtitleFileInvalidReason.UNREADABLE,
    );
  });
});
