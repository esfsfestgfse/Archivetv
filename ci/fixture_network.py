"""Local-fixture routing shared by deterministic browser checks."""
from urllib.parse import urlsplit


def is_local_fixture_url(url, target):
    request = urlsplit(url)
    fixture = urlsplit(target)
    return (request.scheme, request.netloc.lower()) == (fixture.scheme, fixture.netloc.lower())
