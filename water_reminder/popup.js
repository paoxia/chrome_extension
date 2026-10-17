import {validateSettings, plan} from './schedule.mjs';
import {ANIMATION_ORIGINS} from './animation.mjs';

const $ = id => document.getElementById(id);
let savedSettings;
let busy = false;
let awaitingReminderId = null;

function formSettings() {
  return validateSettings({
    totalMl: Number($('total-ml').value),
    startTime: $('start-time').value, endTime: $('end-time').value, enabled: $('enabled').checked,
    restPeriods: Array.from($('rest-periods').children, row => ({
      startTime: row.querySelector('.rest-start').value,
      endTime: row.querySelector('.rest-end').value
    })),
    animationEnabled: $('animation-enabled').checked
  });
}

function addRestPeriod(period = {startTime: '12:00', endTime: '13:00'}) {
  const row = document.createElement('div');
  row.className = 'rest-row';
  for (const [className, label, value] of [
    ['rest-start', '休息开始时间', period.startTime],
    ['rest-end', '休息结束时间', period.endTime]
  ]) {
    const input = document.createElement('input');
    input.type = 'time';
    input.required = true;
    input.className = className;
    input.setAttribute('aria-label', label);
    input.value = value;
    row.append(input);
  }
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'remove-rest';
  remove.textContent = '删除';
  remove.setAttribute('aria-label', '删除此段休息时间');
  remove.addEventListener('click', () => {
    row.remove();
    preview();
  });
  row.append(remove);
  $('rest-periods').append(row);
}

async function request(action, data = {}) {
  const result = await chrome.runtime.sendMessage({action, ...data});
  if (!result?.ok) throw new Error(result?.error ?? '后台暂时无法连接，请重新打开插件。');
  return result;
}

function feedback(message, error = false) {
  $('feedback').textContent = message;
  $('feedback').classList.toggle('error', error);
}

function preview() {
  const restCount = $('rest-periods').children.length;
  $('rest-count').textContent = restCount ? `${restCount} 段` : '未设置';
  try {
    const current = formSettings();
    const slots = plan(current);
    const amounts = slots.map(slot => slot.amountMl);
    const low = Math.min(...amounts), high = Math.max(...amounts);
    const range = low === high ? `${low}` : `${low}–${high}`;
    const overnight = current.endTime < current.startTime ? ' · 跨至次日' : '';
    $('plan-summary').textContent = `共 ${slots.length} 次 · 每次 ${range} ml · 首次 ${slots[0].time}${overnight}${restCount ? ' · 已排除休息时间' : ''}`;
    $('plan-count').textContent = `${slots.length} 次`;
    $('plan-list').replaceChildren(...slots.map(slot => {
      const row = document.createElement('li');
      const time = document.createElement('span');
      time.textContent = `${slot.nextDay ? '次日 ' : ''}${slot.time}`;
      const cumulative = document.createElement('small');
      cumulative.textContent = `累计 ${slot.cumulativeMl} ml`;
      time.append(cumulative);
      const amount = document.createElement('strong');
      amount.textContent = `${slot.amountMl} ml`;
      row.append(time, amount);
      return row;
    }));
    const changed = savedSettings && JSON.stringify(current) !== JSON.stringify(savedSettings);
    feedback(changed ? '计划已修改，保存后生效。' : '');
  } catch (error) {
    $('plan-summary').textContent = error.message;
    $('plan-count').textContent = '';
    $('plan-list').replaceChildren();
    feedback(error.message, true);
  }
}

function renderState(state) {
  savedSettings = state.settings;
  $('status').textContent = state.settings.enabled ? '提醒已开启' : '已暂停';
  $('status').classList.toggle('active', state.settings.enabled);
  const next = state.nextReminder;
  const awaiting = state.awaitingReminder;
  awaitingReminderId = awaiting?.id ?? null;
  $('confirm-button').hidden = !awaiting;
  $('confirm-button').textContent = awaiting ? `已喝完 ${awaiting.amountMl} ml，确认本次` : '已喝完，确认本次';
  document.querySelector('.next-card').classList.toggle('waiting', Boolean(awaiting));
  $('progress-detail').textContent = `${state.progress.cycleKey} 本轮已确认 ${state.progress.confirmedMl} / ${state.settings.totalMl} ml · 剩余 ${Math.max(0, state.settings.totalMl - state.progress.confirmedMl)} ml`;
  if (awaiting) {
    $('next-label').textContent = '这杯水还在等你确认';
    $('next-amount').textContent = `${awaiting.amountMl} ml`;
    $('next-time').textContent = '待确认';
    $('next-detail').textContent = !state.settings.enabled ? '提醒已暂停，喝完后仍可在这里确认。'
      : next?.kind === 'retry' ? `未确认将于 ${next.time} 再次提醒；后续计划等待本次确认。`
        : '本轮没有可用的催促时点，仍可确认这杯水；下一轮重新开始。';
  } else if (next) {
    const date = new Date(next.at);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayLabel = date.toDateString() === today.toDateString() ? '今天' : date.toDateString() === tomorrow.toDateString() ? '明天' : `${date.getMonth() + 1}/${date.getDate()}`;
    $('next-label').textContent = '下一次喝水';
    $('next-amount').textContent = `${next.amountMl} ml`;
    $('next-time').textContent = `${dayLabel} ${next.time}`;
    $('next-detail').textContent = `第 ${next.index}/${next.count} 次提醒 · 喝完后确认，未确认每 5 分钟再提醒。`;
  } else {
    $('next-label').textContent = '给自己一点休息';
    $('next-amount').textContent = '已暂停';
    $('next-time').textContent = '';
    $('next-detail').textContent = '开启并保存提醒计划，即可继续每日提醒。';
  }
  $('notification-warning').hidden = state.notificationPermission !== 'denied';
  $('notification-warning').textContent = '通知权限未开启，请在系统通知设置中允许 Google Chrome 发送通知。';
  $('last-error').hidden = !state.lastError;
  $('last-error').textContent = state.lastError ? `最近一次提醒状态：${state.lastError}` : '';
  const rows = [
    ...(awaiting ? [{...awaiting, time: '待确认', cumulativeMl: state.progress.confirmedMl + awaiting.amountMl}] : []),
    ...state.upcomingPlan
  ];
  $('live-plan-count').textContent = `${rows.length} 次`;
  $('live-plan-list').replaceChildren(...rows.map(slot => {
    const row = document.createElement('li');
    const time = document.createElement('span');
    const nextDay = slot.at && new Date(slot.at).toDateString() !== new Date(state.progress.startAt).toDateString();
    time.textContent = `${slot.time !== '待确认' && nextDay ? '次日 ' : ''}${slot.time}`;
    const amount = document.createElement('strong');
    amount.textContent = `${slot.amountMl} ml`;
    row.append(time, amount);
    return row;
  }));
}

function setBusy(value) {
  busy = value;
  $('settings-fields').disabled = value;
  $('test-button').disabled = value;
  $('confirm-button').disabled = value;
}

$('confirm-button').addEventListener('click', async () => {
  if (busy || !awaitingReminderId) return;
  const reminderId = awaitingReminderId;
  setBusy(true);
  try {
    const state = await request('confirmReminder', {reminderId});
    renderState(state);
    feedback(state.confirmed ? '已记录本次饮水，后续时间和水量已重新安排。' : '这次提醒已处理，请查看当前计划。');
  } catch (error) {
    feedback(error.message, true);
  } finally {
    setBusy(false);
  }
});

$('settings-form').addEventListener('input', preview);
$('add-rest').addEventListener('click', () => {
  addRestPeriod();
  $('rest-details').open = true;
  preview();
});
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  try {
    const settings = formSettings();
    setBusy(true);
    if (settings.animationEnabled && !await chrome.permissions.request({origins: ANIMATION_ORIGINS})) {
      throw new Error('未获得网页权限，计划尚未保存。请允许网页权限，或关闭网页动画后再保存。');
    }
    const state = await request('saveSettings', {settings});
    renderState(state);
    feedback(settings.enabled ? '已保存，每天按此计划提醒。' : '已保存，提醒已暂停。');
  } catch (error) {
    feedback(error.message, true);
  } finally {
    setBusy(false);
  }
});

$('test-button').addEventListener('click', async () => {
  setBusy(true);
  try {
    const result = await request('testNotification');
    if (result.animation.shown) {
      feedback(result.notificationError ? '网页动画已显示；系统通知未发送，请检查通知权限。' : '已显示网页动画，并请求显示新的系统通知。');
    } else if (result.animation.reason !== 'disabled') {
      feedback('已请求显示系统通知；网页动画暂不可用，请切换到已授权的普通网页再测试。');
    } else {
      feedback('已请求显示新的测试通知；若未弹出，请检查系统通知设置。');
    }
  } catch (error) {
    feedback(error.message, true);
  } finally {
    setBusy(false);
  }
});

async function initialize() {
  try {
    const state = await request('getState');
    $('total-ml').value = state.settings.totalMl;
    $('start-time').value = state.settings.startTime;
    $('end-time').value = state.settings.endTime;
    $('enabled').checked = state.settings.enabled;
    $('animation-enabled').checked = state.settings.animationEnabled;
    for (const period of state.settings.restPeriods) addRestPeriod(period);
    renderState(state);
    preview();
    setBusy(false);
  } catch (error) {
    $('status').textContent = '加载失败';
    feedback(error.message, true);
  }
}

initialize();

// Keep the next reminder current if the popup stays open across a time slot.
setInterval(async () => {
  if (busy || !savedSettings) return;
  try {
    renderState(await request('getState'));
  } catch (error) {
    feedback(error.message, true);
  }
}, 10000);
