"""Version label fixtures need no Playwright, network, or app startup."""
import unittest
from build_stamp import visible_build_matches


class VisibleBuildTests(unittest.TestCase):
    def test_rc_and_stable_chips_match_the_runtime(self):
        for build, chip in [
            ("6.0.0-rc.1-desktop-v6-guide", "v6.0.0-rc.1"),
            ("6.0.0-rc.1-mobile-v6-guide", "v6.0.0-rc.1"),
            ("5.6.32-desktop-v6-guide-preview", "v5.6.32"),
            ("6.0.0-mobile-retro-cable", "v6.0.0"),
            ("1.7.7-desktop.159", "v159"),
        ]:
            with self.subTest(build=build):
                self.assertTrue(visible_build_matches(build, build, chip))

    def test_stale_final_or_malformed_chips_are_not_accepted(self):
        build = "6.0.0-rc.1-desktop-v6-guide"
        for chip in ["v6.0.0", "v5.6.32", "v6.0.0-rc.bad", "v6.0.0-rc.0", "", None]:
            with self.subTest(chip=chip):
                self.assertFalse(visible_build_matches(build, build, chip))
        self.assertFalse(visible_build_matches(build, "5.6.32-desktop-old", "v6.0.0-rc.1"))
        self.assertFalse(visible_build_matches("", "", "v159"))


if __name__ == "__main__":
    unittest.main()
