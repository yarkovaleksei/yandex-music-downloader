// Этот process proof проверяет механизм Ctrl+C, но не считается real download.
process.on('SIGINT', () => {
  process.stdout.write(
    JSON.stringify({ kind: 'result', data: { status: 'paused' } }) + '\n',
  );
  process.exitCode = 4;
  clearInterval(timer);
});
let seq = 0;
const timer = setInterval(() => {
  process.stdout.write(
    JSON.stringify({
      event: 'track.progress',
      seq: ++seq,
      trackKey: '1',
      payload: { bytes: 300000 },
    }) + '\n',
  );
}, 100);
