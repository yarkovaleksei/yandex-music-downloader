#!/usr/bin/env python3
"""Комплект macOS: неизменённые исходники и официальные переносимые Node runtime."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tarfile
import urllib.request
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED

directory = Path(__file__).resolve().parent
root = directory.parents[2]
shared = root / 'docs/research/step-027-acceptance'
version = '24.21.0'
checksums = {
    'arm64': 'bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057',
    'x64': '1462cb3b3046b815cf8ea436d3da450ec1a9f11dac7e5a46b0ada5305d7e8097',
}


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        while block := stream.read(1024 * 1024):
            result.update(block)
    return result.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--replace', action='store_true')
    args = parser.parse_args()
    output = root / 'STEP-027-macos.zip'
    if output.exists() and not args.replace:
        raise ValueError('ARCHIVE_EXISTS_USE_REPLACE')
    config = json.loads((shared / 'config.json').read_text())
    if any(config['sources'].values()):
        raise ValueError('ARCHIVE_MUST_HAVE_EMPTY_SOURCE_LINKS')
    source = hashlib.sha256()
    for name in sorted(config['sourceFiles']):
        source.update((name + '\0').encode())
        source.update(bytes.fromhex(digest(root / name)))
    if 'sha256:' + source.hexdigest() != config['expectedSourceDigest']:
        raise ValueError('SOURCE_SUBJECT_MISMATCH')

    cache = root / '.cache/checks/step-027-macos-runtime'
    cache.mkdir(parents=True, exist_ok=True)
    base = f'https://nodejs.org/dist/v{version}/'
    sums = urllib.request.urlopen(base + 'SHASUMS256.txt', timeout=60).read()
    official = dict(line.split()[::-1] for line in sums.decode().splitlines())
    runtimes = []
    for arch, expected in checksums.items():
        name = f'node-v{version}-darwin-{arch}.tar.gz'
        if official.get(name) != expected:
            raise ValueError('OFFICIAL_CHECKSUM_MISMATCH')
        path = cache / name
        if not path.exists() or digest(path) != expected:
            pending = cache / (name + '.download')
            with urllib.request.urlopen(base + name, timeout=120) as response, pending.open('wb') as target:
                while block := response.read(1024 * 1024):
                    target.write(block)
            if digest(pending) != expected:
                raise ValueError('RUNTIME_CHECKSUM_MISMATCH')
            pending.replace(path)
        prefix = name[:-7]
        # Архивы не перепаковываются: права, symlinks, подпись Mach-O и лицензии сохраняются.
        with tarfile.open(path, 'r:gz') as archive:
            node = archive.getmember(prefix + '/bin/node')
            corepack = archive.getmember(prefix + '/lib/node_modules/corepack/dist/corepack.js')
            if not node.isfile() or not node.mode & 0o111 or not corepack.isfile():
                raise ValueError('RUNTIME_LAYOUT_INVALID')
            archive.getmember(prefix + '/LICENSE')
            node_hash = hashlib.sha256(archive.extractfile(node).read()).hexdigest()
        if expected not in (directory / 'START_MACOS.command').read_text():
            raise ValueError('LAUNCHER_CHECKSUM_MISMATCH')
        runtimes.append({'architecture': arch, 'file': name, 'sha256': expected,
                         'nodeSha256': node_hash, 'url': base + name})

    extras = ['.gitignore', '.nvmrc', '.prettierignore', '.prettierrc.json',
              'eslint.config.d.mts', 'docs/development.md', 'docs/brand/icon.png']
    helpers = [str(p.relative_to(root)) for p in shared.iterdir()
               if p.is_file() and p.suffix in {'.mjs', '.ps1', '.json', '.md', '.py'}]
    names = sorted(set(config['sourceFiles'] + extras + helpers))
    manifest = {'schema': 1, 'step': 'STEP-027', 'nodeVersion': version,
                'minimumMacOS': '13.5', 'sourceDigest': config['expectedSourceDigest'],
                'sourceFileCount': len(config['sourceFiles']), 'runtimes': runtimes,
                'launcherSha256': digest(directory / 'START_MACOS.command')}
    pending_zip = root / '.cache/checks/STEP-027-macos.build.zip'
    prefix = 'music-downloader-macos/'
    with ZipFile(pending_zip, 'w', ZIP_DEFLATED) as archive:
        for name in names:
            archive.write(root / name, prefix + name)
        archive.write(directory / 'START_MACOS.command', prefix + 'START_MACOS.command')
        archive.write(directory / 'ИНСТРУКЦИЯ.txt', prefix + 'ИНСТРУКЦИЯ.txt')
        archive.writestr(prefix + 'BUNDLE.json', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
        archive.writestr(prefix + 'runtimes/SHASUMS256.txt', sums)
        for runtime in runtimes:
            archive.write(cache / runtime['file'], prefix + 'runtimes/' + runtime['file'], compress_type=ZIP_STORED)
    os.replace(pending_zip, output)
    print(json.dumps({'archive': str(output), 'bytes': output.stat().st_size,
                      'sha256': digest(output), 'sourceDigest': config['expectedSourceDigest'],
                      'runtimes': runtimes}, ensure_ascii=False))


if __name__ == '__main__':
    main()
