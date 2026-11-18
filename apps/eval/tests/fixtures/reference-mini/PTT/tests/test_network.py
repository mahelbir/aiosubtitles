import pytest


@pytest.mark.parametrize("release_name, expected_network, expected_title", [
    ("Ref.Film.2020.720p.AMZN.WEBRip-GRP", "Amazon", "Ref Film"),
    ("Ref.Other.2020.720p.WEBRip-GRP", None, None),
    ("Ref.Extra.2021.1080p.HULU.WEB-DL-GRP", "Hulu", "Ref Extra"),
])
def test_network(parser, release_name, expected_network, expected_title):
    pass


@pytest.mark.parametrize("release_name, expected_unrated", [
    ("Ref.Film.2020.UNRATED.720p.WEBRip-GRP", True),
])
def test_unrated(parser, release_name, expected_unrated):
    pass


@pytest.mark.parametrize("release_name, expected", [
    ("Ref.Sports.2020.720p.HDTV-GRP", {
        "title": "Ref Sports",
        "year": 2020,
        "quality": "HDTV",
        "group": "GRP",
        "edition": "Anniversary Edition",
    }),
])
def test_sports(parser, release_name, expected):
    pass
