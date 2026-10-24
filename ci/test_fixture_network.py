import unittest
from fixture_network import is_local_fixture_url


class FixtureNetworkTests(unittest.TestCase):
    def test_actual_local_assets_are_allowed(self):
        self.assertTrue(is_local_fixture_url("http://localhost:8800/assets/player.js?v=1", "http://localhost:8800/app.html"))
        self.assertTrue(is_local_fixture_url("http://127.0.0.1:8799/style.css", "http://127.0.0.1:8799/app.html"))

    def test_external_url_cannot_escape_mock_via_its_origin_query(self):
        self.assertFalse(is_local_fixture_url("https://www.youtube-nocookie.com/embed/?origin=http%3A%2F%2Flocalhost%3A8800", "http://localhost:8800/app.html"))
        self.assertFalse(is_local_fixture_url("https://video.example/?return=http://127.0.0.1:8799", "http://127.0.0.1:8799/app.html"))

    def test_other_hosts_ports_and_schemes_are_external(self):
        for url in ["http://localhost.evil.test:8800/", "http://localhost@video.example/", "http://localhost:9999/", "https://localhost:8800/"]:
            self.assertFalse(is_local_fixture_url(url, "http://localhost:8800/app.html"), url)


if __name__ == "__main__":
    unittest.main()
