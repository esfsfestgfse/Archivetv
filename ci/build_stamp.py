"""Pure visible-build validation shared by browser CI and its fixture tests."""
import re


def visible_build_matches(runtime_build, visible_build, version_chip):
    if not all(isinstance(value, str) for value in (runtime_build, visible_build, version_chip)):
        return False
    if not runtime_build or visible_build != runtime_build:
        return False
    release = re.match(r"^(\d+(?:\.\d+){0,2}(?:-rc\.[1-9]\d*)?)-(?:desktop|mobile|source-suite)[.-]", runtime_build)
    if not release:
        return False
    if version_chip == "v" + release.group(1):
        return True
    # Old 1.x builds displayed their trailing build counter, such as v159.
    legacy = re.fullmatch(r"1\.\d+\.\d+-(?:desktop|mobile)\.(\d+)", runtime_build)
    return bool(legacy and version_chip == "v" + legacy.group(1))
