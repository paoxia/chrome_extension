import test from 'node:test';
import assert from 'node:assert/strict';
import {createController, ALARM_PREFIX} from '../controller.mjs';
import {DEFAULT_SETTINGS} from '../schedule.mjs';
import {showWaterAnimation} from '../animation.mjs';

const at = (hour, minute = 0, day = 14) => new Date(2026, 9, day, hour, minute);
const rest = (startTime, endTime) => ({startTime, endTime});
function fixture() {
  let time = at(9), permission = 'granted', failNotification = false;
  const data = {}, alarms = new Map(), notifications = [], activeNotifications = new Map();
  const animations = [], dismissed = [], clearedNotifications = [];
  const api = {
    storage: {local: {
      get: async keys => Object.fromEntries((typeof keys === 'string' ? [keys] : keys).map(key => [key, structuredClone(data[key])])),
      set: async value => Object.assign(data, structuredClone(value))
    }},
    alarms: {
      getAll: async () => [...alarms.values()], get: async name => alarms.get(name),
      clear: async name => alarms.delete(name), create: async (name, info) => alarms.set(name, {name, scheduledTime: info.when})
    },
    action: {setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {}},
    notifications: {
      getPermissionLevel: async () => permission,
      create: async options => {
        if (failNotification) throw new Error('系统通知发送失败');
        const id = `generated-${notifications.length + 1}`;
        notifications.push({id, options}); activeNotifications.set(id, options); return id;
      },
      clear: async id => {clearedNotifications.push(id); return activeNotifications.delete(id);}
    },
    runtime: {getURL: path => `chrome-extension://test/${path}`},
    tabs: {query: async () => [{id: 12, url: 'https://example.com/'}]},
    scripting: {executeScript: async options => {
      if (options.func === showWaterAnimation) animations.push(options.args[0]); else dismissed.push(options.args[0]);
      return [{result: true}];
    }}
  };
  const controller = createController(api, () => new Date(time));
  return {controller, api, data, alarms, notifications, activeNotifications, animations, dismissed, clearedNotifications,
    setTime: value => {time = value;}, setPermission: value => {permission = value;},
    failNotification: () => {failNotification = true;},
    restart: () => createController(api, () => new Date(time)),
    fire: async () => {const alarm = [...alarms.values()][0]; assert.ok(alarm); alarms.delete(alarm.name); await controller.onAlarm(alarm); return alarm;},
    confirm: () => controller.confirmReminder(data.progress.awaiting.id)
  };
}

function assertBudget(state) {
  assert.equal(state.progress.confirmedMl + (state.awaitingReminder?.amountMl ?? 0)
    + state.upcomingPlan.reduce((sum, slot) => sum + slot.amountMl, 0), state.settings.totalMl);
}

test('首次启动分配 18 次，重复启动不重排，闹钟丢失可恢复', async () => {
  const f = fixture();
  const initial = await f.controller.initialize();
  assert.deepEqual(f.data.settings, DEFAULT_SETTINGS);
  assert.equal(initial.nextReminder.time, '09:30');
  assert.equal(initial.upcomingPlan.length, 18);
  assertBudget(initial);
  const pending = structuredClone(f.data.pendingReminder);
  await Promise.all([f.controller.initialize(), f.controller.getState()]);
  assert.deepEqual(f.data.pendingReminder, pending);
  assert.equal(f.alarms.size, 1);
  f.alarms.clear(); await f.controller.initialize();
  assert.equal(f.alarms.size, 1);
  assert.equal([...f.alarms.values()][0].scheduledTime, pending.at);
});

test('中途保存不同饮水日的时段，从当前剩余时间分配，不安排过去的首次提醒', async () => {
  const f = fixture();
  f.setTime(at(2)); await f.controller.initialize();
  const state = await f.controller.saveSettings({...DEFAULT_SETTINGS, totalMl: 900, startTime: '01:00', endTime: '04:00'});
  assert.equal(state.nextReminder.time, '02:30');
  assert.equal(state.nextReminder.amountMl, 225);
  assert.equal(state.upcomingPlan.length, 4);
  assertBudget(state);
});

test('提醒发送后不计入已喝，等待手动确认，五分钟后重试同一杯', async () => {
  const f = fixture(); await f.controller.initialize(); f.setTime(at(9, 30));
  await f.fire();
  const pending = structuredClone(f.data.progress.awaiting);
  assert.equal(pending.amountMl, 112);
  assert.equal(f.data.progress.confirmedMl, 0);
  assert.equal(f.data.pendingReminder.time, '09:35');
  assert.equal(f.data.pendingReminder.kind, 'retry');
  assert.equal(f.notifications[0].options.requireInteraction, true);
  assert.equal(f.notifications[0].options.buttons[0].title, '已喝完 112 ml');
  assert.match(f.notifications[0].options.message, /已确认 0 \/ 2000/);
  f.setTime(at(9, 35)); await f.fire();
  assert.equal(f.data.progress.awaiting.id, pending.id);
  assert.equal(f.data.progress.awaiting.amountMl, pending.amountMl);
  assert.equal(f.data.progress.awaiting.attempts, 2);
  assert.equal(f.data.pendingReminder.time, '09:40');
  assert.equal(f.data.progress.confirmedMl, 0);
  assert.notEqual(f.notifications[0].id, f.notifications[1].id);
  assert.equal(f.activeNotifications.size, 1);
  const state = await f.controller.getState();
  assert.equal(state.upcomingPlan[0].time, '10:05');
  assertBudget(state);
});

test('09:37 确认后停止催促，下一次 10:07，剩余毫升精确合计', async () => {
  const f = fixture(); await f.controller.initialize(); f.setTime(at(9, 30)); await f.fire();
  f.setTime(at(9, 35)); const retry = await f.fire();
  f.setTime(at(9, 37)); const state = await f.confirm();
  assert.equal(state.confirmed, true);
  assert.equal(state.progress.confirmedMl, 112);
  assert.equal(state.progress.entries.length, 1);
  assert.equal(state.awaitingReminder, null);
  assert.equal(state.nextReminder.kind, 'drink');
  assert.equal(state.nextReminder.time, '10:07');
  assert.equal(f.activeNotifications.size, 0);
  assertBudget(state);
  f.setTime(at(9, 40)); await f.controller.onAlarm(retry);
  assert.equal(f.notifications.length, 2);
});

test('较晚确认会减少剩余次数、重分配每次水量，不叠加或追补旧通知', async () => {
  const f = fixture(); await f.controller.initialize(); f.setTime(at(9, 30)); await f.fire();
  f.setTime(at(12, 20)); await f.fire();
  assert.equal(f.notifications.length, 2);
  assert.equal(f.data.progress.awaiting.amountMl, 112);
  const state = await f.confirm();
  assert.equal(state.nextReminder.time, '12:50');
  assert.ok(state.nextReminder.amountMl > 112);
  assert.equal(state.upcomingPlan.at(-1).time, '18:00');
  assertBudget(state);
});

test('重复点击、并发确认和旧通知事件只计一次，旧杯子不能确认新杯子', async () => {
  const f = fixture(); await f.controller.initialize(); f.setTime(at(9, 30)); await f.fire();
  const id = f.data.progress.awaiting.id, notificationId = f.notifications[0].id;
  f.setTime(at(9, 37));
  const results = await Promise.all([f.controller.confirmReminder(id), f.controller.confirmReminder(id), f.controller.confirmNotification(notificationId)]);
  assert.equal(results.filter(result => result.confirmed).length, 1);
  assert.equal(f.data.progress.confirmedMl, 112);
  f.setTime(at(10, 7)); await f.fire();
  const currentId = f.data.progress.awaiting.id;
  assert.notEqual(currentId, id);
  assert.equal((await f.controller.confirmReminder(id)).confirmed, false);
  assert.equal(f.data.progress.awaiting.id, currentId);
});

test('系统通知点击和按钮共用确认逻辑，上一条催促对应同一杯仍可确认', async () => {
  const f = fixture(); await f.controller.initialize(); f.setTime(at(9, 30)); await f.fire();
  const firstId = f.notifications[0].id;
  f.setTime(at(9, 35)); await f.fire();
  assert.equal((await f.controller.confirmNotification(firstId)).confirmed, true);
  assert.equal(f.data.progress.confirmedMl, 112);
  assert.equal(f.activeNotifications.size, 0);
});

test('通知创建后 worker 尚未追加回执也可通过持久化关联确认', async () => {
  const f = fixture(); await f.controller.initialize(); f.setTime(at(9, 30)); await f.fire();
  const id = f.notifications[0].id;
  f.data.progress.awaiting.notificationIds = [];
  const restarted = f.restart();
  assert.equal((await restarted.confirmNotification(id)).confirmed, true);
  assert.equal(f.data.progress.confirmedMl, 112);
  assert.equal(f.activeNotifications.size, 0);
});

test('关掉系统通知不代表已喝，五分钟仍会再次提醒', async () => {
  const f = fixture(); await f.controller.initialize(); f.setTime(at(9, 30)); await f.fire();
  f.activeNotifications.clear(); f.setTime(at(9, 35)); await f.fire();
  assert.equal(f.data.progress.confirmedMl, 0);
  assert.equal(f.data.progress.awaiting.attempts, 2);
  assert.equal(f.activeNotifications.size, 1);
});

test('五分钟催促遇到休息则等到休息结束，确认后计划也避开休息', async () => {
  const f = fixture();
  await f.controller.saveSettings({...DEFAULT_SETTINGS, restPeriods: [rest('09:31', '10:00'), rest('12:00', '13:00')]});
  f.setTime(at(9, 30)); await f.fire();
  assert.equal(f.data.pendingReminder.kind, 'retry');
  assert.equal(f.data.pendingReminder.time, '10:00');
  f.setTime(at(10)); await f.fire();
  const state = await f.confirm();
  assert.equal(state.nextReminder.time, '10:30');
  assert.ok(!state.upcomingPlan.some(slot => ['12:00', '12:30'].includes(slot.time)));
  assertBudget(state);
});

test('延迟的首次提醒落入休息时移动至结束时点并重新均分', async () => {
  const f = fixture(); await f.controller.saveSettings({...DEFAULT_SETTINGS, restPeriods: [rest('09:31', '10:00')]});
  f.setTime(at(9, 32)); await f.fire();
  assert.equal(f.notifications.length, 0);
  assert.equal(f.data.pendingReminder.time, '10:00');
  assert.equal(f.data.progress.awaiting, null);
  const state = await f.controller.getState();
  assert.equal(state.upcomingPlan[0].time, '10:00');
  assertBudget(state);
  f.setTime(at(10)); await f.fire(); assert.equal(f.notifications.length, 1);
});

test('暂停保留待确认与已喝记录，停止催促，恢复后重排且仍需确认', async () => {
  const f = fixture(); await f.controller.initialize(); f.setTime(at(9, 30)); await f.fire();
  const id = f.data.progress.awaiting.id;
  await f.controller.saveSettings({...DEFAULT_SETTINGS, enabled: false});
  assert.equal(f.alarms.size, 0); assert.equal(f.data.progress.awaiting.id, id);
  f.setTime(at(9, 45)); await f.controller.saveSettings({...DEFAULT_SETTINGS, enabled: true});
  assert.equal(f.data.pendingReminder.time, '09:50');
  assert.equal(f.data.progress.awaiting.id, id);
  await f.confirm(); assert.equal(f.data.progress.confirmedMl, 112);
});

test('保存设置保留已确认量与当前杯，目标不能小于已确认及待确认之和', async () => {
  const f = fixture(); await f.controller.initialize(); f.setTime(at(9, 30)); await f.fire(); await f.confirm();
  f.setTime(at(10)); await f.fire(); const id = f.data.progress.awaiting.id;
  const budget = f.data.progress.confirmedMl + f.data.progress.awaiting.amountMl;
  const before = structuredClone(f.data);
  await assert.rejects(f.controller.saveSettings({...DEFAULT_SETTINGS, totalMl: budget - 1}), /不能低于/);
  assert.deepEqual(f.data, before);
  const state = await f.controller.saveSettings({...DEFAULT_SETTINGS, totalMl: 2500, restPeriods: [rest('12:00', '13:00')]});
  assert.equal(state.progress.confirmedMl, 112); assert.equal(state.awaitingReminder.id, id); assertBudget(state);
});

test('重启保留未确认状态、重试时间和历史，丢失闹钟可恢复', async () => {
  const f = fixture(); await f.controller.initialize(); f.setTime(at(9, 30)); await f.fire();
  const original = structuredClone(f.data.progress);
  f.setTime(at(9, 33)); f.alarms.clear(); const restarted = f.restart(); await restarted.initialize();
  assert.deepEqual(f.data.progress, original);
  assert.equal(f.data.pendingReminder.time, '09:35'); assert.equal(f.alarms.size, 1);
});

test('到点 worker 初始化与闹钟事件并发，不丢失当前提醒，不重复生成待确认杯子', async () => {
  const f = fixture(); await f.controller.initialize(); const alarm = [...f.alarms.values()][0];
  f.alarms.clear(); f.setTime(at(9, 30)); const restarted = f.restart();
  await Promise.all([restarted.initialize(), restarted.onAlarm(alarm), restarted.onAlarm(alarm)]);
  assert.equal(f.notifications.length, 1); assert.equal(f.data.progress.awaiting.attempts, 1); assert.equal(f.alarms.size, 1);
});

test('休眠恢复只提醒同一杯一次，不自动计入已喝，不集中补发', async () => {
  const f = fixture(); await f.controller.initialize(); f.setTime(at(12, 10)); await f.fire();
  assert.equal(f.notifications.length, 1); assert.equal(f.data.progress.confirmedMl, 0);
  assert.equal(f.data.pendingReminder.time, '12:15'); assert.equal(f.data.progress.awaiting.attempts, 1);
});

test('结束时间后不再催促，保留当前待确认；最后一次可晚确认，下一轮完整新目标', async () => {
  const f = fixture(); await f.controller.saveSettings({...DEFAULT_SETTINGS, endTime: '09:30'});
  f.setTime(at(9, 30)); await f.fire();
  assert.equal(f.data.progress.awaiting.amountMl, 2000);
  assert.equal(f.data.pendingReminder.at, at(9, 30, 15).getTime());
  f.setTime(at(9, 40)); const state = await f.confirm();
  assert.equal(state.progress.confirmedMl, 2000); assert.equal(state.awaitingReminder, null);
  assert.equal(state.nextReminder.at, at(9, 30, 15).getTime());
});

test('最后一次闹钟允许正常毫秒延迟；明显超出结束时段不补发', async () => {
  const f = fixture(); await f.controller.saveSettings({...DEFAULT_SETTINGS, endTime: '09:30'});
  f.setTime(new Date(at(9, 30).getTime() + 100)); await f.fire(); assert.equal(f.notifications.length, 1);
  const g = fixture(); await g.controller.saveSettings({...DEFAULT_SETTINGS, endTime: '09:30'});
  g.setTime(at(10)); await g.fire(); assert.equal(g.notifications.length, 0);
  assert.equal(g.data.pendingReminder.at, at(9, 30, 15).getTime());
});

test('新一轮记录上一轮已确认和未确认量，不把遗忘的水量计入或叠加至下一天', async () => {
  const f = fixture(); await f.controller.initialize(); f.setTime(at(9, 30)); await f.fire(); await f.confirm();
  f.setTime(at(10)); await f.fire(); const oldId = f.data.progress.awaiting.id;
  f.setTime(at(9, 0, 15)); const state = await f.controller.getState();
  assert.equal(state.progress.confirmedMl, 0); assert.equal(state.awaitingReminder, null);
  assert.equal(state.previousDay.confirmedMl, 112); assert.ok(state.previousDay.unconfirmedMl > 0);
  assert.equal((await f.controller.confirmReminder(oldId)).confirmed, false);
  assertBudget(state);
});

test('跨午夜期间属于同一饮水日，午夜后五分钟催促和确认正确重排', async () => {
  const f = fixture(); f.setTime(at(23));
  await f.controller.saveSettings({...DEFAULT_SETTINGS, totalMl: 1000, startTime: '23:00', endTime: '01:00'});
  f.setTime(at(23, 30)); await f.fire(); const key = f.data.progress.cycleKey;
  f.setTime(at(0, 5, 15)); await f.fire();
  assert.equal(f.data.progress.cycleKey, key); assert.equal(f.data.progress.awaiting.amountMl, 250);
  f.setTime(at(0, 7, 15)); const state = await f.confirm();
  assert.equal(state.nextReminder.time, '00:37'); assert.equal(state.nextReminder.amountMl, 375); assertBudget(state);
});

test('测试提醒连续创建新通知，手动确认测试不记水量，也不改变正式催促', async () => {
  const f = fixture(); await f.controller.initialize(); const original = structuredClone(f.data.pendingReminder);
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await f.controller.testNotification()).notificationId);
  assert.equal(new Set(ids).size, 3); assert.equal(f.activeNotifications.size, 1);
  await f.controller.confirmNotification(ids.at(-1));
  assert.equal(f.data.progress.confirmedMl, 0); assert.deepEqual(f.data.pendingReminder, original); assert.equal(f.activeNotifications.size, 0);
  f.setTime(at(9, 30)); await f.fire(); const awaiting = structuredClone(f.data.progress.awaiting);
  await f.controller.testNotification(); await f.controller.dismissTestReminder();
  assert.deepEqual(f.data.progress.awaiting, awaiting); assert.equal(f.data.pendingReminder.kind, 'retry');
});

test('系统通知失败仍保留待确认并五分钟重试，面板确认仍有效', async () => {
  const f = fixture(); await f.controller.initialize(); f.failNotification(); f.setTime(at(9, 30)); await f.fire();
  assert.match(f.data.lastError, /失败/); assert.ok(f.data.progress.awaiting); assert.equal(f.data.pendingReminder.time, '09:35');
  await f.confirm(); assert.equal(f.data.progress.confirmedMl, 112);
});

test('通知拒绝时仍可显示动画，动画确认后清理所有相关标签页；网页不可注入仍发系统通知', async () => {
  const f = fixture(); await f.controller.saveSettings({...DEFAULT_SETTINGS, animationEnabled: true}); f.setPermission('denied');
  f.setTime(at(9, 30)); await f.fire(); assert.equal(f.animations.length, 1); assert.equal(f.data.lastReminder.animationShown, true);
  const id = f.data.progress.awaiting.id; assert.equal(f.animations[0].id, id);
  await f.confirm(); assert.ok(f.dismissed.includes(id)); assert.equal(f.data.progress.confirmedMl, 112);
  f.setPermission('granted'); f.api.scripting.executeScript = async () => {throw new Error('Restricted page');};
  assert.ok((await f.controller.testNotification()).notificationId);
});

test('无效设置不更改现有记录和闹钟；旧设置仍兼容关闭动画', async () => {
  const f = fixture(); await f.controller.initialize(); const before = structuredClone(f.data);
  await assert.rejects(f.controller.saveSettings({...DEFAULT_SETTINGS, restPeriods: [rest('09:00', '18:01')]}), /覆盖/);
  assert.deepEqual(f.data, before); assert.equal(f.alarms.size, 1);
  const {animationEnabled, ...legacy} = DEFAULT_SETTINGS;
  await f.controller.saveSettings(legacy); assert.equal(f.data.settings.animationEnabled, false);
  assert.ok([...f.alarms.keys()].every(name => name.startsWith(ALARM_PREFIX)));
});
