import {describe, expect, it} from 'vitest';
import {ReleaseSourceFamily} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {parseSonarrCases} from '../../src/parser-test/datasets/sonarr-cases.js';
import {sortNameCases} from './helpers/parsed-fields.js';

const SONARR_FIXTURE = String.raw`using FluentAssertions;
using NUnit.Framework;
using NzbDrone.Core.Test.Framework;

namespace NzbDrone.Core.Test.ParserTests
{
    [TestFixture]
    public class SampleParserFixture : CoreTest
    {
        [TestCase("Series.Title.S03E06.DVDRip.XviD-WiDE", "Series Title", 3, 6)]
        [TestCase(@"Series Title - S02E21 - 94 Meetings - 720p TV.mkv", "Series Title", 2, 21)]
        [TestCase("Series.Title.Inc.S03E19.DVDRip.\"XviD\"-OSiTV", "Series Title Inc", 3, 19)]
        [TestCase("S03E09 WS PDTV XviD FUtV", "", 3, 9)]
        public void should_parse_single_episode(string postTitle, string title, int seasonNumber, int episodeNumber)
        {
            var result = Parser.Parser.ParseTitle(postTitle);
            result.Should().NotBeNull();
        }

        [TestCase("Series.Title.S03E06.DVDRip.XviD-WiDE", "WiDE")]
        [TestCase("Series 2009 S01E14 English HDTV XviD LOL", null)]
        public void should_parse_release_group(string title, string expected)
        {
            Parser.ReleaseGroupParser.ParseReleaseGroup(title).Should().Be(expected);
        }

        [TestCase("Series.Title.S01E05.1080p.WEB-DL.DD5.1.H264-GRP", false)]
        public void should_parse_webdl1080p_quality(string title, bool proper)
        {
            ParseAndVerifyQuality(title, Quality.WEBDL1080p, proper);
        }

        [TestCase("Series.Title.S01E05.Vietnamese.720p.HDTV.x264-GRP")]
        public void should_parse_language_vietnamese(string postTitle)
        {
            var result = LanguageParser.ParseLanguages(postTitle);
        }
    }
}
`;

describe('parseSonarrCases', () => {
  it('reads the fields each test method asserts, normalised and merged per name', () => {
    expect(sortNameCases(parseSonarrCases(SONARR_FIXTURE))).toEqual([
      {
        releaseName: 'S03E09 WS PDTV XviD FUtV',
        expectedFields: {
          releaseTitle: null,
          seasonNumbers: [3],
          episodeNumbers: [9],
        },
      },
      {
        releaseName: 'Series 2009 S01E14 English HDTV XviD LOL',
        expectedFields: {releaseGroup: null},
      },
      {
        releaseName: 'Series Title - S02E21 - 94 Meetings - 720p TV.mkv',
        expectedFields: {
          releaseTitle: 'series title',
          seasonNumbers: [2],
          episodeNumbers: [21],
        },
      },
      {
        releaseName: 'Series.Title.Inc.S03E19.DVDRip."XviD"-OSiTV',
        expectedFields: {
          releaseTitle: 'series title inc',
          seasonNumbers: [3],
          episodeNumbers: [19],
        },
      },
      {
        releaseName: 'Series.Title.S01E05.1080p.WEB-DL.DD5.1.H264-GRP',
        expectedFields: {releaseSourceFamily: ReleaseSourceFamily.WEB},
      },
      {
        releaseName: 'Series.Title.S03E06.DVDRip.XviD-WiDE',
        expectedFields: {
          releaseTitle: 'series title',
          seasonNumbers: [3],
          episodeNumbers: [6],
          releaseGroup: 'wide',
        },
      },
    ]);
  });

  it('drops a test method that asserts none of the eight fields', () => {
    expect(
      parseSonarrCases(SONARR_FIXTURE)?.map(nameCase => nameCase.releaseName),
    ).not.toContain('Series.Title.S01E05.Vietnamese.720p.HDTV.x264-GRP');
    expect(parseSonarrCases(SONARR_FIXTURE)).toHaveLength(6);
  });

  it('reads an expected null group as asserted absence', () => {
    expect(
      parseSonarrCases(SONARR_FIXTURE)?.find(
        nameCase =>
          nameCase.releaseName === 'Series 2009 S01E14 English HDTV XviD LOL',
      )?.expectedFields,
    ).toEqual({releaseGroup: null});
  });
});
