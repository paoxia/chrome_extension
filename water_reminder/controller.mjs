import {DEFAULT_SETTINGS, validateSettings, nextReminder, plan, isRestTime} from './schedule.mjs';
import {showAnimationInActiveTab} from './animation.mjs';

export const ALARM_PREFIX = 'water-reminder:';
export const NOTIFICATION_ID = 'water-reminder';
const MAX_DELAY_MS = 5 * 60 * 1000;

export function createController(api, clock = () => new Date()) {
  let queue = Promise.resolve();
  const run = operation => {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };

  async function settings() {
    const stored = await api.storage.local.get('settings');
    return validateSettings(stored.settings ?? DEFAULT_SETTINGS);
  }

  async function reconcile(force = false) {
    const current = await settings();
    const now = clock();
    const stored = await api.storage.local.get('pendingReminder');
    let pending = stored.pendingReminder;
    if (force || !current.enabled || !pending || now.getTime() - pending.at > MAX_DELAY_MS) {
      pending = nextReminder(current, now);
    }
    const name = pending ? `${ALARM_PREFIX}${pending.at}` : null;
    for (const alarm of await api.alarms.getAll()) {
      if (alarm.name.startsWith(ALARM_PREFIX) && alarm.name !== name) await api.alarms.clear(alarm.name);
    }
    await api.storage.local.set({settings: current, pendingReminder: pending});
    if (pending && !await api.alarms.get(name)) {
      await api.alarms.create(name, {when: Math.max(pending.at, now.getTime() + 1000)});
    }
    await api.action.setBadgeText({text: current.enabled ? '' : 'Ⅱ'});
    await api.action.setBadgeBackgroundColor({color: '#64748b'});
    await api.action.setTitle({title: current.enabled ? '喝水提醒 · 每半小时一杯水' : '喝水提醒 · 已暂停'});
    return {settings: current, nextReminder: pending};
  }

  async function notify(slot, test = false) {
    if (await api.notifications.getPermissionLevel() !== 'granted') {
      throw new Error('通知权限未开启，请允许 Chrome 发送系统通知。');
    }
    const storageKey = test ? 'lastTestNotificationId' : 'lastNotificationId';
    const stored = await api.storage.local.get(storageKey);
    // Clear the previous notification, including IDs used by older versions.
    await api.notifications.clear(stored[storageKey] ?? (test ? 'water-reminder-test' : NOTIFICATION_ID));
    // Let Chrome generate a fresh ID so native systems treat each send as new.
    const notificationId = await api.notifications.create({
      type: 'basic', iconUrl: api.runtime.getURL('icons/icon128.png'),
      title: test ? '喝水提醒 · 测试通知' : `该喝水啦，喝 ${slot.amountMl} ml`,
      message: test
        ? `通知已就绪。按当前计划，每次约喝 ${slot.amountMl} ml。`
        : `第 ${slot.index}/${slot.count} 次提醒 · 本次 ${slot.amountMl} ml\n按计划累计应喝 ${slot.cumulativeMl} / ${slot.totalMl} ml。`,
      priority: 1
    });
    await api.storage.local.set({[storageKey]: notificationId});
    return notificationId;
  }

  async function deliver(slot, current, test = false) {
    const [notification, animation] = await Promise.allSettled([
      notify(slot, test),
      current.animationEnabled ? showAnimationInActiveTab(api, slot, test) : Promise.resolve({shown: false, reason: 'disabled'})
    ]);
    const animationResult = animation.status === 'fulfilled' ? animation.value : {shown: false, reason: 'page-unavailable'};
    if (notification.status === 'rejected' && !animationResult.shown) throw notification.reason;
    return {
      notificationId: notification.status === 'fulfilled' ? notification.value : null,
      notificationError: notification.status === 'rejected' ? notification.reason.message : null,
      animation: animationResult
    };
  }

  return {
    initialize: () => run(() => reconcile()),
    getState: () => run(async () => ({
      ...await reconcile(),
      notificationPermission: await api.notifications.getPermissionLevel(),
      ...await api.storage.local.get(['lastReminder', 'lastError'])
    })),
    saveSettings: value => run(async () => {
      const valid = validateSettings(value);
      await api.storage.local.set({settings: valid, lastError: null});
      const {lastNotificationId} = await api.storage.local.get('lastNotificationId');
      await api.notifications.clear(lastNotificationId ?? NOTIFICATION_ID);
      return {...await reconcile(true), notificationPermission: await api.notifications.getPermissionLevel(), lastError: null};
    }),
    testNotification: () => run(async () => {
      const current = await settings();
      return {success: true, ...await deliver(plan(current)[0], current, true)};
    }),
    onAlarm: alarm => run(async () => {
      if (!alarm.name.startsWith(ALARM_PREFIX)) return;
      const current = await settings();
      const {pendingReminder: pending} = await api.storage.local.get('pendingReminder');
      if (!current.enabled || !pending || alarm.name !== `${ALARM_PREFIX}${pending.at}`) return;
      const delay = clock().getTime() - pending.at;
      if (delay < 0) return;
      // A sleeping computer should never cause a burst of missed reminders.
      try {
        const now = clock();
        if (delay <= MAX_DELAY_MS && !isRestTime(current, now.getHours() * 60 + now.getMinutes())) {
          const delivery = await deliver(pending, current);
          await api.storage.local.set({
            lastReminder: {...pending, sentAt: clock().getTime(), animationShown: delivery.animation.shown},
            lastError: delivery.notificationError
          });
        }
      } catch (error) {
        await api.storage.local.set({lastError: error.message});
      } finally {
        await api.storage.local.set({pendingReminder: null});
        await api.alarms.clear(alarm.name);
        await reconcile(true);
      }
    })
  };
}
