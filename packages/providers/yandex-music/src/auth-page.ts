export interface ChallengeTiming {
  readonly deadline: number;
  readonly duration: number;
}

/** Динамические строки экранируются только в HTML; скрипт читает код из textContent.
 * Страница не получает credentials и не определяет успех по закрытию сервера.
 * @link ../../../../planning/tasks/STEP-041.md
 */
export function renderAuthPage(
  userCode: string,
  verificationUrl: string,
  path: string,
  timing: ChallengeTiming,
): string {
  const iconPath = escapeHtml(`${path}/icon.png`);
  const hostname = escapeHtml(new URL(verificationUrl).hostname);
  const info = symbol('info');
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>Вход в Яндекс Музыку · Yandex Music Downloader</title>
  <link rel="icon" type="image/png" href="${iconPath}">
  <style>${styles}</style>
</head>
<body>
  <header class="header">
    <div class="header-inner">
      <div class="brand">
        <img class="brand-icon" src="${iconPath}" width="64" height="64" alt="">
        <div><p class="brand-name">Yandex Music Downloader</p><p class="brand-tagline">Музыка с вами, даже офлайн</p></div>
      </div>
      <div class="header-meta"><span class="auth-label"><span class="dot green"></span>Авторизация через Яндекс</span><span class="loopback">127.0.0.1</span></div>
    </div>
  </header>
  <main class="container" id="challenge" data-deadline="${timing.deadline}" data-duration="${timing.duration}">
    <section class="intro" aria-labelledby="page-title">
      <p class="intro-badge">${info}Быстро и без пароля в приложении</p>
      <h1 id="page-title">Вход в Яндекс Музыку</h1>
      <p>Подтвердите доступ к своему аккаунту на официальном сайте Яндекса.<br>Это необходимо, чтобы приложение могло работать с вашей музыкальной библиотекой.</p>
    </section>
    <div class="layout">
      <section class="auth-card" aria-labelledby="code-title">
        <div class="card-heading"><h2 id="code-title">Ваш одноразовый код</h2><span class="waiting-chip" id="waiting-chip"><span class="dot"></span><span id="waiting-label">Ожидаем вход</span></span></div>
        <p class="card-description">Скопируйте код и вставьте его на странице авторизации Яндекса.<br>Не закрывайте эту вкладку до подтверждения.</p>
        <p class="code-label" id="code-label">Код для входа</p>
        <div class="code-box"><strong id="auth-code" aria-labelledby="code-label">${escapeHtml(userCode)}</strong><button class="copy-button" id="copy-code" type="button">${symbol('copy')}<span>Скопировать</span></button></div>
        <p class="caption code-caption">Код действует ограниченное время и предназначен только для этого входа.</p>
        <p id="copy-status" class="interaction-status" role="status" aria-live="polite"></p>
        <a class="yandex-link" id="yandex-link" href="${escapeHtml(verificationUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${symbol('external')}Открыть страницу Яндекса</a>
        <p class="caption hostname">Официальная страница входа: <strong>${hostname}</strong></p>
        <div class="wait-section">
          <div class="wait-row"><span class="spinner" aria-hidden="true"></span><div class="wait-copy"><h3 id="wait-title">Ожидаем подтверждения</h3><p class="caption" id="wait-description">После входа продолжим автоматически</p></div><p class="remaining">${symbol('clock')}<span>Осталось <strong id="remaining-time">—</strong></span></p></div>
          <progress id="expiry-progress" max="${timing.duration}" value="0" aria-label="Оставшийся срок действия кода"></progress>
          <p id="flow-status" class="interaction-status" role="status" aria-live="polite"></p>
          <div class="card-bottom"><p class="caption">После успешного входа вы сможете закрыть эту вкладку.</p><form id="cancel-form" method="post" action="${escapeHtml(`${path}/cancel`)}"><button class="cancel-button" id="cancel-auth" type="submit">Отменить вход</button></form></div>
        </div>
      </section>
      <aside class="instructions" aria-labelledby="instructions-title">
        <h2 id="instructions-title">Как подключить аккаунт</h2>
        <ol class="steps">
          <li><span class="step-number" aria-hidden="true">01</span><div><h3>Скопируйте код</h3><p>Нажмите «Скопировать» — вводить код вручную не понадобится.</p></div></li>
          <li><span class="step-number" aria-hidden="true">02</span><div><h3>Перейдите на сайт Яндекса</h3><p>Нажмите на кнопку перехода и вставьте код в открывшейся вкладке.</p></div></li>
          <li><span class="step-number" aria-hidden="true">03</span><div><h3>Подтвердите вход</h3><p>Разрешите доступ. Приложение самостоятельно обнаружит подтверждение.</p></div></li>
        </ol>
        <div class="privacy-card">${symbol('shield')}<div><h3>Ваш пароль остаётся у Яндекса</h3><p>Приложение не запрашивает пароль. Вводите его только на официальном сайте Яндекса.</p></div></div>
      </aside>
    </div>
    <footer><p>Временная локальная страница авторизации · Yandex Music Downloader</p><p>Неофициальное приложение, не связанное с Яндексом</p></footer>
  </main>
  <script>${browserScript}</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  );
}

// Маленькие inline SVG заменяют framework-зависимость только внутри этой страницы.
function symbol(
  name: 'info' | 'copy' | 'external' | 'clock' | 'shield',
): string {
  const paths = {
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
    external: '<path d="M14 3h7v7m0-7L10 14m0-10H4v16h16v-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/>',
    shield: '<path d="M12 3l9 4v6c0 5-9 9-9 9s-9-4-9-9V7l9-4zM8 12l3 3 5-6"/>',
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}

const styles = `
  :root { color-scheme: light; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0F172A; background: #F7F8FC; }
  * { box-sizing: border-box; }
  body { margin: 0; font-size: 16px; line-height: 1.5; }
  h1, h2, h3, p { margin: 0; }
  h2 { font-size: 22px; line-height: 1.35; font-weight: 650; letter-spacing: -.6px; }
  h3 { font-size: 16px; line-height: 24px; font-weight: 600; }
  svg { width: 20px; height: 20px; flex-shrink: 0; }
  button, a { -webkit-tap-highlight-color: transparent; }
  button { font: inherit; cursor: pointer; }
  button:disabled { cursor: default; opacity: .65; }
  :focus-visible { outline: 3px solid #4247D9; outline-offset: 4px; }
  .header { background: #FFFFFF; border-bottom: 1px solid #E2E8F0; }
  .header-inner { max-width: 1208px; margin: 0 auto; min-height: 98px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand-icon { display: block; width: 64px; height: 64px; object-fit: contain; margin: 0 12px; }
  .brand-name { font-size: 20px; font-weight: 700; letter-spacing: -.7px; line-height: 28px; }
  .brand-tagline { font-size: 14px; color: #64748B; }
  .header-meta { display: flex; align-items: center; gap: 24px; color: #64748B; font-size: 14px; }
  .auth-label { display: inline-flex; align-items: center; gap: 12px; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #5B5FEF; flex-shrink: 0; }
  .green { background: #10B981; }
  .loopback { border: 1px solid #E2E8F0; border-radius: 8px; background: #F1F5F9; padding: 6px 12px; font: 13px/20px ui-monospace, monospace; color: #475569; }
  .container { max-width: 1208px; margin: 0 auto; padding-top: 48px; }
  .intro-badge { display: inline-flex; gap: 8px; align-items: center; border: 1px solid #D9DCFF; border-radius: 999px; padding: 6px 12px; background: #EEF2FF; font-size: 14px; line-height: 20px; font-weight: 600; color: #4247D9; }
  .intro-badge svg { width: 16px; height: 16px; }
  h1 { font-size: 38px; line-height: 48px; letter-spacing: -1.3px; font-weight: 750; margin: 20px 0 10px; }
  .intro > p:last-child { color: #64748B; font-size: 18px; line-height: 28px; }
  .layout { display: grid; grid-template-columns: minmax(0, 728px) minmax(0, 1fr); gap: 32px; margin-top: 40px; }
  .auth-card { padding: 32px 36px; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; box-shadow: 0 8px 24px rgba(15, 23, 42, .04); min-width: 0; }
  .card-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .waiting-chip { display: inline-flex; gap: 8px; align-items: center; background: #EEF2FF; color: #4247D9; border: 1px solid #D9DCFF; border-radius: 999px; font-size: 14px; line-height: 20px; font-weight: 600; padding: 6px 12px; white-space: nowrap; }
  .waiting-chip .dot { width: 7px; height: 7px; }
  .card-description { color: #64748B; margin-top: 8px; line-height: 24px; }
  .code-label { font-size: 14px; font-weight: 600; color: #475569; margin: 24px 0 8px; }
  .code-box { display: flex; align-items: center; gap: 16px; padding: 16px 16px 16px 24px; border: 1px solid #CCD0FF; border-radius: 12px; background: #F3F3FF; }
  #auth-code { min-width: 0; flex: 1; font: 700 36px/48px ui-monospace, monospace; letter-spacing: 1px; color: #353582; overflow-wrap: anywhere; user-select: all; }
  .copy-button { display: inline-flex; justify-content: center; align-items: center; gap: 12px; flex-shrink: 0; padding: 14px 20px; border: 1px solid #5B5FEF; border-radius: 10px; color: #FFFFFF; background: #5B5FEF; font-size: 16px; font-weight: 600; line-height: 20px; }
  .copy-button:hover:enabled { background: #4247D9; }
  .caption { color: #64748B; font-size: 14px; line-height: 20px; }
  .code-caption { margin-top: 12px; }
  .interaction-status { color: #475569; font-size: 14px; line-height: 20px; }
  .interaction-status:not(:empty) { margin-top: 8px; }
  .yandex-link { display: flex; justify-content: center; align-items: center; gap: 12px; color: #4247D9; border: 1px solid #BDC1FF; border-radius: 10px; padding: 14px 20px; font-weight: 600; text-decoration: none; margin-top: 24px; text-align: center; }
  .yandex-link:hover { background: #EEF2FF; }
  .yandex-link[aria-disabled="true"] { opacity: .65; }
  .hostname { text-align: center; margin-top: 8px; overflow-wrap: anywhere; }
  .hostname strong { font-weight: 600; }
  .wait-section { border-top: 1px solid #E2E8F0; margin-top: 24px; padding-top: 24px; }
  .wait-row { display: flex; align-items: center; gap: 16px; }
  .spinner { width: 36px; height: 36px; border: 3px solid #E0DFFF; border-top-color: #5B5FEF; border-radius: 50%; flex-shrink: 0; animation: spin 1.2s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
  .wait-copy { flex: 1; }
  .wait-copy p { margin-top: 2px; }
  .remaining { color: #64748B; display: flex; align-items: center; gap: 8px; font-size: 14px; white-space: nowrap; }
  .remaining svg { width: 16px; height: 16px; }
  .remaining strong { color: #334155; }
  progress { display: block; width: 100%; height: 6px; border: 0; border-radius: 999px; margin-top: 20px; overflow: hidden; background: #E2E8F0; color: #818CF8; }
  progress::-webkit-progress-bar { background: #E2E8F0; }
  progress::-webkit-progress-value { background: #818CF8; border-radius: 999px; }
  progress::-moz-progress-bar { background: #818CF8; }
  .card-bottom { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 32px; }
  .cancel-button { color: #64748B; background: none; border: 0; padding: 0; font-size: 14px; line-height: 20px; text-decoration: underline; white-space: nowrap; }
  .cancel-button:hover:enabled { color: #334155; }
  .instructions { padding-top: 20px; }
  .steps { list-style: none; padding: 0; margin: 28px 0 40px; display: grid; gap: 32px; }
  .steps li { display: flex; align-items: flex-start; gap: 16px; }
  .step-number { width: 40px; height: 40px; display: grid; place-items: center; background: #ECECFF; border-radius: 12px; color: #4247D9; font-size: 16px; font-weight: 600; flex-shrink: 0; }
  .steps p { color: #64748B; margin-top: 4px; line-height: 24px; }
  .privacy-card { display: flex; align-items: flex-start; gap: 12px; border: 1px solid #D9E1FF; border-radius: 12px; background: #F2F5FF; padding: 24px; }
  .privacy-card svg { color: #5B5FEF; width: 24px; height: 24px; }
  .privacy-card h3 { color: #334155; }
  .privacy-card p { color: #64748B; font-size: 14px; line-height: 24px; margin-top: 8px; }
  footer { display: flex; justify-content: space-between; gap: 24px; border-top: 1px solid #E2E8F0; margin-top: 40px; padding: 20px 0 32px; color: #64748B; font-size: 14px; line-height: 20px; }
  @media (max-width: 1272px) { .header-inner, .container { margin-left: 32px; margin-right: 32px; } }
  @media (max-width: 900px) { .layout { grid-template-columns: minmax(0, 1fr); } .header-inner { flex-wrap: wrap; padding: 16px 0; gap: 12px; } .header-meta { margin-left: 12px; } .instructions { padding-top: 0; } footer { flex-direction: column; gap: 8px; } }
  @media (max-width: 640px) { .container { padding-top: 32px; } .container, .header-inner { margin-left: 24px; margin-right: 24px; } .brand-icon { margin-left: 0; margin-right: 4px; width: 56px; height: 56px; } .brand-name { font-size: 18px; } .brand-tagline { font-size: 12px; } .header-meta { flex-wrap: wrap; margin-left: 0; gap: 16px; font-size: 12px; } h1 { font-size: 30px; line-height: 38px; } .intro > p:last-child { font-size: 16px; line-height: 24px; } .auth-card { padding: 24px; } .card-heading { flex-wrap: wrap; gap: 8px; } .code-box { flex-wrap: wrap; padding: 16px; } #auth-code { font-size: 30px; line-height: 40px; } .copy-button { padding: 12px 16px; } .wait-row { flex-wrap: wrap; } .remaining { margin-left: 52px; } .card-bottom { flex-wrap: wrap; } }
  @media (max-width: 420px) { .brand { align-items: flex-start; gap: 8px; } .brand-name { font-size: 16px; letter-spacing: -.5px; } .intro-badge { font-size: 12px; } .auth-card { padding: 20px; } .copy-button { width: 100%; } .privacy-card { padding: 20px; } }
`;

// Только абсолютный deadline: reload не создаёт новый срок и не управляет OAuth.
const browserScript = `
  const root = document.getElementById('challenge');
  const code = document.getElementById('auth-code');
  const copy = document.getElementById('copy-code');
  const copyStatus = document.getElementById('copy-status');
  const link = document.getElementById('yandex-link');
  const form = document.getElementById('cancel-form');
  const cancel = document.getElementById('cancel-auth');
  const flowStatus = document.getElementById('flow-status');
  const deadline = Number(root.dataset.deadline);
  const duration = Number(root.dataset.duration);
  let stopped = false;
  function stop(label, description) {
    stopped = true;
    document.getElementById('waiting-label').textContent = label;
    document.getElementById('wait-title').textContent = label;
    document.getElementById('wait-description').textContent = description;
    document.querySelector('.spinner').style.animation = 'none';
    copy.disabled = true;
    link.setAttribute('aria-disabled', 'true');
  }
  function updateTime() {
    const remaining = Math.max(0, Math.min(duration, deadline - Date.now()));
    const seconds = Math.ceil(remaining / 1000);
    document.getElementById('remaining-time').textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
    document.getElementById('expiry-progress').value = remaining;
    if (remaining === 0 && !stopped) stop('Срок действия кода истёк', 'Запустите авторизацию заново в приложении.');
  }
  updateTime();
  const timer = setInterval(updateTime, 250);
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code.textContent);
      copyStatus.textContent = 'Код скопирован';
      setTimeout(() => { if (copyStatus.textContent === 'Код скопирован') copyStatus.textContent = ''; }, 3000);
    } catch {
      copyStatus.textContent = 'Не удалось скопировать код. Выделите его и скопируйте вручную.';
    }
  });
  link.addEventListener('click', (event) => { if (stopped) event.preventDefault(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    cancel.disabled = true;
    try {
      const response = await fetch(form.action, { method: 'POST', cache: 'no-store', referrerPolicy: 'no-referrer' });
      if (response.status !== 204) throw new Error();
      stop('Вход отменён', 'Можно закрыть эту вкладку.');
      flowStatus.textContent = 'Вход отменён';
      clearInterval(timer);
    } catch {
      stop('Связь с приложением прервана', 'Результат входа проверьте в приложении.');
      flowStatus.textContent = 'Не удалось отправить отмену. Проверьте приложение.';
      cancel.disabled = false;
    }
  });
`;
