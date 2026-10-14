export const ANIMATION_ORIGINS = ['http://*/*', 'https://*/*'];

// This function is serialized by chrome.scripting; keep it self-contained.
export function showWaterAnimation(reminder) {
  if (document.visibilityState === 'hidden' || !document.documentElement) return false;
  const hostId = 'water-reminder-animation-root';
  document.getElementById(hostId)?.dispatchEvent(new Event('water-reminder-dismiss'));

  const host = document.createElement('div');
  host.id = hostId;
  for (const [property, value] of Object.entries({
    all: 'initial', position: 'fixed', bottom: '24px', right: '24px',
    width: 'min(340px, calc(100vw - 32px))', 'z-index': '2147483647', 'pointer-events': 'none'
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
      .close { position: absolute; right: 12px; top: 9px; border: 0; background: transparent;
        color: #7395a7; width: 28px; height: 28px; font-size: 22px; cursor: pointer; }
      .content { display: flex; align-items: center; gap: 18px; margin-bottom: 16px; }
      .art { position: relative; flex: 0 0 72px; height: 104px; }
      .drop { position: absolute; width: 24px; height: 30px; top: 0; left: 25px;
        animation: drop 2.4s ease-in-out infinite; }
      .glass { position: absolute; bottom: 0; left: 8px; width: 58px; height: 64px;
        border: 3px solid #76b8d2; border-top: 0; border-radius: 3px 3px 18px 18px; overflow: hidden;
        background: #fff9; box-shadow: inset 4px 0 0 #fff8; }
      .water { position: absolute; bottom: 0; width: 100%; height: 70%;
        background: linear-gradient(#69c6e6, #268fb9); animation: fill 2s ease-out; }
      .wave { position: absolute; top: -8px; left: -6px; width: 66px; height: 20px;
        border-radius: 50%; background: #a9e5f3; animation: wave 2.4s ease-in-out infinite alternate; }
      .bubble { position: absolute; bottom: 6px; border: 1px solid #c9f1ff; border-radius: 50%;
        width: 6px; height: 6px; animation: bubble 2.8s ease-out infinite; }
      .bubble:nth-child(2) { left: 10px; animation-delay: .6s; }
      .bubble:nth-child(3) { left: 32px; animation-delay: 1.4s; width: 4px; height: 4px; }
      .copy { flex: 1; min-width: 0; }
      .eyebrow { color: #51889f; font-size: 11px; letter-spacing: 1px; margin-bottom: 3px; }
      h2 { font-size: 17px; line-height: 1.5; margin: 0 0 3px; font-weight: 600; }
      .amount { color: #167ca7; font-size: 32px; font-weight: 700; line-height: 1.3; letter-spacing: -1px; }
      .unit { margin-left: 4px; font-size: 14px; font-weight: 500; letter-spacing: 0; }
      .detail { color: #6a91a4; font-size: 11px; margin: 5px 0 0; }
      .dismiss { border: 1px solid #c8e6f1; border-radius: 10px; background: #fff9; width: 100%;
        padding: 9px 12px; color: #397e9b; font: inherit; cursor: pointer; }
      button:hover { background: #e0f3fc; }
      button:focus-visible { outline: 3px solid #5ca9c9; outline-offset: 2px; }
      .timer { position: absolute; bottom: 0; left: 0; width: 100%; height: 3px;
        background: #71bfdc; transform-origin: left; animation: countdown 15s linear forwards; }
      @keyframes arrive { from { opacity: 0; transform: translateY(24px) scale(.96); } to { opacity: 1; transform: none; } }
      @keyframes drop { 0%, 100% { transform: translateY(0); opacity: .8; } 55% { transform: translateY(11px); opacity: 1; } }
      @keyframes fill { from { height: 8%; } to { height: 70%; } }
      @keyframes wave { from { transform: rotate(-7deg); } to { transform: rotate(7deg); } }
      @keyframes bubble { 0% { transform: translateY(0); opacity: 0; } 25% { opacity: .9; } 100% { transform: translateY(-38px); opacity: 0; } }
      @keyframes countdown { to { transform: scaleX(0); } }
      @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; } .timer { display: none; } }
    </style>
    <section class="card" role="status" aria-live="polite" aria-atomic="true">
      <button class="close" type="button" aria-label="关闭喝水提醒">×</button>
      <div class="content">
        <div class="art" aria-hidden="true">
          <svg class="drop" viewBox="0 0 32 40"><path d="M16 1C11 10 2 19 2 26a14 14 0 0 0 28 0C30 19 21 10 16 1Z" fill="#369fc9"/><path d="M8 27c0 5 3 8 8 8" fill="none" stroke="#c2edfa" stroke-width="3" stroke-linecap="round"/></svg>
          <div class="glass"><div class="water"><div class="wave"></div><i class="bubble"></i><i class="bubble"></i></div></div>
        </div>
        <div class="copy"><div class="eyebrow">水分补给时间</div><h2>该喝一杯水啦</h2><div class="amount"><span id="amount"></span><span class="unit">ml</span></div><p class="detail"></p></div>
      </div>
      <button class="dismiss" type="button">知道了，去倒杯水</button>
      <div class="timer" aria-hidden="true"></div>
    </section>`;
  // Insert data as text, never as page HTML.
  shadow.getElementById('amount').textContent = String(reminder.amountMl);
  shadow.querySelector('.detail').textContent = reminder.test
    ? '测试提醒 · 给忙碌的一天留一点水分'
    : `第 ${reminder.index}/${reminder.count} 次 · 按计划累计 ${reminder.cumulativeMl} ml`;

  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    document.removeEventListener('keydown', onKeyDown);
    host.remove();
  };
  const onKeyDown = event => { if (event.key === 'Escape') dismiss(); };
  host.addEventListener('water-reminder-dismiss', dismiss, {once: true});
  shadow.querySelector('.close').addEventListener('click', dismiss);
  shadow.querySelector('.dismiss').addEventListener('click', dismiss);
  document.addEventListener('keydown', onKeyDown);
  document.documentElement.append(host);
  timer = setTimeout(dismiss, 15000);
  return true;
}

export async function showAnimationInActiveTab(api, slot, test = false) {
  try {
    const [tab] = await api.tabs.query({active: true, lastFocusedWindow: true});
    if (!Number.isInteger(tab?.id) || !/^https?:\/\//.test(tab.url ?? '')) return {shown: false, reason: 'unsupported-page'};
    const results = await api.scripting.executeScript({
      target: {tabId: tab.id}, func: showWaterAnimation, args: [{...slot, test}]
    });
    return results.some(result => result.result === true)
      ? {shown: true} : {shown: false, reason: 'hidden-page'};
  } catch {
    // Missing site access, restricted pages and tabs closing must not break alarms.
    return {shown: false, reason: 'page-unavailable'};
  }
}
