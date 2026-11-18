import pytest


@pytest.mark.parametrize("release_name, expected_group", [
    ("Ref.Not.A.Test.File.2020-GRP", "GRP"),
])
def test_not_read(parser, release_name, expected_group):
    pass
