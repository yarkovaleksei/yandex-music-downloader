#!/usr/bin/env python3
"""Архив приёмки содержит allowlist исходников и инструментарий, без credentials/dist."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

directory = Path(__file__).resolve().parent
root = directory.parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--output', default=str(root / 'STEP-052-acceptance.zip'))
parser.add_argument('--replace', action='store_true')
args = parser.parse_args()
config = json.loads((directory / 'config.json').read_text())
assert all(not value for value in config['sources'].values()), 'ARCHIVE_MUST_HAVE_EMPTY_SOURCE_LINKS'
hasher = hashlib.sha256()
for name in sorted(config['sourceFiles']):
    hasher.update((name + '\0').encode())
    hasher.update(hashlib.sha256((root / name).read_bytes()).digest())
assert 'sha256:' + hasher.hexdigest() == config['expectedSourceDigest'], 'SOURCE_SUBJECT_MISMATCH'
# Корневые policy/docs нужны существующим toolchain tests; Git/история/секреты не нужны.
extras = ['.gitignore', '.nvmrc', '.prettierignore', '.prettierrc.json', 'eslint.config.d.mts', 'docs/development.md', 'docs/brand/icon.png']
helpers = [str(p.relative_to(root)).replace('\\', '/') for p in directory.iterdir() if p.is_file() and p.suffix in ['.mjs', '.ps1', '.json', '.md', '.py', '.cmd', '.command']]
names = sorted(set(config['sourceFiles'] + extras + helpers))

def write_archive(output, entries, prefix):
    output = Path(output).resolve()
    assert output.name in {'STEP-052-acceptance.zip', 'STEP-052-update.zip'}, 'ARCHIVE_NAME_INVALID'
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists() and not args.replace:
        raise AssertionError('ARCHIVE_EXISTS_USE_REPLACE')
    with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
        for name in entries:
            archive.write(root / name, prefix + name)
    return {'archive': str(output), 'bytes': output.stat().st_size, 'files': len(entries), 'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}

full = write_archive(args.output, names, 'music-downloader-acceptance/')
# Короткое обновление не переносит config.json: ссылки проверяющего остаются локальными.
update_allowed = {
    '.gitignore', 'vitest.config.ts', 'eslint/boundaries.test.ts', 'eslint/consistency.test.ts',
    'packages/application/src/application.integration.test.ts', 'packages/core/filesystem/src/m3u8.ts',
    'packages/core/filesystem/src/m3u8.test.ts', 'docs/research/step-027-acceptance/README.md',
    'docs/research/step-027-acceptance/run.mjs', 'docs/research/step-027-acceptance/run.test.mjs',
    'docs/research/step-027-acceptance/package.py', 'docs/research/step-027-acceptance/apply-update.mjs',
    'docs/research/step-027-acceptance/subject.json',
    'docs/research/step-027-acceptance/windows-cli.ps1',
}
update = write_archive(root / 'STEP-052-update.zip', sorted(update_allowed), '')
print(json.dumps({**full, 'sourceDigest': config['expectedSourceDigest'], 'update': update}))
