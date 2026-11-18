namespace NzbDrone.Core.Test.ParserTests
{
    public class SeasonParserFixture : CoreTest
    {
        [TestCase("Ref.Series.S01.720p.HDTV-GRP", "Ref Series", 1)]
        //[TestCase("Ref.Commented.S02.720p.HDTV-GRP", "Ref Commented", 2)]
        public void should_parse_full_season_release(string postTitle, string title, int season)
        {
        }

        [TestCase("Ref.Series.S01-S03.720p.HDTV-GRP", "Ref Series", new[] { 1, 2, 3 })]
        public void should_parse_multi_season_release(string postTitle, string title, int[] expectedSeasons)
        {
        }

        [TestCase("Ref.Series.S02E03E04.720p.HDTV-GRP", "Ref Series", 2, new int[] { 3, 4 })]
        public void should_parse_multiple_episodes(string postTitle, string title, int season, int[] episodes)
        {
        }

        [TestCase("Ref Series 2010 S01E01", "Ref Series", 2010)]
        [TestCase("Ref Series S01E01", "Ref Series")]
        public void should_parse_series_title_info(string postTitle, string titleWithoutYear, int year = 0)
        {
        }

        [TestCase("Ref.Mini.Part.3.720p.HDTV-GRP", "Ref Mini", 3)]
        public void should_parse_mini_series_episode(string postTitle, string title, int episodeNumber)
        {
        }

        [TestCase("Ref.Series.S01E01.720p.BluRay.REMUX-GRP", false)]
        public void should_parse_bluray1080p_remux_quality(string title, bool proper)
        {
        }

        [TestCase("Ref.Series.S01E01.PDTV-GRP", false)]
        public void should_parse_sdtv_quality(string title, bool proper)
        {
        }

        [TestCase("Ref.Series.S01E01.DVDRip-GRP", false)]
        public void should_parse_dvd_quality(string title, bool proper)
        {
        }

        [TestCase(@"C:\Test\Ref.Series.S01E01.720p.HDTV-GRP\abc123.mkv", "Ref Series", Quality.HDTV720p, "GRP")]
        public void should_properly_parse_hashed_releases(string path, string title, Quality quality, string releaseGroup)
        {
        }

        [TestCase("Ref.Series.S01E01.720p.HDTV-GRP", "Ref Series", 1, 1)]
        [TestCase("Ref.Series.S01E01.720p.HDTV-GRP", "Ref Series Other", 1, 1)]
        public void should_parse_single_episode(string postTitle, string title, int seasonNumber, int episodeNumber)
        {
        }
    }
}
