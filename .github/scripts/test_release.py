import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from release import SEMVER, notes, update_changelog


class ReleaseTests(unittest.TestCase):
    def test_semver(self):
        for tag in ['v1.2.3', '0.0.0', 'v1.0.0-rc.1', '1.2.3+build.01', 'v1.0.0-1a']:
            with self.subTest(tag=tag):
                self.assertIsNotNone(SEMVER.fullmatch(tag))
        for tag in ['v1', 'v1.2', 'v01.2.3', 'v1.2.3-01', 'v1.2.3-', 'v1.2.3+']:
            with self.subTest(tag=tag):
                self.assertIsNone(SEMVER.fullmatch(tag))

    def test_history_and_idempotent_changelog(self):
        original = Path.cwd()
        with tempfile.TemporaryDirectory() as directory:
            os.chdir(directory)
            try:
                def git(*args):
                    return subprocess.check_output(['git', *args], text=True, stderr=subprocess.PIPE)

                git('init', '-b', 'main')
                git('config', 'user.name', 'Test')
                git('config', 'user.email', 'test@example.com')
                git('commit', '--allow-empty', '-m', 'Initial feature')
                git('tag', '-a', '1.0.0', '-m', 'First release')
                first = notes('1.0.0', 'example/mise')
                self.assertEqual(first, '')

                git('commit', '--allow-empty', '-m', 'docs: update changelog for v1.0.0')
                git('commit', '--allow-empty', '-m', 'Fix [recipe] rendering')
                git('tag', 'unrelated')
                git('tag', 'v1.1.0-rc.1')
                git('tag', '1.1.0-rc.1')  # Alias on the same commit.
                second = notes('v1.1.0-rc.1', 'example/mise')
                self.assertIn(r'Fix \[recipe\] rendering', second)
                self.assertNotIn('Initial feature', second)
                self.assertNotIn('docs: update changelog', second)
                self.assertIn('/compare/1.0.0...v1.1.0-rc.1', second)

                path = Path('CHANGELOG.md')
                path.write_text('# Changelog\n\n<!-- releases -->\n')
                baseline = path.read_text()
                update_changelog(path, first)
                self.assertEqual(path.read_text(), baseline)
                update_changelog(path, second)
                expected = path.read_text()
                update_changelog(path, second)
                self.assertEqual(path.read_text(), expected)
                self.assertIn('## [v1.1.0-rc.1]', expected)
                self.assertNotIn('## [1.0.0]', expected)
                path.write_text('# Missing marker\n')
                with self.assertRaises(ValueError):
                    update_changelog(path, second)
            finally:
                os.chdir(original)


if __name__ == '__main__':
    unittest.main()
