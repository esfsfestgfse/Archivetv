"""Version label fixtures need no Playwright, network, or app startup."""
import unittest
import ast
import re
from pathlib import Path
from build_stamp import visible_build_matches


class VisibleBuildTests(unittest.TestCase):
    def test_real_dashboard_gate_admits_rc_but_rejects_malformed_builds(self):
        source = Path(__file__).resolve().parents[1] / 'scripts' / 'test-telemetry-dashboard.py'
        tree = ast.parse(source.read_text(encoding='utf-8'))
        gate = next(node for node in ast.walk(tree) if isinstance(node, ast.Assert)
                    and any(isinstance(child, ast.Name) and child.id == 'build' for child in ast.walk(node.test)))
        expression = compile(ast.Expression(body=gate.test), str(source), 'eval')
        for build, allowed in [
            ('6.0.0-rc.1-desktop-v6-guide', True),
            ('5.6.32-mobile-v6-guide-preview', True),
            ('6.0.0-rc.bad-desktop-v6-guide', False),
            ('5.anything', False), ('', False),
        ]:
            with self.subTest(build=build):
                self.assertEqual(bool(eval(expression, {'re': re, 'build': build})), allowed)

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
