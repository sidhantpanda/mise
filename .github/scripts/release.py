"""Dependency-free release notes shared by GitHub Releases and CHANGELOG.md."""

import argparse
from pathlib import Path
import re
import subprocess

# SemVer 2.0.0, with an optional v prefix. Numeric prerelease identifiers cannot
# have leading zeroes; build metadata may. Keep the capture for prerelease state.
NUMBER = r"(?:0|[1-9][0-9]*)"
IDENTIFIER = rf"(?:{NUMBER}|[0-9]*[A-Za-z-][0-9A-Za-z-]*)"
SEMVER = re.compile(
    rf"v?{NUMBER}\.{NUMBER}\.{NUMBER}"
    rf"(?:-({IDENTIFIER}(?:\.{IDENTIFIER})*))?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
)
MARKER = "<!-- releases -->"


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def notes(tag, repository):
    if not SEMVER.fullmatch(tag):
        raise ValueError(f"Not a SemVer tag: {tag}")
    ref = f"refs/tags/{tag}"
    # Find the nearest reachable version tag, ignoring this tag and aliases on
    # the same commit. Unrelated tags and tags on other branches are excluded.
    commit = git("rev-parse", f"{ref}^{{commit}}")
    candidates = [
        other
        for other in git("tag", "--merged", ref).splitlines()
        if SEMVER.fullmatch(other)
        and git("rev-parse", f"refs/tags/{other}^{{commit}}") != commit
    ]
    previous = None
    if candidates:
        args = ["describe", "--tags", "--abbrev=0"]
        for candidate in candidates:
            args.extend(["--match", candidate])
        previous = git(*args, ref)
    revision = f"refs/tags/{previous}..{ref}" if previous else ref
    changes = git("log", "--no-merges", "--format=%H%x09%s", revision)
    url = f"https://github.com/{repository}"
    date = git("show", "-s", "--format=%cs", f"{ref}^{{commit}}")
    lines = [f"## [{tag}]({url}/releases/tag/{tag}) - {date}", "", "### Changes", ""]
    for change in changes.splitlines():
        sha, subject = change.split("\t", 1)
        if subject.startswith("docs: update changelog for "):
            continue
        # Escape Markdown syntax in commit subjects.
        subject = re.sub(r"([\\`*_{}\[\]<>])", r"\\\1", subject)
        lines.append(f"- {subject} ([{sha[:7]}]({url}/commit/{sha}))")
    if lines[-1] == "":
        lines.append("- No code changes since the previous release.")
    compare = f"{url}/compare/{previous}...{tag}" if previous else f"{url}/commits/{tag}"
    lines.extend(["", f"[Full changelog]({compare})", ""])
    return "\n".join(lines)


def update_changelog(path, section):
    content = path.read_text()
    if MARKER not in content:
        raise ValueError(f"Missing {MARKER} in {path}")
    heading = section.splitlines()[0]
    # Reruns must not duplicate or rewrite an already recorded release.
    if heading in content.splitlines():
        return
    path.write_text(content.replace(MARKER, f"{MARKER}\n\n{section.rstrip()}", 1))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    validate = commands.add_parser("validate")
    validate.add_argument("tag")
    generate = commands.add_parser("notes")
    generate.add_argument("tag")
    generate.add_argument("repository")
    generate.add_argument("output", type=Path)
    update = commands.add_parser("update")
    update.add_argument("changelog", type=Path)
    update.add_argument("notes", type=Path)
    args = parser.parse_args()
    if args.command == "validate":
        match = SEMVER.fullmatch(args.tag)
        print(f"valid={str(bool(match)).lower()}")
        print(f"prerelease={str(bool(match and match.group(1))).lower()}")
    elif args.command == "notes":
        args.output.write_text(notes(args.tag, args.repository))
    else:
        update_changelog(args.changelog, args.notes.read_text())
