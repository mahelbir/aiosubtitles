import {describe, expect, it} from 'vitest';
import {
  ReleaseEdition,
  ReleaseSourceFamily,
} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {
  parseGoPttCases,
  parsePttCases,
} from '../../src/parser-test/datasets/ptt-cases.js';
import {buildParsedFields, sortNameCases} from './helpers/parsed-fields.js';

const PTT_FIXTURE = String.raw`import pytest

from PTT.handlers import add_defaults
from PTT.parse import Parser


@pytest.fixture
def parser():
    p = Parser()
    add_defaults(p)
    return p


@pytest.mark.parametrize("release_name, expected_group", [
    ("The.Expanse.S05E02.1080p.AMZN.WEB.DDP5.1.x264-NTb[eztv.re].mp4", "NTb"),
    ('Single.Quoted.S01E02.720p.HDTV-GRP', 'GRP'),
    ("Power (2014) - S02E03", None),  # no group here
])
def test_group_detection(parser, release_name, expected_group):
    result = parser.parse(release_name)
    if expected_group:
        assert result.get("group") == expected_group
    else:
        assert "group" not in result


# @pytest.mark.parametrize("release_name, expected", [
#     ("Commented.Out.Name.2020.1080p", {"title": "Commented Out Name"}),
# ])
# def test_commented(parser, release_name, expected):
#     assert parser.parse(release_name) == expected


@pytest.mark.parametrize("release_name, expected_year, expect_year_presence", [
    ("Dawn.of.the.Planet.of.the.Apes.2014.HDRip.XViD-EVO", 2014, True),
    ("Show Name S01E01", None, False),
])
def test_year_detection(parser, release_name, expected_year, expect_year_presence):
    result = parser.parse(release_name)


@pytest.mark.parametrize("release_name, expected_output", [
    ("sons.of.anarchy.s05e10.480p.BluRay.x264-GAnGSteR", {
        "title": "sons of anarchy",
        "resolution": "480p",
        "seasons": [5],
        "episodes": [10],
        "quality": "BluRay",
        "codec": "avc",
        "group": "GAnGSteR",
        "languages": []
    }),
    ("Movie.Name.Unrated.BRRip.x264", {
        "title": "Movie Name",
        "unrated": True,
        "languages": [],
        "quality": "BRRip",
        "codec": "avc",
        "seasons": [],
        "episodes": []
    }),
    ("Movie.Name.2019.Extended.1080p.NF.WEB-DL.x264-GRP", {
        "title": "Movie Name",
        "year": 2019,
        "edition": "Extended Edition",
        "network": "Netflix",
        "resolution": "1080p",
        "quality": "WEB-DL",
        "codec": "avc",
        "group": "GRP",
        "languages": [],
        "seasons": [],
        "episodes": []
    }),
])
def test_random_releases_parse(parser, release_name, expected_output):
    assert parser.parse(release_name) == expected_output
`;

const GO_PTT_FIXTURE = String.raw`package ptt

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGroup(t *testing.T) {
	for _, tc := range []struct {
		name   string
		ttitle string
		group  string
	}{
		{"HD2", "Nocturnal Animals 2016 VFF 1080p BluRay DTS HEVC-HD2", "HD2"},
		{"no group", "Power (2014) - S02E03", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			result := Parse(tc.ttitle)
			assert.Equal(t, tc.group, result.Group)
		})
	}
}

func TestSeasons(t *testing.T) {
	for _, tc := range []struct {
		name    string
		ttitle  string
		seasons []int
	}{
		{"regular season", "The Simpsons S28E21 720p HDTV x264-AVS", []int{28}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			result := Parse(tc.ttitle)
			assert.Equal(t, tc.seasons, result.Seasons)
		})
	}
}

func TestPTT(t *testing.T) {
	for _, tc := range []struct {
		ttitle string
		result Result
	}{
		{"Some.girls.1998.DVDRip", Result{
			Title:   "Some girls",
			Quality: "DVDRip",
			Year:    "1998",
		}},
	} {
		t.Run(tc.ttitle, func(t *testing.T) {
			assert.Equal(t, &tc.result, Parse(tc.ttitle))
		})
	}
}
`;

describe('parsePttCases', () => {
  it('reads every parametrized case, normalised', () => {
    expect(sortNameCases(parsePttCases(PTT_FIXTURE))).toEqual([
      {
        releaseName: 'Dawn.of.the.Planet.of.the.Apes.2014.HDRip.XViD-EVO',
        expectedFields: {releaseYear: 2014},
      },
      {
        releaseName: 'Movie.Name.2019.Extended.1080p.NF.WEB-DL.x264-GRP',
        expectedFields: buildParsedFields({
          releaseGroup: 'grp',
          releaseSourceFamily: ReleaseSourceFamily.WEB,
          streamingService: 'NF',
          releaseEdition: ReleaseEdition.EXTENDED,
          releaseTitle: 'movie name',
          releaseYear: 2019,
        }),
      },
      {
        releaseName: 'Movie.Name.Unrated.BRRip.x264',
        expectedFields: buildParsedFields({
          releaseSourceFamily: ReleaseSourceFamily.BLURAY,
          releaseEdition: ReleaseEdition.UNRATED,
          releaseTitle: 'movie name',
        }),
      },
      {
        releaseName: 'Power (2014) - S02E03',
        expectedFields: {releaseGroup: null},
      },
      {
        releaseName: 'Show Name S01E01',
        expectedFields: {releaseYear: null},
      },
      {
        releaseName: 'Single.Quoted.S01E02.720p.HDTV-GRP',
        expectedFields: {releaseGroup: 'grp'},
      },
      {
        releaseName:
          'The.Expanse.S05E02.1080p.AMZN.WEB.DDP5.1.x264-NTb[eztv.re].mp4',
        expectedFields: {releaseGroup: 'ntb'},
      },
      {
        releaseName: 'sons.of.anarchy.s05e10.480p.BluRay.x264-GAnGSteR',
        expectedFields: buildParsedFields({
          releaseGroup: 'gangster',
          releaseSourceFamily: ReleaseSourceFamily.BLURAY,
          seasonNumbers: [5],
          episodeNumbers: [10],
          releaseTitle: 'sons of anarchy',
        }),
      },
    ]);
  });

  it('skips a commented-out parametrize block', () => {
    expect(
      parsePttCases(PTT_FIXTURE)?.map(nameCase => nameCase.releaseName),
    ).not.toContain('Commented.Out.Name.2020.1080p');
    expect(parsePttCases(PTT_FIXTURE)).toHaveLength(8);
  });

  it('asserts all eight fields for a whole expected result', () => {
    const nameCase = parsePttCases(PTT_FIXTURE)?.find(
      entry =>
        entry.releaseName ===
        'sons.of.anarchy.s05e10.480p.BluRay.x264-GAnGSteR',
    );
    expect(nameCase?.expectedFields).toMatchObject({
      streamingService: null,
      releaseEdition: null,
      releaseYear: null,
    });
  });
});

describe('parseGoPttCases', () => {
  it('reads every table case by its ttitle column, normalised', () => {
    expect(sortNameCases(parseGoPttCases(GO_PTT_FIXTURE))).toEqual([
      {
        releaseName: 'Nocturnal Animals 2016 VFF 1080p BluRay DTS HEVC-HD2',
        expectedFields: {releaseGroup: 'hd2'},
      },
      {
        releaseName: 'Power (2014) - S02E03',
        expectedFields: {releaseGroup: null},
      },
      {
        releaseName: 'Some.girls.1998.DVDRip',
        expectedFields: buildParsedFields({
          releaseSourceFamily: ReleaseSourceFamily.DVD,
          releaseTitle: 'some girls',
          releaseYear: 1998,
        }),
      },
      {
        releaseName: 'The Simpsons S28E21 720p HDTV x264-AVS',
        expectedFields: {seasonNumbers: [28]},
      },
    ]);
  });

  it('never takes the name column for the release name', () => {
    expect(
      parseGoPttCases(GO_PTT_FIXTURE)?.map(nameCase => nameCase.releaseName),
    ).not.toContain('HD2');
  });
});
