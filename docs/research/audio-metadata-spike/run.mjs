import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

// Одноразовый spike STEP-020: зависимости и полные файлы изолированы от packages.
// @link ../audio-metadata-spike.md описывает происхождение образцов и границы выводов.
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.env.AUDIO_SPIKE_ROOT ?? '.harness/local/audio-metadata-spike');
const corpus = join(root, 'corpus');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const matrix = [
  { id: 'mp3', container: 'mp3', codec: 'mp3', mime: 'audio/mpeg', format: 'MPEG', args: ['-c:a', 'libmp3lame', '-b:a', '192k', '-f', 'mp3'] },
  { id: 'aac-mp4', container: 'mp4', codec: 'aac', mime: 'audio/mp4', format: 'isom/iso2/mp41', args: ['-c:a', 'aac', '-b:a', '128k', '-f', 'mp4'] },
  { id: 'flac-mp4', container: 'mp4', codec: 'flac', mime: 'audio/mp4', format: 'isom/iso2/mp41', args: ['-c:a', 'flac', '-strict', 'experimental', '-f', 'mp4'] },
];
const metadata = {
  title: 'Песня — Ёж и море', artists: ['Первый артист', 'Второй артист'],
  album: 'Исходный альбом', albumArtist: 'Автор альбома', track: 3, disc: 2, year: 2024,
};
const playlist = 'Название плейлиста';
const expectedArtist = metadata.artists.join('; ');

function exec(binary, args, options = {}) {
  const result = spawnSync(binary, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${binary}: ${result.stderr}`);
  return result.stdout;
}

async function loadDependencies() {
  const base = join(root, 'node_modules');
  const { TagLib } = await import(pathToFileURL(join(base, 'taglib-wasm/dist/index.js')));
  const { parseBuffer } = await import(pathToFileURL(join(base, 'music-metadata/lib/index.js')));
  const { default: nodeID3 } = await import(pathToFileURL(join(base, 'node-id3/index.js')));
  const taglib = await TagLib.initialize({ forceWasmType: 'emscripten' });
  return { taglib, parseBuffer, nodeID3 };
}

// Сравниваем именно аудиобайты: MP3 без ID3 либо payload всех mdat в MP4.
// Это доказывает отсутствие перекодирования, не заменяя production validation STEP-023.
function audioPayload(bytes, container, nodeID3) {
  if (container === 'mp3') {
    const withoutV2 = nodeID3.removeTagsFromBuffer(Buffer.from(bytes));
    return withoutV2.toString('ascii', withoutV2.length - 128, withoutV2.length - 125) === 'TAG'
      ? withoutV2.subarray(0, -128) : withoutV2;
  }
  const chunks = [];
  for (let offset = 0; offset < bytes.length;) {
    let size = bytes.readUInt32BE(offset);
    let header = 8;
    if (size === 1) { size = Number(bytes.readBigUInt64BE(offset + 8)); header = 16; }
    if (size === 0) size = bytes.length - offset;
    assert.ok(size >= header && offset + size <= bytes.length, 'Повреждённый MP4 box');
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'mdat') chunks.push(bytes.subarray(offset + header, offset + size));
    offset += size;
  }
  assert.ok(chunks.length > 0, 'Нет mdat');
  return Buffer.concat(chunks);
}

async function writeTags(candidate, path, container, fields, cover, deps) {
  assert.ok(['mp3', 'mp4'].includes(container), 'Неподдерживаемый explicit container');
  const input = await readFile(path);
  if (candidate === 'node-id3') {
    assert.equal(container, 'mp3', 'node-id3 поддерживает только ID3/MP3');
    const output = deps.nodeID3.write({
      title: fields.title, artist: expectedArtist, album: fields.album,
      performerInfo: fields.albumArtist, trackNumber: String(fields.track),
      partOfSet: String(fields.disc), year: String(fields.year),
      ...(fields.genre ? { genre: fields.genre } : {}),
      image: { mime: 'image/png', type: { id: 3 }, description: 'Обложка', imageBuffer: cover },
    }, input);
    assert.ok(Buffer.isBuffer(output));
    await writeFile(path, output);
    return;
  }
  // У TagLib нет force-format: контейнер caller проверяется по распознанным bytes.
  // Buffer API исключает зависимость от суффикса .part и сохраняет явный контракт adapter.
  const file = await deps.taglib.open(input);
  try {
    assert.equal(file.getFormat(), container === 'mp3' ? 'MP3' : 'MP4');
    file.setProperties({ TITLE: [fields.title], ARTIST: [expectedArtist], ALBUM: [fields.album],
      ALBUMARTIST: [fields.albumArtist], TRACKNUMBER: [String(fields.track)],
      DISCNUMBER: [String(fields.disc)], DATE: [String(fields.year)],
      ...(fields.genre ? { GENRE: [fields.genre] } : {}),
    });
    file.setPictures([{ mimeType: 'image/png', data: cover, type: 'FrontCover', description: 'Обложка' }]);
    assert.equal(file.save(), true);
    await writeFile(path, file.getFileBuffer());
  } finally { file.dispose(); }
}

async function compare(candidate, sample, genre, deps) {
  const source = await readFile(join(corpus, sample.id));
  const cover = await readFile(join(corpus, 'cover.png'));
  const initialCover = await readFile(join(corpus, 'initial-cover.png'));
  const before = await deps.parseBuffer(source, { mimeType: sample.mime }, { duration: true });
  assert.equal(hash(before.common.picture[0].data), hash(initialCover));
  const path = join(root, `${candidate}-${sample.id}-${genre ? 'genre' : 'absent'}.part`);
  await writeFile(path, source);
  const fields = { ...metadata, ...(genre ? { genre: 'Электроника' } : {}) };
  await writeTags(candidate, path, sample.container, fields, cover, deps);
  const output = await readFile(path);
  const after = await deps.parseBuffer(output, { mimeType: sample.mime }, { duration: true });
  const tags = after.common;
  assert.equal(tags.title, fields.title);
  assert.equal(tags.artist, expectedArtist);
  assert.equal(tags.album, fields.album);
  assert.notEqual(tags.album, playlist);
  assert.equal(tags.albumartist, fields.albumArtist);
  assert.equal(tags.track.no, fields.track);
  assert.equal(tags.disk.no, fields.disc);
  assert.equal(tags.year, fields.year);
  if (genre) assert.deepEqual(tags.genre, ['Электроника']);
  else assert.ok(tags.genre === undefined || tags.genre.length === 0);
  assert.equal(tags.picture.length, 1);
  assert.equal(hash(tags.picture[0].data), hash(cover));
  assert.equal(after.format.container, sample.format);
  assert.equal(after.format.codec, before.format.codec);
  assert.ok(Number.isFinite(after.format.duration) && after.format.duration > 0);
  assert.equal(after.format.duration, before.format.duration);
  const audioHash = hash(audioPayload(source, sample.container, deps.nodeID3));
  assert.equal(hash(audioPayload(output, sample.container, deps.nodeID3)), audioHash);
  return { candidate, sample: sample.id, optionalGenre: genre ? 'present' : 'absent', status: 'PASS',
    tags: { title: tags.title, artist: tags.artist, album: tags.album, albumArtist: tags.albumartist,
      track: tags.track.no, disc: tags.disk.no, year: tags.year, genre: tags.genre ?? [] },
    artworkSha256: hash(tags.picture[0].data), audioSha256: audioHash,
    container: after.format.container, codec: after.format.codec, durationSeconds: after.format.duration,
    bytesBefore: source.length, bytesAfter: output.length };
}

async function worker() {
  // Permission Model запрещает child_process, включая абсолютные пути; PATH пуст.
  // Никакие FFmpeg discovery variables не передаются. WASM и независимый reader локальны.
  assert.equal(process.env.PATH, '');
  for (const binary of ['ffmpeg', 'ffprobe', '/usr/bin/ffmpeg', '/usr/bin/ffprobe']) {
    assert.throws(() => spawnSync(binary, ['-version']), { code: 'ERR_ACCESS_DENIED' });
  }
  const deps = await loadDependencies();
  const rows = [];
  for (const candidate of ['taglib-wasm', 'node-id3']) {
    for (const sample of matrix) {
      if (candidate === 'node-id3' && sample.container !== 'mp3') {
        rows.push({ candidate, sample: sample.id, status: 'UNSUPPORTED', reason: 'Нет MP4 writer' });
        continue;
      }
      for (const genre of [true, false]) rows.push(await compare(candidate, sample, genre, deps));
    }
  }
  // Проверяем достижимую ошибку caller: неверный explicit container отклонён до записи.
  const mismatch = join(root, 'mismatch.part');
  const mp3 = await readFile(join(corpus, 'mp3'));
  await writeFile(mismatch, mp3);
  await assert.rejects(writeTags('taglib-wasm', mismatch, 'mp4', metadata,
    await readFile(join(corpus, 'cover.png')), deps));
  assert.equal(hash(await readFile(mismatch)), hash(mp3));
  console.log(JSON.stringify({ rows, taglibVersion: deps.taglib.version(),
    noExternalProcesses: true, explicitContainerMismatchRejected: true }));
}

async function prepare() {
  await mkdir(corpus, { recursive: true });
  await copyFile(join(here, 'dependencies.json'), join(root, 'package.json'));
  await copyFile(join(here, 'dependencies.lock.json'), join(root, 'package-lock.json'));
  exec('npm', ['ci', '--prefix', root, '--cache', join(root, 'npm-cache'), '--ignore-scripts', '--no-audit', '--no-fund']);
  const ffmpegVersion = exec('ffmpeg', ['-version']).split('\n')[0];
  // Полные файлы синтезированы локально: никаких provider URL, токенов или чужого контента.
  for (const [name, color] of [['cover.png', 'blue'], ['initial-cover.png', 'red']]) {
    exec('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=32x32:d=0.1`,
      '-frames:v', '1', '-threads', '1', join(corpus, name)]);
  }
  const provenance = [];
  for (const sample of matrix) {
    const raw = join(corpus, `${sample.id}-raw`);
    const generationArgs = ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=2',
      '-threads', '1', ...sample.args, raw];
    exec('ffmpeg', generationArgs);
    const inputFormat = sample.container === 'mp3' ? 'mp3' : 'mov';
    exec('ffmpeg', ['-v', 'error', '-y', '-f', inputFormat, '-i', raw, '-i', join(corpus, 'initial-cover.png'),
      '-map', '0:a:0', '-map', '1:v:0', '-c', 'copy', '-disposition:v', 'attached_pic',
      '-metadata', 'album=Исходный альбом', ...(sample.codec === 'flac' ? ['-strict', 'experimental'] : []),
      '-f', sample.container, join(corpus, sample.id)]);
    const bytes = await readFile(join(corpus, sample.id));
    const probe = JSON.parse(exec('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', join(corpus, sample.id)]));
    const stream = probe.streams.find((item) => item.codec_type === 'audio');
    assert.equal(stream.codec_name, sample.codec);
    provenance.push({ id: sample.id, origin: 'Локальная синусоида 440 Hz, 2 s, 44100 Hz; полные файлы',
      providerTransportEvidence: false, sha256: hash(bytes), bytes: bytes.length,
      generationArgs: generationArgs.slice(0, -1), codec: stream.codec_name, format: probe.format.format_name,
      durationSeconds: Number(probe.format.duration) });
  }
  await writeFile(join(corpus, 'provenance.json'), JSON.stringify({ ffmpegVersion, samples: provenance }, null, 2));
}

async function main() {
  if (process.argv.includes('--worker')) return worker();
  if (process.argv.includes('--prepare')) await prepare();
  assert.ok(existsSync(join(corpus, 'provenance.json')), 'Сначала запустите --prepare');
  const env = { PATH: '', AUDIO_SPIKE_ROOT: root };
  const raw = exec(process.execPath, ['--permission', '--allow-fs-read=*', `--allow-fs-write=${root}`,
    fileURLToPath(import.meta.url), '--worker'], { env });
  const result = JSON.parse(raw);
  const provenance = JSON.parse(await readFile(join(corpus, 'provenance.json'), 'utf8'));
  for (const sample of provenance.samples) {
    assert.equal(hash(await readFile(join(corpus, sample.id))), sample.sha256);
  }
  // Полное декодирование — дополнительное исследовательское proof при prepare.
  // --verify повторяет baseline без FFmpeg: reader + тождественность аудиобайтов.
  const decoding = [];
  if (process.argv.includes('--prepare')) {
    for (const row of result.rows.filter((item) => item.status === 'PASS')) {
      const name = `${row.candidate}-${row.sample}-${row.optionalGenre === 'present' ? 'genre' : 'absent'}.part`;
      const pcmHash = (path) => hash(exec('ffmpeg', ['-v', 'error', '-i', path, '-map', '0:a:0',
        '-f', 's16le', '-acodec', 'pcm_s16le', '-'], { encoding: 'buffer' }));
      const before = pcmHash(join(corpus, row.sample));
      assert.equal(pcmHash(join(root, name)), before);
      decoding.push({ candidate: row.candidate, sample: row.sample, optionalGenre: row.optionalGenre,
        status: 'PASS', decodedPcmSha256: before });
    }
    const dependencies = {};
    for (const name of ['taglib-wasm', 'node-id3', 'music-metadata']) {
      const pkg = JSON.parse(await readFile(join(root, 'node_modules', name, 'package.json'), 'utf8'));
      dependencies[name] = { version: pkg.version, license: pkg.license, engines: pkg.engines ?? null };
    }
    const diskBytes = async (path) => { const { readdir } = await import('node:fs/promises');
      let total = 0; for (const entry of await readdir(path, { withFileTypes: true })) {
        const child = join(path, entry.name); total += entry.isDirectory() ? await diskBytes(child) : (await stat(child)).size;
      } return total; };
    await writeFile(join(here, 'results.json'), JSON.stringify({ schemaVersion: 1, environment: {
      node: process.version, platform: process.platform, arch: process.arch }, dependencies,
      installedDependencyBytes: await diskBytes(join(root, 'node_modules')), provenance, ...result, decoding }, null, 2) + '\n');
  } else {
    const recorded = JSON.parse(await readFile(join(here, 'results.json'), 'utf8'));
    assert.deepEqual(result.rows, recorded.rows, 'Результаты расходятся с сохранённой матрицей');
    assert.equal(result.taglibVersion, recorded.taglibVersion);
    assert.deepEqual(provenance, recorded.provenance);
  }
  console.log(`PASS: ${result.rows.filter((row) => row.status === 'PASS').length} round-trip; MP3/AAC-MP4/FLAC-MP4; FFmpeg/ffprobe недоступны worker`);
}

await main();
