export const ANIMATION_ORIGINS = ['http://*/*', 'https://*/*'];

// This function is serialized by chrome.scripting; keep it self-contained.
export async function showWaterAnimation(reminder) {
  if (document.visibilityState === 'hidden' || !document.documentElement) return false;
  const hostId = 'water-reminder-animation-root';
  document.getElementById(hostId)?.dispatchEvent(new Event('water-reminder-dismiss'));

  const host = document.createElement('div');
  host.id = hostId;
  host.dataset.reminderId = reminder.id;
  for (const [property, value] of Object.entries({
    all: 'initial', position: 'fixed', bottom: '24px', right: '24px',
    width: 'min(360px, calc(100vw - 32px))', 'z-index': '2147483647', 'pointer-events': 'none'
  })) host.style.setProperty(property, value, 'important');
  const shadow = host.attachShadow({mode: 'open'});
  shadow.innerHTML = `
    <style>
      :host { color-scheme: light; }
      * { box-sizing: border-box; }
      .card { position: relative; overflow: hidden; border: 1px solid #c5e4f2; border-radius: 22px;
        background: linear-gradient(135deg, #f8fdff, #eaf8fc); color: #24495d; pointer-events: auto;
        box-shadow: 0 14px 50px #173f5933, 0 2px 6px #173f5912; padding: 22px;
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
        animation: arrive .45s cubic-bezier(.2,.8,.2,1); }
      .content { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
      .art { position: relative; flex: 0 0 136px; height: 152px; }
      .art::before { content: ''; position: absolute; inset: 15px 4px 5px;
        border-radius: 50%; background: radial-gradient(ellipse, #bfeaf64d, transparent 70%); }
      .mascot { position: relative; display: block; width: 136px; height: 152px; object-fit: contain;
        transform-origin: 50% 85%; animation: mascot-sway 3s ease-in-out infinite; }
      .copy { flex: 1; min-width: 0; }
      .eyebrow { color: #51889f; font-size: 11px; letter-spacing: 1px; margin-bottom: 3px; }
      h2 { font-size: 17px; line-height: 1.5; margin: 0 0 3px; font-weight: 600; }
      .amount { color: #167ca7; font-size: 32px; font-weight: 700; line-height: 1.3; letter-spacing: -1px; }
      .unit { margin-left: 4px; font-size: 14px; font-weight: 500; letter-spacing: 0; }
      .detail { color: #6a91a4; font-size: 11px; margin: 5px 0 0; }
      .confirm { border: 0; border-radius: 10px; background: #2086b5; width: 100%;
        padding: 11px 12px; color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
      button:hover { background: #196f98; }
      button:disabled { opacity: .6; cursor: wait; }
      button:focus-visible { outline: 3px solid #5ca9c9; outline-offset: 2px; }
      .confirmation-note { margin: 9px 0 0; text-align: center; color: #62899a; font-size: 11px; }
      .confirmation-note.error { color: #b04635; }
      @keyframes arrive { from { opacity: 0; transform: translateY(24px) scale(.96); } to { opacity: 1; transform: none; } }
      @keyframes mascot-sway {
        0%, 100% { transform: translateY(0) rotate(-2deg); }
        50% { transform: translateY(-5px) rotate(2deg); }
      }
      @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; } }
    </style>
    <section class="card" role="status" aria-live="polite" aria-atomic="true">
      <div class="content">
        <div class="art" aria-hidden="true">
          <img class="mascot" alt="" draggable="false">
        </div>
        <div class="copy"><div class="eyebrow">哆啦 A 梦的喝水提醒</div><h2>该喝一杯水啦</h2><div class="amount"><span id="amount"></span><span class="unit">ml</span></div><p class="detail"></p></div>
      </div>
      <button class="confirm" type="button"></button>
      <p class="confirmation-note"></p>
    </section>`;
  // Insert data as text, never as page HTML.
  shadow.getElementById('amount').textContent = String(reminder.amountMl);
  shadow.querySelector('.detail').textContent = reminder.test
    ? '测试提醒 · 和哆啦 A 梦一起喝水'
    : `已确认 ${reminder.confirmedMl} / ${reminder.totalMl} ml${reminder.attempts > 1 ? ` · 第 ${reminder.attempts} 次催促` : ''}`;

  const mascot = shadow.querySelector('.mascot');
  mascot.src = reminder.mascotUrl;
  try {
    // Do not show an empty character if the packaged resource cannot load.
    await mascot.decode();
  } catch {
    return false;
  }
  if (document.visibilityState === 'hidden') return false;

  const dismiss = () => host.remove();
  host.addEventListener('water-reminder-dismiss', dismiss, {once: true});
  const button = shadow.querySelector('.confirm');
  const note = shadow.querySelector('.confirmation-note');
  button.textContent = reminder.test ? '确认测试提醒' : `已喝完 ${reminder.amountMl} ml`;
  note.textContent = reminder.test ? '测试不计入饮水量，不会开启重复催促。' : '未确认每 5 分钟再提醒，确认后重新安排后续计划。';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const response = await chrome.runtime.sendMessage(reminder.test
        ? {action: 'dismissTestReminder'} : {action: 'confirmReminder', reminderId: reminder.id});
      if (!response?.ok) throw new Error(response?.error ?? '确认失败，请重试或在插件面板确认。');
      dismiss();
    } catch (error) {
      note.textContent = error.message;
      note.classList.add('error');
      button.disabled = false;
    }
  });
  document.documentElement.append(host);
  return true;
}

export function dismissWaterAnimation(reminderId) {
  const host = document.getElementById('water-reminder-animation-root');
  if (host?.dataset.reminderId === reminderId) host.dispatchEvent(new Event('water-reminder-dismiss'));
}

export async function dismissAnimationInTabs(api, tabIds, reminderId) {
  await Promise.allSettled([...new Set(tabIds)].map(tabId => api.scripting.executeScript({
    target: {tabId}, func: dismissWaterAnimation, args: [reminderId]
  })));
}

export async function showAnimationInActiveTab(api, slot, test = false) {
  try {
    const [tab] = await api.tabs.query({active: true, lastFocusedWindow: true});
    if (!Number.isInteger(tab?.id) || !/^https?:\/\//.test(tab.url ?? '')) return {shown: false, reason: 'unsupported-page'};
    const results = await api.scripting.executeScript({
      target: {tabId: tab.id}, func: showWaterAnimation, args: [{...slot, test, mascotUrl: api.runtime.getURL('assets/doraemon-water.png')}]
    });
    return results.some(result => result.result === true)
      ? {shown: true, tabId: tab.id} : {shown: false, reason: 'hidden-page'};
  } catch {
    // Missing site access, restricted pages and tabs closing must not break alarms.
    return {shown: false, reason: 'page-unavailable'};
  }
}
