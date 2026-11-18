import {describe, expect, it} from 'vitest';
import {
  ReleaseEdition,
  ReleaseSourceFamily,
} from '../../src/constants/subtitle-core-enums.js';
import {tokenizeReleaseName} from '../../src/release-name/name-tokens.js';
import {parseReleaseName} from '../../src/release-name/parse-release-name.js';
import {inferReleaseSourceFamilyFromAudio} from '../../src/release-name/release-source-family.js';
import {findHardRejectReason} from '../../src/scoring/find-hard-reject.js';
import {
  makeCandidate,
  makeReleaseInfo,
  makeVideo,
} from '../helpers/factories.js';

const EPISODE_NAME = 'The.Show.S01E02.1080p.NF.WEB-DL.DDP5.1.H.264-NTb';
const MOVIE_NAME = 'Movie.Name.2019.EXTENDED.1080p.BluRay.x264-SPARKS';

describe('parseReleaseName', () => {
  describe('scene names', () => {
    it('reads every field of a WEB episode name', () => {
      expect(parseReleaseName(EPISODE_NAME)).toEqual(
        makeReleaseInfo({
          releaseTitle: 'The Show',
          seasonNumbers: [1],
          episodeNumbers: [2],
          releaseGroup: 'NTb',
          releaseSourceFamily: ReleaseSourceFamily.WEB,
          streamingService: 'NF',
          resolutionHeight: 1080,
          audioTags: ['DDP5.1'],
          nameTokens: tokenizeReleaseName(EPISODE_NAME),
        }),
      );
    });

    it('reads every field of a BluRay movie name', () => {
      expect(parseReleaseName(MOVIE_NAME)).toEqual(
        makeReleaseInfo({
          releaseTitle: 'Movie Name',
          releaseYear: 2019,
          releaseGroup: 'SPARKS',
          releaseSourceFamily: ReleaseSourceFamily.BLURAY,
          releaseEdition: ReleaseEdition.EXTENDED,
          resolutionHeight: 1080,
          nameTokens: tokenizeReleaseName(MOVIE_NAME),
        }),
      );
    });

    it('marks a BluRay remux', () => {
      expect(
        parseReleaseName(
          'Movie.Name.2019.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-FGT',
        ),
      ).toMatchObject({
        releaseSourceFamily: ReleaseSourceFamily.BLURAY,
        isRemux: true,
        releaseGroup: 'FGT',
      });
    });

    it('emits the audio tag as found so the source hint reads its start', () => {
      const releaseInfo = parseReleaseName(EPISODE_NAME);
      expect(releaseInfo).toMatchObject({audioTags: ['DDP5.1']});
      expect(inferReleaseSourceFamilyFromAudio(releaseInfo.audioTags)).toBe(
        ReleaseSourceFamily.WEB,
      );
    });

    it('gives no source family for a CAM name', () => {
      expect(parseReleaseName('Movie.2010.CAM.x264-GRP')).toMatchObject({
        releaseSourceFamily: null,
        releaseYear: 2010,
        releaseGroup: 'GRP',
      });
    });

    it.each([
      [
        'Movie.2019.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-FGT',
        ['DTS-HD.MA.5.1'],
        ReleaseSourceFamily.BLURAY,
      ],
      [
        'Show.S01E01.2160p.NF.WEB-DL.DDP5.1.Atmos.H.265-GRP',
        ['DDP5.1', 'Atmos'],
        ReleaseSourceFamily.WEB,
      ],
      [
        'Movie.2019.2160p.UHD.BluRay.x265.TrueHD.7.1.Atmos-GRP',
        ['TrueHD.7.1', 'Atmos'],
        ReleaseSourceFamily.BLURAY,
      ],
      [
        'Show.S01E01.1080p.WEB.DD+5.1.x264-GRP',
        ['DD+5.1'],
        ReleaseSourceFamily.WEB,
      ],
      [
        'Show.S01E01.720p.WEB.E-AC-3.x264-GRP',
        ['E-AC-3'],
        ReleaseSourceFamily.WEB,
      ],
    ])(
      'keeps the audio tags of %s as found',
      (releaseName, audioTags, sourceFamily) => {
        const releaseInfo = parseReleaseName(releaseName);
        expect(releaseInfo.audioTags).toEqual(audioTags);
        expect(inferReleaseSourceFamilyFromAudio(releaseInfo.audioTags)).toBe(
          sourceFamily,
        );
      },
    );

    it('maps a streaming service name to its code', () => {
      expect(
        parseReleaseName('The.Show.S02E03E04.720p.AMZN.WEBRip.x264-GRP'),
      ).toMatchObject({
        streamingService: 'AMZN',
        seasonNumbers: [2],
        episodeNumbers: [3, 4],
        resolutionHeight: 720,
      });
    });
  });

  describe('season packs', () => {
    it('reads a season without an episode as a pack', () => {
      expect(parseReleaseName('Show.S01.1080p.WEB-DL-GRP')).toMatchObject({
        seasonNumbers: [1],
        episodeNumbers: [],
        isSeasonPack: true,
      });
    });

    it('expands an episode range and reads it as a pack', () => {
      expect(parseReleaseName('Show.S01E01-E10.720p.HDTV')).toMatchObject({
        seasonNumbers: [1],
        episodeNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        isSeasonPack: true,
        releaseSourceFamily: ReleaseSourceFamily.HDTV,
      });
    });

    it('reads Season N as a pack', () => {
      expect(parseReleaseName('Show.Season.2.1080p.WEB-DL-GRP')).toMatchObject({
        seasonNumbers: [2],
        isSeasonPack: true,
      });
    });

    it('reads a Turkish N.Sezon.Paket name as a pack', () => {
      expect(parseReleaseName('Dizi.1.Sezon.Paket')).toMatchObject({
        isSeasonPack: true,
      });
    });

    it('reads the season number of a Turkish N.Sezon name', () => {
      expect(parseReleaseName('Dizi.1.Sezon.Paket')).toMatchObject({
        seasonNumbers: [1],
      });
    });

    it('keeps the pack words out of a Turkish pack title', () => {
      expect(parseReleaseName('Dizi.1.Sezon.Paket')).toMatchObject({
        releaseTitle: 'Dizi',
      });
    });

    it('reads a PAKET token as a pack', () => {
      expect(parseReleaseName('Dizi.S01.PAKET.1080p')).toMatchObject({
        seasonNumbers: [1],
        isSeasonPack: true,
      });
    });

    it('reads a site pack as a pack whatever the name says', () => {
      expect(
        parseReleaseName('Show.S01E01.1080p.WEB-DL-GRP', {isSitePack: true}),
      ).toMatchObject({
        seasonNumbers: [1],
        episodeNumbers: [1],
        isSeasonPack: true,
      });
    });

    it('reads a double episode as no pack', () => {
      expect(
        parseReleaseName('The.Show.S02E03E04.720p.AMZN.WEBRip.x264-GRP'),
      ).toMatchObject({episodeNumbers: [3, 4], isSeasonPack: false});
    });

    it('expands an episode range without a second E but reads no pack', () => {
      expect(parseReleaseName('Show.S01E01-03.720p.HDTV-GRP')).toMatchObject({
        episodeNumbers: [1, 2, 3],
        isSeasonPack: false,
      });
    });

    it.each([
      'Show - S01E05 - 12 Angry Men.mkv',
      'Show.S01E05.-.100.Days.720p.WEB-DL-GRP',
      'Show.S01E05-2023.1080p.WEB-DL-GRP',
      'Show.S01E05 - 2.Bölüm.srt',
    ])('reads %s as a single episode, not a pack', releaseName => {
      expect(parseReleaseName(releaseName)).toMatchObject({
        seasonNumbers: [1],
        episodeNumbers: [5],
        isSeasonPack: false,
      });
    });

    it('reads a complete series as a pack outside the title', () => {
      expect(parseReleaseName('Show.Complete.Series.720p')).toMatchObject({
        releaseTitle: 'Show',
        isSeasonPack: true,
      });
    });

    it('reads Complete after a season marker as a pack', () => {
      expect(parseReleaseName('Show.S01.Complete.1080p')).toMatchObject({
        releaseTitle: 'Show',
        seasonNumbers: [1],
        isSeasonPack: true,
      });
    });

    it('reads a Turkish N.Sezon M.Bölüm name as an episode', () => {
      expect(
        parseReleaseName('Dizi.Adı.2.Sezon.5.Bölüm.1080p.WEB-DL'),
      ).toMatchObject({
        releaseTitle: 'Dizi Adı',
        seasonNumbers: [2],
        episodeNumbers: [5],
        isSeasonPack: false,
        releaseSourceFamily: ReleaseSourceFamily.WEB,
      });
    });

    it('reads an upper-case Turkish season pack without diacritics', () => {
      expect(parseReleaseName('DIZI.3.SEZON.720p.WEB-DL')).toMatchObject({
        releaseTitle: 'DIZI',
        seasonNumbers: [3],
        episodeNumbers: [],
        isSeasonPack: true,
      });
    });

    it('reads a single episode as no pack', () => {
      expect(parseReleaseName('Show.S01E01.1080p.WEB-DL-GRP')).toMatchObject({
        seasonNumbers: [1],
        episodeNumbers: [1],
        isSeasonPack: false,
      });
    });
  });

  describe('other fields', () => {
    it('reads a CD part number', () => {
      expect(parseReleaseName('Movie.2010.CD1.DVDRip.XviD-GRP')).toMatchObject({
        partNumber: 1,
        releaseYear: 2010,
        releaseSourceFamily: ReleaseSourceFamily.DVD,
      });
    });

    it('reads no part number from a Part word in the title', () => {
      expect(
        parseReleaseName(
          'Harry.Potter.and.the.Deathly.Hallows.Part.1.2010.1080p.BluRay.x264-GRP',
        ),
      ).toMatchObject({partNumber: null, releaseYear: 2010});
    });

    it('gives no title for a name that starts with its episode', () => {
      expect(parseReleaseName('S01E01.1080p.WEB-DL-GRP')).toMatchObject({
        releaseTitle: null,
        seasonNumbers: [1],
        episodeNumbers: [1],
      });
    });

    it('reads a whole frame rate', () => {
      expect(
        parseReleaseName('Show.S01E01.2160p.WEB-DL.60fps.x265-GRP'),
      ).toMatchObject({frameRate: 60});
    });

    it('reads the resolution height of a 4K name', () => {
      expect(parseReleaseName('Movie.2019.4K.WEB-DL.x265-GRP')).toMatchObject({
        resolutionHeight: 2160,
      });
    });

    it('reads a frame rate set off by a dot', () => {
      expect(
        parseReleaseName('Movie.2010.1080p.BluRay.23.976.fps.x264-GRP'),
      ).toMatchObject({frameRate: 23.976});
    });

    it.each([
      ['Show.S01E01.1080p.BLUTV.WEB-DL-GRP', 'BLU'],
      ['Kizil.Goncalar.S01E05.1080p.BLUTV.WEB-DL.AAC2.0.H.264-GRP', 'BLU'],
      ['Dizi.S01E01.1080p.EXXEN.WEB-DL-GRP', 'EXXEN'],
      ['Dizi.S01E01.1080p.GAIN.WEB-DL-GRP', 'GAIN'],
      ['Dizi.S01E01.1080p.TOD.WEB-DL-GRP', 'TOD'],
      ['Dizi.S01E01.1080p.TABII.WEB-DL-GRP', 'TABII'],
      ['Kizil.Goncalar.S01E01.1080p.BLUTV.WEB-DL-GRP', 'BLU'],
      ['Show.S01E01.NF.WEB-DL.1080p-GRP', 'NF'],
      ['Show.S01E01.1080p.EXXEN.WEB-DL-GRP', 'EXXEN'],
      ['Dizi.S01E01.EXXEN.WEB-DL-GRP', 'EXXEN'],
    ])('reads the service of %s from its tags', (releaseName, serviceCode) => {
      expect(parseReleaseName(releaseName)).toMatchObject({
        streamingService: serviceCode,
      });
    });

    it.each([
      'No.Pain.No.Gain.2005.1080p.WEB-DL',
      'Mad.Max.Fury.Road.2015.1080p.BluRay.x264-GRP',
      'Show.S01E01.1080p.WEB-DL-RED',
      'Movie.2019.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-FGT',
      'Some.Show.Called.BluTV',
      'Show - S01E05 - Red Wedding.mkv',
      'Show.S01E01.Red.Wedding.1080p.WEB-DL-GRP',
      'Show.S01E01.Free.Fall.720p.HDTV-GRP',
      'Show.S02E03.Free.Fall.1080p.WEB-DL-GRP',
      'Show.S01E01.Now.What.1080p.WEB-DL-GRP',
      'Show.S01E02.Max.1080p.WEB-DL-GRP',
      'Show.S01E04.Play.Dead.720p.HDTV-GRP',
      'Movie.2019.Sky.High.1080p',
      'Dizi.1.Sezon.3.Bölüm.Gain.1080p',
      'Movie.2010.1080p.BluRay.x264-RED',
    ])('reads no service from the title or group of %s', releaseName => {
      expect(parseReleaseName(releaseName)).toMatchObject({
        streamingService: null,
      });
    });

    it('reads a fractional frame rate exactly', () => {
      expect(
        parseReleaseName('Movie.2010.1080p.BluRay.23.976fps.x264-GRP'),
      ).toMatchObject({frameRate: 23.976});
    });

    it('keeps Turkish letters in the title', () => {
      expect(parseReleaseName('Dizi.Adı.S02E05.1080p.WEB-DL')).toMatchObject({
        releaseTitle: 'Dizi Adı',
        seasonNumbers: [2],
        episodeNumbers: [5],
      });
    });

    it.each([
      EPISODE_NAME,
      'Show.S01E01.mkv',
      'Dizi.Adı.S02E05.1080p.WEB-DL',
      'Movie.2010.CD1.DVDRip.XviD-GRP.srt',
    ])('gives the tokenizer tokens as the name tokens of %s', releaseName => {
      expect(parseReleaseName(releaseName)).toMatchObject({
        nameTokens: tokenizeReleaseName(releaseName),
      });
    });
  });

  describe('meaningless names', () => {
    it.each([
      '3f2b8c1e-9a4d-4e7b-b1c2-5d6e7f8a9b0c.mkv',
      '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12',
      'video.mkv',
      'index.m3u8?token=abc',
    ])('gives only empty fields for %s', releaseName => {
      expect(parseReleaseName(releaseName)).toEqual(
        makeReleaseInfo({isMeaningless: true}),
      );
    });

    it('keeps a meaningless name empty even for a site pack', () => {
      expect(parseReleaseName('video.mkv', {isSitePack: true})).toEqual(
        makeReleaseInfo({isMeaningless: true}),
      );
    });

    it('reads a name with a question mark in its title as meaningful', () => {
      expect(parseReleaseName('What.If...?.S01E01.1080p.WEB-DL')).toMatchObject(
        {isMeaningless: false, seasonNumbers: [1], episodeNumbers: [1]},
      );
    });

    it.each([
      ['Face/Off.1997.1080p.BluRay.x264-GRP', 'Face/Off', 1997],
      ['Fahrenheit 9/11 2004', 'Fahrenheit 9/11', 2004],
      ['Fahrenheit.9/11.2004.1080p.BluRay.x264-GRP', 'Fahrenheit 9/11', 2004],
    ])(
      'keeps the slash title of %s',
      (releaseName, releaseTitle, releaseYear) => {
        expect(parseReleaseName(releaseName)).toMatchObject({
          isMeaningless: false,
          releaseTitle,
          releaseYear,
        });
      },
    );

    it('keeps a slash-title candidate for its dotted video name', () => {
      expect(
        findHardRejectReason({
          candidate: makeCandidate(),
          candidateReleases: [
            parseReleaseName('Face/Off.1997.1080p.BluRay.x264-GRP'),
          ],
          video: makeVideo({
            videoRelease: parseReleaseName(
              'Face.Off.1997.1080p.BluRay.x264-OTHER.mkv',
            ),
          }),
        }),
      ).toBeNull();
    });

    it('reduces a name with a leading slash to its last segment', () => {
      expect(
        parseReleaseName('/files/Show.S01E01.1080p.WEB-DL.mkv'),
      ).toMatchObject({releaseTitle: 'Show', episodeNumbers: [1]});
    });

    it('reads the last path segment of a URL name', () => {
      expect(
        parseReleaseName(
          'https://cdn.example.com/files/Show.S01E01.1080p.WEB-DL.mkv?token=abc',
        ),
      ).toMatchObject({
        isMeaningless: false,
        releaseTitle: 'Show',
        seasonNumbers: [1],
        episodeNumbers: [1],
        nameTokens: tokenizeReleaseName('Show.S01E01.1080p.WEB-DL.mkv'),
      });
    });

    it.each(['video (2).mkv', 'https://example.com/stream/master.m3u8'])(
      'gives only empty fields for %s',
      releaseName => {
        expect(parseReleaseName(releaseName)).toEqual(
          makeReleaseInfo({isMeaningless: true}),
        );
      },
    );

    it('reads Show.S01E01.mkv as meaningful', () => {
      expect(parseReleaseName('Show.S01E01.mkv')).toMatchObject({
        isMeaningless: false,
        releaseTitle: 'Show',
        seasonNumbers: [1],
        episodeNumbers: [1],
      });
    });
  });
});
