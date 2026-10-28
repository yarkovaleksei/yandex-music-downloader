#!/usr/bin/env python3
"""Собирает переносимые evidence-наборы STEP-030: исходники, зависимости и точные runtimes."""
import argparse
import datetime
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import tarfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / '.cache' / 'desktop-platform-check'
DOWNLOADS = CACHE / 'downloads'
ELECTRON = '45.0.0'
NODE = '24.21.0'
TARGETS = [('win32', 'x64', 'win-x64', 'zip'), ('darwin', 'arm64', 'darwin-arm64', 'tar.gz'), ('darwin', 'x64', 'darwin-x64', 'tar.gz'), ('linux', 'x64', 'linux-x64', 'tar.xz')]
OMIT = {'node_modules', 'dist', 'build', '.git', '.cache', '.yarn', 'evidence', '__pycache__'}

def sha(data): return hashlib.sha256(data).hexdigest()
def fetch(url, filename):
    target = DOWNLOADS / filename
    if not target.exists():
        # Повторно используем только runtime-архив; SHA-256 ниже сверяется с release manifest.
        candidates = list((Path.home() / '.cache' / 'electron').glob('*/' + filename)) if filename.startswith('electron-') else [ROOT / '.cache' / 'platform-check' / 'downloads' / filename]
        cached = next((file for file in candidates if file.is_file()), None)
        if cached is not None:
            target.write_bytes(cached.read_bytes())
        else:
            print('Загрузка ' + filename, flush=True)
            with urllib.request.urlopen(url, timeout=90) as response:
                temporary = target.with_suffix(target.suffix + '.part')
                with temporary.open('wb') as output:
                    while chunk := response.read(1024 * 1024): output.write(chunk)
                temporary.replace(target)
    return target

def sums(text): return {line.split()[-1].lstrip('*'): line.split()[0] for line in text.splitlines() if len(line.split()) >= 2}
def add(z, name, data, mode=0o644):
    info = zipfile.ZipInfo('music-downloader-desktop-check/' + name, date_time=(2026, 1, 1, 0, 0, 0))
    info.create_system = 3; info.external_attr = (stat.S_IFREG | mode) << 16; info.compress_type = zipfile.ZIP_DEFLATED
    z.writestr(info, data)

def sources():
    for folder in ['apps', 'packages']:
        for directory, dirs, files in os.walk(ROOT / folder):
            dirs[:] = sorted(d for d in dirs if d not in OMIT)
            for name in sorted(files):
                file = Path(directory) / name
                if name.startswith('.env') or name.endswith(('.log', '.tsbuildinfo')): continue
                yield file.relative_to(ROOT).as_posix(), file
    for name in ['package.json', 'tsconfig.json', 'tsconfig.base.json', 'tsconfig.tests.json', 'yarn.lock']:
        yield name, ROOT / name

def dependencies():
    for directory, dirs, files in os.walk(ROOT / 'node_modules', followlinks=False):
        dirs[:] = sorted(d for d in dirs if d not in {'.bin', '.cache'} and not (Path(directory) / d).is_symlink() and not ((Path(directory) / d) == ROOT / 'node_modules/electron/dist'))
        for name in sorted(files):
            file = Path(directory) / name
            if file.is_symlink() or name.endswith(('.map', '.md', '.tsbuildinfo')): continue
            yield file.relative_to(ROOT).as_posix(), file

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', action='append', choices=[f'{platform}-{arch}' for platform, arch, _, _ in TARGETS], help='Собрать только выбранные цели; по умолчанию все.')
    options = parser.parse_args()
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    node_sums = sums(urllib.request.urlopen(f'https://nodejs.org/dist/v{NODE}/SHASUMS256.txt', timeout=60).read().decode())
    electron_base = f'https://github.com/electron/electron/releases/download/v{ELECTRON}/'
    electron_sums = sums(urllib.request.urlopen(electron_base + 'SHASUMS256.txt', timeout=60).read().decode())
    source_files = list(sources()); dependency_files = list(dependencies())
    source_digest = hashlib.sha256()
    for relative, file in source_files: source_digest.update(relative.encode()); source_digest.update(file.read_bytes())
    identity = {'schema': 1, 'buildId': datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'), 'sourceHash': source_digest.hexdigest(), 'electron': ELECTRON, 'node': NODE}
    for platform, arch, node_target, extension in TARGETS:
        if options.target and f'{platform}-{arch}' not in options.target: continue
        runtime_name = f'node-v{NODE}-{node_target}.{extension}'
        node_archive = fetch(f'https://nodejs.org/dist/v{NODE}/{runtime_name}', runtime_name)
        if sha(node_archive.read_bytes()) != node_sums[runtime_name]: raise RuntimeError('Не совпал hash Node.js')
        electron_name = f'electron-v{ELECTRON}-{platform}-{arch}.zip'
        electron_archive = fetch(electron_base + electron_name, electron_name)
        if sha(electron_archive.read_bytes()) != electron_sums[electron_name]: raise RuntimeError('Не совпал hash Electron')
        output = CACHE / f'music-downloader-desktop-check-{platform}-{arch}.zip'
        with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=3) as z:
            for relative, file in source_files + dependency_files:
                if relative == 'node_modules/electron/path.txt': continue
                add(z, 'project/' + relative, file.read_bytes(), stat.S_IMODE(file.stat().st_mode))
            with zipfile.ZipFile(electron_archive) as source:
                for entry in source.infolist():
                    if entry.is_dir(): continue
                    entry.filename = 'music-downloader-desktop-check/project/node_modules/electron/dist/' + entry.filename
                    z.writestr(entry, source.read(entry.filename.split('/dist/', 1)[1]))
            binary = 'node.exe' if platform == 'win32' else 'node'
            if extension == 'zip':
                with zipfile.ZipFile(node_archive) as source: node_data = source.read(f'node-v{NODE}-{node_target}/node.exe')
            else:
                with tarfile.open(node_archive) as source: node_data = source.extractfile(f'node-v{NODE}-{node_target}/bin/node').read()
            add(z, 'runtime/' + binary, node_data, 0o755)
            electron_path = 'electron.exe' if platform == 'win32' else ('Electron.app/Contents/MacOS/Electron' if platform == 'darwin' else 'electron')
            add(z, 'project/node_modules/electron/path.txt', electron_path.encode())
            add(z, 'kit-manifest.json', (json.dumps({**identity, 'platform': platform, 'arch': arch}, indent=2) + '\n').encode())
            if platform == 'win32':
                launcher = '@echo off\r\ncd /d "%~dp0"\r\nruntime\\node.exe project\\apps\\desktop\\scripts\\setup-links.mjs\r\nruntime\\node.exe project\\apps\\desktop\\scripts\\check.mjs "%~dp0reports"\r\npause\r\n'
                add(z, 'run-windows.cmd', launcher.encode())
            else:
                launcher = '#!/bin/sh\nset -eu\ncd "$(dirname "$0")"\n' + ('xattr -dr com.apple.quarantine . 2>/dev/null || true\n' if platform == 'darwin' else '') + './runtime/node project/apps/desktop/scripts/setup-links.mjs\n./runtime/node project/apps/desktop/scripts/check.mjs "$PWD/reports"\n'
                add(z, 'run-macos.command' if platform == 'darwin' else 'run-linux.sh', launcher.encode(), 0o755)
            add(z, 'README.txt', ('Распакуйте набор на локальный диск и запустите run-*. Установка Node.js/Yarn и сеть не нужны.\nНа Mac x64 под Rosetta запускайте launcher через arch -x86_64.\nНужен рабочий защищённый системный keyring; probe использует отдельную временную запись.\nПришлите reports/report-*.json и window.png. Реальную авторизацию/повторный запуск/выход проверьте отдельно в обычном приложении: node runtime и project/apps/desktop/scripts/start.mjs.\n').encode())
        print(sha(output.read_bytes()), output.name, flush=True)
    (CACHE / 'kit-manifest.json').write_text(json.dumps(identity, indent=2) + '\n')

if __name__ == '__main__': main()
