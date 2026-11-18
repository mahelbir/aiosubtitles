namespace NzbDrone.Core.Test.ParserTests.ParsingServiceTests
{
    public class NestedFixture : CoreTest
    {
        [TestCase("Ref.Nested.Not.Read.S01E01", "Ref Nested", 1, 1)]
        public void should_parse_single_episode(string postTitle, string title, int seasonNumber, int episodeNumber)
        {
        }
    }
}
