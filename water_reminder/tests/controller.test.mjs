import test from 'node:test';
import assert from 'node:assert/strict';
import {createController, ALARM_PREFIX} from '../controller.mjs';
import {DEFAULT_SETTINGS} from '../schedule.mjs';

function fixture() {
  let time = new Date(2026, 9, 14, 9);
  const data = {}, alarms = new Map(), notifications = [], activeNotifications = new Map(), clearedNotifications = [], animations = [];
  let permission = 'granted';
  const api = {
    storage: {local: {
      get: async keys => Object.fromEntries((typeof keys === 'string' ? [keys] : keys).map(key => [key, structuredClone(data[key])])),
      set: async value => Object.assign(data, structuredClone(value))
    }},
    alarms: {
      getAll: async () => [...alarms.values()], get: async name => alarms.get(name),
      clear: async name => alarms.delete(name),
      create: async (name, info) => alarms.set(name, {name, scheduledTime: info.when})
    },
    action: {setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {}},
    notifications: {
      getPermissionLevel: async () => permission,
      create: async options => {
        const id = `generated-${notifications.length + 1}`;
        notifications.push({id, options});
        activeNotifications.set(id, options);
        return id;
      },
      clear: async id => {
        clearedNotifications.push(id);
        return activeNotifications.delete(id);
      }
    },
    runtime: {getURL: path => `chrome-extension://test/${path}`},
    tabs: {query: async () => [{id: 12, url: 'https://example.com/'}]},
    scripting: {executeScript: async options => {animations.push(options.args[0]); return [{result: true}];}}
  };
  const controller = createController(api, () => new Date(time));
  return {controller, api, data, alarms, notifications, activeNotifications, clearedNotifications, animations,
    setTime: value => {time = value;}, setPermission: value => {permission = value;},
    fire: async () => {
      const alarm = [...alarms.values()][0];
      alarms.delete(alarm.name);
      await controller.onAlarm(alarm);
      return alarm;
    }
  };
}

test('开启动画后测试与定时提醒均播放动画，休息期间不播放', async () => {
  const f = fixture();
  await f.controller.saveSettings({...DEFAULT_SETTINGS, animationEnabled: true, restPeriods: [{startTime: '09:31', endTime: '10:00'}]});
  const original = structuredClone(f.data.pendingReminder);
  assert.equal((await f.controller.testNotification()).animation.shown, true);
  assert.equal(f.animations[0].test, true);
  assert.deepEqual(f.data.pendingReminder, original);
  f.setTime(new Date(2026, 9, 14, 9, 32));
  await f.fire();
  assert.equal(f.animations.length, 1);
  f.setTime(new Date(2026, 9, 14, 10));
  await f.fire();
  assert.equal(f.animations.length, 2);
  assert.equal(f.animations[1].test, false);
  assert.equal(f.data.lastReminder.animationShown, true);
});

test('系统通知权限拒绝时仍能显示动画；网页无法注入时仍正常发送通知', async () => {
  const f = fixture();
  await f.controller.saveSettings({...DEFAULT_SETTINGS, animationEnabled: true});
  f.setPermission('denied');
  const testResult = await f.controller.testNotification();
  assert.equal(testResult.animation.shown, true);
  assert.equal(testResult.notificationId, null);
  assert.match(testResult.notificationError, /通知权限/);
  f.setTime(new Date(2026, 9, 14, 9, 30));
  await f.fire();
  assert.equal(f.data.lastReminder.animationShown, true);
  assert.equal(f.data.pendingReminder.time, '10:00');
  f.setPermission('granted');
  f.api.scripting.executeScript = async () => {throw new Error('Restricted page');};
  const fallback = await f.controller.testNotification();
  assert.ok(fallback.notificationId);
  assert.equal(fallback.animation.shown, false);
  assert.equal(fallback.notificationError, null);
});

test('关闭动画不注入网页，兼容旧设置，非法开关不能保存', async () => {
  const f = fixture();
  await f.controller.initialize();
  const result = await f.controller.testNotification();
  assert.equal(result.animation.reason, 'disabled');
  assert.equal(f.animations.length, 0);
  const {animationEnabled, ...legacy} = DEFAULT_SETTINGS;
  await f.controller.saveSettings(legacy);
  assert.equal(f.data.settings.animationEnabled, false);
  await assert.rejects(f.controller.saveSettings({...DEFAULT_SETTINGS, animationEnabled: 'true'}), /网页动画/);
});

test('连续发送测试通知使用新的 ID，清理上一条且不改变饮水计划，Worker 重启后仍可重复测试', async () => {
  const f = fixture();
  await f.controller.initialize();
  const original = structuredClone(f.data.pendingReminder);
  const ids = [];
  for (let index = 0; index < 3; index++) {
    const result = await f.controller.testNotification();
    ids.push(result.notificationId);
    assert.equal(f.activeNotifications.size, 1);
    assert.ok(f.activeNotifications.has(result.notificationId));
  }
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(f.clearedNotifications, ['water-reminder-test', ids[0], ids[1]]);
  const restarted = createController(f.api, () => new Date(2026, 9, 14, 9));
  const result = await restarted.testNotification();
  assert.ok(!ids.includes(result.notificationId));
  assert.equal(f.activeNotifications.size, 1);
  assert.equal(f.clearedNotifications.at(-1), ids.at(-1));
  assert.deepEqual(f.data.pendingReminder, original);
});

test('两次定时提醒创建不同通知，清理上一条正式提醒，暂停时也清理当前提醒', async () => {
  const f = fixture();
  await f.controller.initialize();
  await f.controller.testNotification();
  const testId = f.data.lastTestNotificationId;
  f.setTime(new Date(2026, 9, 14, 9, 30));
  await f.fire();
  const firstId = f.data.lastNotificationId;
  f.setTime(new Date(2026, 9, 14, 10));
  await f.fire();
  assert.notEqual(f.data.lastNotificationId, firstId);
  assert.ok(!f.activeNotifications.has(firstId));
  assert.ok(f.activeNotifications.has(testId));
  assert.ok(f.activeNotifications.has(f.data.lastNotificationId));
  await f.controller.saveSettings({...DEFAULT_SETTINGS, enabled: false});
  assert.ok(!f.activeNotifications.has(f.data.lastNotificationId));
  assert.equal(f.activeNotifications.size, 1);
});

test('添加休息后立即重排且保存设置，休息内重启仍跳至下一有效时点', async () => {
  const f = fixture();
  await f.controller.initialize();
  const previous = [...f.alarms.values()][0];
  await f.controller.saveSettings({...DEFAULT_SETTINGS, restPeriods: [{startTime: '09:30', endTime: '10:00'}]});
  assert.equal(f.data.pendingReminder.time, '10:00');
  assert.equal(f.data.pendingReminder.count, 17);
  assert.equal(f.data.settings.restPeriods.length, 1);
  f.setTime(new Date(2026, 9, 14, 9, 45));
  await f.controller.onAlarm(previous);
  assert.equal(f.notifications.length, 0);
  f.alarms.clear();
  const restarted = createController(f.api, () => new Date(2026, 9, 14, 9, 45));
  await restarted.initialize();
  assert.equal(f.data.pendingReminder.time, '10:00');
  assert.equal(f.alarms.size, 1);
});

test('提醒延迟进入休息时不通知，休息结束的有效提醒正常通知', async () => {
  const f = fixture();
  await f.controller.saveSettings({...DEFAULT_SETTINGS, restPeriods: [{startTime: '09:31', endTime: '10:00'}]});
  f.setTime(new Date(2026, 9, 14, 9, 32));
  await f.fire();
  assert.equal(f.notifications.length, 0);
  assert.equal(f.data.pendingReminder.time, '10:00');
  f.setTime(new Date(2026, 9, 14, 10, 0));
  await f.fire();
  assert.equal(f.notifications.length, 1);
});

test('休息覆盖所有提醒时拒绝保存，现有设置与闹钟保持有效', async () => {
  const f = fixture();
  await f.controller.initialize();
  const before = structuredClone(f.data);
  await assert.rejects(f.controller.saveSettings({...DEFAULT_SETTINGS, restPeriods: [{startTime: '09:00', endTime: '18:01'}]}), /覆盖了全部提醒/);
  assert.deepEqual(f.data, before);
  assert.equal(f.alarms.size, 1);
});

test('首次启动保存默认值，worker 多次唤醒保留唯一闹钟，闹钟丢失可重建', async () => {
  const f = fixture();
  await f.controller.initialize();
  assert.deepEqual(f.data.settings, DEFAULT_SETTINGS);
  const expected = f.data.pendingReminder.at;
  await Promise.all([f.controller.initialize(), f.controller.getState()]);
  assert.equal(f.alarms.size, 1);
  assert.equal(f.data.pendingReminder.at, expected);
  f.alarms.clear();
  await f.controller.initialize();
  assert.equal(f.alarms.size, 1);
  assert.equal([...f.alarms.values()][0].scheduledTime, expected);
});

test('到点通知包含本次/累计毫升，随后调度下一次，重复事件不重复通知', async () => {
  const f = fixture();
  await f.controller.initialize();
  f.setTime(new Date(2026, 9, 14, 9, 30));
  const alarm = await f.fire();
  assert.equal(f.notifications.length, 1);
  assert.match(f.notifications[0].options.title, /112 ml/);
  assert.match(f.notifications[0].options.message, /112 \/ 2000 ml/);
  assert.equal(f.data.pendingReminder.time, '10:00');
  await f.controller.onAlarm(alarm);
  assert.equal(f.notifications.length, 1);
});

test('暂停清理闹钟，恢复及更改设置立即重排，旧事件不会发通知', async () => {
  const f = fixture();
  await f.controller.initialize();
  const old = [...f.alarms.values()][0];
  await f.controller.saveSettings({...DEFAULT_SETTINGS, enabled: false});
  assert.equal(f.alarms.size, 0);
  assert.equal(f.data.pendingReminder, null);
  await f.controller.onAlarm(old);
  await f.controller.saveSettings({...DEFAULT_SETTINGS, totalMl: 1800, startTime: '10:00'});
  assert.equal(f.data.pendingReminder.time, '10:30');
  f.setTime(new Date(2026, 9, 14, 9, 30));
  await f.controller.onAlarm(old);
  assert.equal(f.notifications.length, 0);
});

test('长时间休眠跳过遗漏提醒，不集中补发；五分钟内延迟只提醒一次', async () => {
  const f = fixture();
  await f.controller.initialize();
  f.setTime(new Date(2026, 9, 14, 11, 10));
  await f.fire();
  assert.equal(f.notifications.length, 0);
  assert.equal(f.data.pendingReminder.time, '11:30');
  f.setTime(new Date(2026, 9, 14, 11, 32));
  await f.fire();
  assert.equal(f.notifications.length, 1);
  assert.equal(f.data.pendingReminder.time, '12:00');
});

test('到点 worker 恢复与闹钟事件并发时不会丢失通知', async () => {
  const f = fixture();
  await f.controller.initialize();
  const alarm = [...f.alarms.values()][0];
  f.alarms.clear();
  f.setTime(new Date(2026, 9, 14, 9, 30));
  const restarted = createController(f.api, () => new Date(2026, 9, 14, 9, 30));
  await Promise.all([restarted.initialize(), restarted.onAlarm(alarm)]);
  assert.equal(f.notifications.length, 1);
  assert.equal(f.alarms.size, 1);
  assert.equal(f.data.pendingReminder.time, '10:00');
});

test('拒绝通知权限时保留错误且继续调度，测试通知不会改变计划', async () => {
  const f = fixture();
  await f.controller.initialize();
  const original = f.data.pendingReminder.at;
  await f.controller.testNotification();
  assert.equal(f.data.pendingReminder.at, original);
  f.setPermission('denied');
  await assert.rejects(f.controller.testNotification(), /通知权限/);
  f.setTime(new Date(2026, 9, 14, 9, 30));
  await f.fire();
  assert.match(f.data.lastError, /通知权限/);
  assert.equal(f.data.pendingReminder.time, '10:00');
  assert.equal(f.notifications.length, 1);
});

test('最后一次提醒后调度次日，无效设置不改变已保存计划', async () => {
  const f = fixture();
  await f.controller.saveSettings({...DEFAULT_SETTINGS, startTime: '09:00', endTime: '09:30'});
  f.setTime(new Date(2026, 9, 14, 9, 30));
  await f.fire();
  assert.equal(f.data.pendingReminder.at, new Date(2026, 9, 15, 9, 30).getTime());
  await assert.rejects(f.controller.saveSettings({...DEFAULT_SETTINGS, totalMl: 0}));
  assert.equal(f.data.settings.endTime, '09:30');
  assert.ok([...f.alarms.keys()].every(name => name.startsWith(ALARM_PREFIX)));
});
