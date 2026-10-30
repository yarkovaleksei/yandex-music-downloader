#!/usr/bin/env python3
"""Собирает самодостаточные архивы платформенной проверки SQLite store.

Архивы:
- music-downloader-platform-check-windows-x64.zip — Node.js 24.21.0 win-x64;
- music-downloader-platform-check-macos.zip — Node.js 24.21.0 darwin-arm64 и darwin-x64.

Node.js скачивается с nodejs.org и сверяется с SHASUMS256.txt. Внутрь кладутся
check.mjs, dist и package.json persistence/shared и транзитивное замыкание runtime
dependencies модулей, которые загружает check.mjs, из установленного node_modules.
Результат — в .cache/platform-check/; копия — параметром --copy-to.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import zipfile
from pathlib import Path

NODE_VERSION = "24.21.0"
NODE_DIST = f"https://nodejs.org/dist/v{NODE_VERSION}"
KIT_DIR = Path(__file__).resolve().parent
PERSISTENCE = KIT_DIR.parent
REPO = PERSISTENCE.parent.parent
CACHE = REPO / ".cache" / "platform-check"
TOP = "music-downloader-platform-check"

# Модули, которые загружает check.mjs (SQLite store и импорт файловых manifest).
ROOT_DEPENDENCIES = ["@music-downloader/shared", "better-sqlite3", "fs-native-extensions"]
# Зависимости только для сборки из исходников: в runtime не загружаются.
BUILD_ONLY = {"node-addon-api", "node-gyp"}

KITS = {
    "windows-x64": {
        "runtimes": [("win-x64", f"node-v{NODE_VERSION}-win-x64.zip", "node.exe")],
        "launcher": "run-windows.cmd",
        # linux-x64 нужен только для самопроверки распакованного архива на Linux.
        "prebuilds": ["win32-x64.node", "linux-x64.node"],
    },
    "macos": {
        "runtimes": [
            ("darwin-arm64", f"node-v{NODE_VERSION}-darwin-arm64.tar.gz", "bin/node"),
            ("darwin-x64", f"node-v{NODE_VERSION}-darwin-x64.tar.gz", "bin/node"),
        ],
        "launcher": "run-macos.command",
        "prebuilds": ["darwin-arm64.node", "darwin-x64.node", "linux-x64.node"],
    },
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(name: str) -> Path:
    target = CACHE / "downloads" / name
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(target.suffix + ".part")
        with urllib.request.urlopen(f"{NODE_DIST}/{name}", timeout=120) as response:
            temporary.write_bytes(response.read())
        temporary.replace(target)
    return target


def verified_runtime(name: str, sums: dict[str, str]) -> Path:
    archive = download(name)
    if sha256_file(archive) != sums.get(name):
        archive.unlink()
        sys.exit(f"FAIL: SHA-256 {name} не совпадает с SHASUMS256.txt")
    return archive


def runtime_files(archive: Path, binary: str) -> dict[str, tuple[bytes, bool]]:
    """Достаёт из официального архива только бинарник node и LICENSE."""
    prefix = archive.name.removesuffix(".tar.gz").removesuffix(".zip")
    wanted = {f"{prefix}/{binary}": (binary, True), f"{prefix}/LICENSE": ("LICENSE", False)}
    found: dict[str, tuple[bytes, bool]] = {}
    if archive.name.endswith(".zip"):
        with zipfile.ZipFile(archive) as source:
            for member, (name, executable) in wanted.items():
                found[name] = (source.read(member), executable)
    else:
        with tarfile.open(archive, "r:gz") as source:
            for member, (name, executable) in wanted.items():
                handle = source.extractfile(member)
                if handle is None:
                    sys.exit(f"FAIL: в {archive.name} нет {member}")
                found[name] = (handle.read(), executable)
    return found


def find_package(name: str, start: Path) -> Path | None:
    """Разрешение как в Node.js: node_modules от каталога пакета вверх до корня репозитория."""
    directory = start
    while True:
        candidate = directory / "node_modules" / name
        if (candidate / "package.json").exists():
            return candidate.resolve()
        if directory == REPO or directory == directory.parent:
            return None
        directory = directory.parent


def resolve_package(name: str, start: Path) -> Path:
    location = find_package(name, start)
    if location is None:
        sys.exit(f"FAIL: зависимость {name} не установлена")
    return location


def dependency_closure() -> dict[str, Path]:
    closure: dict[str, Path] = {}
    pending = [(name, PERSISTENCE) for name in ROOT_DEPENDENCIES]
    while pending:
        name, start = pending.pop()
        if name in closure or name in BUILD_ONLY:
            continue
        location = resolve_package(name, start)
        closure[name] = location
        manifest = json.loads((location / "package.json").read_text("utf-8"))
        for dependency in manifest.get("dependencies", {}):
            pending.append((dependency, location))
        # Необязательные зависимости включаются, только если они установлены.
        for dependency in manifest.get("optionalDependencies", {}):
            if find_package(dependency, location) is not None:
                pending.append((dependency, location))
    return closure


def package_files(name: str, location: Path, prebuilds: list[str]) -> list[tuple[str, Path]]:
    files: list[tuple[str, Path]] = []
    if name == "better-sqlite3":
        # Без build/, src и deps: только lib, package.json и нужные prebuilds.
        files.append(("package.json", location / "package.json"))
        files += [(f"lib/{p.relative_to(location / 'lib').as_posix()}", p) for p in sorted((location / "lib").rglob("*")) if p.is_file()]
        for prebuild in prebuilds:
            files.append((f"prebuilds/{prebuild}", location / "prebuilds" / prebuild))
        return files
    if name.startswith("@music-downloader/"):
        files.append(("package.json", location / "package.json"))
        files += [(f"dist/{p.relative_to(location / 'dist').as_posix()}", p) for p in sorted((location / "dist").rglob("*.js"))]
        return files
    for path in sorted(location.rglob("*")):
        relative = path.relative_to(location)
        if path.is_file() and "node_modules" not in relative.parts:
            files.append((relative.as_posix(), path))
    return files


def dist_files(location: Path) -> list[tuple[str, Path]]:
    return [(p.relative_to(location).as_posix(), p) for p in sorted((location / "dist").rglob("*.js"))]


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=REPO, check=True, capture_output=True, text=True).stdout.strip()


def kit_manifest(build_id: str) -> dict:
    digest = hashlib.sha256()
    for location in (PERSISTENCE, REPO / "packages" / "shared"):
        for relative, path in dist_files(location):
            digest.update(f"{location.name}/{relative}\0".encode())
            digest.update(sha256_file(path).encode())
    return {
        "buildId": build_id,
        "gitHead": git("rev-parse", "HEAD"),
        "treeClean": git("status", "--porcelain") == "",
        "node": NODE_VERSION,
        "sha256": {"dist": digest.hexdigest(), "yarnLock": sha256_file(REPO / "yarn.lock")},
    }


def add(archive: zipfile.ZipFile, name: str, data: bytes, executable: bool = False) -> None:
    info = zipfile.ZipInfo(f"{TOP}/{name}", date_time=(2026, 1, 1, 0, 0, 0))
    info.create_system = 3  # Unix: macOS Archive Utility сохраняет режим файла.
    info.external_attr = (0o100755 if executable else 0o100644) << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    archive.writestr(info, data)


def build_kit(kind: str, spec: dict, sums: dict[str, str], manifest: dict, closure: dict[str, Path]) -> Path:
    output = CACHE / f"music-downloader-platform-check-{kind}.zip"
    temporary = output.with_suffix(".zip.tmp")
    checksum_lines: list[str] = []
    with zipfile.ZipFile(temporary, "w") as archive:
        add(archive, "README.md", (KIT_DIR / "README.md").read_bytes())
        launcher = (KIT_DIR / spec["launcher"]).read_bytes()
        if spec["launcher"].endswith(".cmd"):
            launcher = launcher.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
        add(archive, spec["launcher"], launcher, executable=True)
        for runtime, name, binary in spec["runtimes"]:
            for relative, (data, executable) in runtime_files(verified_runtime(name, sums), binary).items():
                target = f"runtime/{runtime}/{relative}"
                add(archive, target, data, executable)
                if executable:
                    checksum_lines.append(f"{sha256_bytes(data)}  {target}")
        add(archive, "runtime/SHA256SUMS", ("\n".join(checksum_lines) + "\n").encode())
        app = "app/packages/persistence"
        add(archive, f"{app}/package.json", (PERSISTENCE / "package.json").read_bytes())
        for relative, path in dist_files(PERSISTENCE):
            add(archive, f"{app}/{relative}", path.read_bytes())
        add(archive, f"{app}/platform-check/check.mjs", (KIT_DIR / "check.mjs").read_bytes())
        add(archive, f"{app}/platform-check/kit-manifest.json", (json.dumps(manifest, indent=2) + "\n").encode())
        for name, location in sorted(closure.items()):
            for relative, path in package_files(name, location, spec["prebuilds"]):
                add(archive, f"app/node_modules/{name}/{relative}", path.read_bytes())
    temporary.replace(output)
    return output


def self_check(archive: Path, root: Path) -> None:
    """Распаковывает архив вне репозитория и запускает check.mjs локальным Node.js."""
    root.mkdir(parents=True, exist_ok=True)
    directory = Path(tempfile.mkdtemp(prefix=f"{archive.stem}-", dir=root))
    try:
        with zipfile.ZipFile(archive) as source:
            source.extractall(directory)
        kit = directory / TOP
        result = subprocess.run(
            ["node", str(kit / "app/packages/persistence/platform-check/check.mjs"), "--report-dir", str(directory)],
            cwd=directory,
            capture_output=True,
            text=True,
        )
        sys.stdout.write(result.stdout)
        if result.returncode != 0:
            sys.stderr.write(result.stderr)
            sys.exit(f"FAIL: самопроверка {archive.name} не прошла (exit {result.returncode})")
        reports = sorted(directory.glob("report-*.json"))
        print(f"  самопроверка PASS: {', '.join(report.name for report in reports)}")
    finally:
        shutil.rmtree(directory, ignore_errors=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--copy-to", type=Path, help="каталог для копии архивов")
    parser.add_argument("--skip-build", action="store_true", help="не пересобирать dist")
    parser.add_argument(
        "--self-check-root",
        type=Path,
        default=Path(tempfile.gettempdir()),
        help="каталог вне репозитория для распаковки при самопроверке",
    )
    options = parser.parse_args()
    if not options.skip_build:
        subprocess.run(["node", "packages/testing/scripts/run-yarn.mjs", "build"], cwd=REPO, check=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(f"{NODE_DIST}/SHASUMS256.txt", timeout=60) as response:
        sums_text = response.read().decode()
    (CACHE / "downloads").mkdir(parents=True, exist_ok=True)
    (CACHE / "downloads" / "SHASUMS256.txt").write_text(sums_text, "utf-8")
    sums = {line.split()[1]: line.split()[0] for line in sums_text.splitlines() if len(line.split()) == 2}
    if REPO in options.self_check_root.resolve().parents or options.self_check_root.resolve() == REPO:
        sys.exit("FAIL: каталог самопроверки должен быть вне репозитория")
    head = git("rev-parse", "HEAD")
    build_id = f"{dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{head[:12]}"
    manifest = kit_manifest(build_id)
    closure = dependency_closure()
    print(f"build-id: {build_id} (дерево {'чистое' if manifest['treeClean'] else 'с изменениями'})")
    print("зависимости: " + ", ".join(sorted(closure)))
    for kind, spec in KITS.items():
        output = build_kit(kind, spec, sums, manifest, closure)
        print(f"{sha256_file(output)}  {output.name}")
        # Передаётся только архив, прошедший самопроверку распакованного дерева.
        self_check(output, options.self_check_root.resolve())
        if options.copy_to is not None:
            options.copy_to.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(output, options.copy_to / output.name)
            print(f"  скопирован в {options.copy_to}")


if __name__ == "__main__":
    main()
