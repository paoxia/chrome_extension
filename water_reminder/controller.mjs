import {
  DEFAULT_SETTINGS, validateSettings, plan, currentCycle, followingCycle,
  remainingPlan, nextRetryAt, nextAllowedTime, clockLabel, isRestTime, INTERVAL_MINUTES
} from './schedule.mjs';
import {showAnimationInActiveTab, showActivityInActiveTab, dismissAnimationInTabs} from './animation.mjs';

export const ALARM_PREFIX = 'water-reminder:';
export const NOTIFICATION_ID = 'water-reminder';
const END_GRACE_MS = 5 * 60000;

export function createController(api, clock = () => new Date()) {
  let queue = Promise.resolve();
  const run = operation => {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };
  const alarmName = pending => `${ALARM_PREFIX}${pending.kind}:${pending.cycleKey}:${pending.reminderId ?? ''}:${pending.at}`;
  const activityAlarmName = activity => `${ALARM_PREFIX}activity:${activity.id}:${activity.endAt}`;

  function newProgress(cycle, now, previous, hasScheduledReminder) {
    return {
      cycleKey: cycle.key, startAt: cycle.startAt, endAt: cycle.endAt,
      anchorAt: Math.max(hasScheduledReminder ? cycle.startAt : Math.max(cycle.startAt, now), previous?.activityBreak?.endAt ?? 0),
      confirmedMl: 0, entries: [], awaiting: null, sequence: previous?.sequence ?? 0,
      activityBreak: previous?.activityBreak ?? null
    };
  }

  function futurePlan(current, progress) {
    const awaiting = progress.awaiting;
    const reserved = awaiting?.amountMl ?? 0;
    const base = progress.confirmedMl + reserved;
    const offset = progress.entries.length + (awaiting ? 1 : 0);
    const cycle = {key: progress.cycleKey, startAt: progress.startAt, endAt: progress.endAt};
    return remainingPlan(current, cycle, current.totalMl - base, progress.anchorAt).map(slot => ({
      ...slot, kind: 'drink', index: slot.index + offset, count: slot.count + offset, cumulativeMl: slot.cumulativeMl + base
    }));
  }

  async function clearReminder(awaiting) {
    if (!awaiting) return;
    const {lastNotificationId, lastNotificationReminderId} = await api.storage.local.get(['lastNotificationId', 'lastNotificationReminderId']);
    const ids = new Set(awaiting.notificationIds ?? []);
    if (lastNotificationReminderId === awaiting.id && lastNotificationId) ids.add(lastNotificationId);
    await Promise.allSettled([
      ...[...ids].map(id => api.notifications.clear(id)),
      dismissAnimationInTabs(api, awaiting.animationTabIds ?? [], awaiting.id)
    ]);
  }

  async function reconcile(force = false) {
    const stored = await api.storage.local.get(['settings', 'progress', 'pendingReminder']);
    const current = validateSettings(stored.settings ?? DEFAULT_SETTINGS);
    const now = clock().getTime();
    const cycle = currentCycle(current, new Date(now));
    let progress = stored.progress;
    let pending = stored.pendingReminder;
    if (!progress || progress.cycleKey !== cycle.key) {
      if (progress) {
        await api.storage.local.set({previousDay: {
          cycleKey: progress.cycleKey, confirmedMl: progress.confirmedMl,
          unconfirmedMl: progress.awaiting?.amountMl ?? 0, confirmedCount: progress.entries.length
        }});
        await clearReminder(progress.awaiting);
      }
      progress = newProgress(cycle, now, progress, pending?.cycleKey === cycle.key && pending.kind === 'drink');
      // A pre-scheduled next-day alarm remains valid during this rollover.
      if (pending?.cycleKey !== cycle.key) pending = null;
    }
    progress.startAt = cycle.startAt;
    progress.endAt = cycle.endAt;
    if (progress.activityBreak && progress.activityBreak.endAt <= now) {
      await clearReminder(progress.activityBreak);
      progress.activityBreak = null;
    }
    if (force) pending = null;
    const upcomingPlan = futurePlan(current, progress);
    if (progress.awaiting) progress.awaiting.count = progress.entries.length + 1 + upcomingPlan.length;

    if (!current.enabled) {
      pending = null;
    } else {
      const inWindow = now <= cycle.endAt;
      const endGrace = pending?.at === cycle.endAt && now - cycle.endAt <= END_GRACE_MS;
      const pendingValid = pending && (pending.cycleKey === cycle.key || pending.cycleKey === followingCycle(current, cycle).key)
        && (pending.cycleKey !== cycle.key || inWindow || endGrace)
        && (pending.kind === 'drink' ? !progress.awaiting || pending.cycleKey !== cycle.key
          : pending.kind === 'retry' && pending.reminderId === progress.awaiting?.id);
      if (!pendingValid) pending = null;
      if (!pending && progress.awaiting && inWindow) {
        const at = nextRetryAt(current, cycle, now);
        if (at !== null) pending = {
          ...progress.awaiting, at, time: clockLabel(at), kind: 'retry', reminderId: progress.awaiting.id, cycleKey: cycle.key
        };
      }
      if (!pending && !progress.awaiting && inWindow) pending = upcomingPlan[0] ?? null;
      if (!pending) {
        const nextCycle = followingCycle(current, cycle);
        const next = remainingPlan(current, nextCycle, current.totalMl, Math.max(nextCycle.startAt, progress.activityBreak?.endAt ?? 0))[0];
        pending = next ? {...next, kind: 'drink'} : null;
      }
    }
    const name = pending ? alarmName(pending) : null;
    const activityName = current.enabled && progress.activityBreak ? activityAlarmName(progress.activityBreak) : null;
    for (const alarm of await api.alarms.getAll()) {
      if (alarm.name.startsWith(ALARM_PREFIX) && alarm.name !== name && alarm.name !== activityName) await api.alarms.clear(alarm.name);
    }
    await api.storage.local.set({settings: current, progress, pendingReminder: pending});
    if (pending && !await api.alarms.get(name)) {
      await api.alarms.create(name, {when: Math.max(pending.at, now + 1000)});
    }
    if (activityName && !await api.alarms.get(activityName)) {
      await api.alarms.create(activityName, {when: progress.activityBreak.endAt});
    }
    const waiting = Boolean(progress.awaiting);
    await api.action.setBadgeText({text: !current.enabled ? 'Ⅱ' : waiting ? '!' : progress.activityBreak ? '休' : ''});
    await api.action.setBadgeBackgroundColor({color: waiting ? '#d88827' : '#64748b'});
    await api.action.setTitle({title: !current.enabled ? '喝水提醒 · 已暂停' : waiting ? '喝水提醒 · 等待确认已喝完'
      : progress.activityBreak ? `喝水提醒 · 活动休息至 ${clockLabel(progress.activityBreak.endAt)}` : '喝水提醒 · 每半小时一杯水'});
    return {settings: current, progress, awaitingReminder: progress.awaiting, activityBreak: progress.activityBreak, nextReminder: pending, upcomingPlan};
  }

  async function state() {
    return {
      ...await reconcile(), notificationPermission: await api.notifications.getPermissionLevel(),
      ...await api.storage.local.get(['lastReminder', 'lastError', 'previousDay'])
    };
  }

  async function notify(slot, test = false) {
    if (await api.notifications.getPermissionLevel() !== 'granted') {
      throw new Error('通知权限未开启，请允许 Chrome 发送系统通知。');
    }
    const storageKey = test ? 'lastTestNotificationId' : 'lastNotificationId';
    const stored = await api.storage.local.get(storageKey);
    await api.notifications.clear(stored[storageKey] ?? (test ? 'water-reminder-test' : NOTIFICATION_ID));
    const notificationId = await api.notifications.create({
      type: 'basic', iconUrl: api.runtime.getURL('icons/icon128.png'),
      title: test ? '喝水提醒 · 测试通知' : `${slot.attempts > 1 ? '还没确认哦，' : '该喝水啦，'}喝 ${slot.amountMl} ml`,
      message: test ? '点击「确认测试提醒」关闭；测试不会计入饮水量。'
        : `本次 ${slot.amountMl} ml · 已确认 ${slot.confirmedMl} / ${slot.totalMl} ml\n喝完后点击此通知或「已喝完」确认；未确认每 5 分钟再提醒。`,
      buttons: [{title: test ? '确认测试提醒' : `已喝完 ${slot.amountMl} ml`}],
      requireInteraction: true, priority: 1
    });
    await api.storage.local.set({[storageKey]: notificationId, ...(!test ? {lastNotificationReminderId: slot.id} : {})});
    return notificationId;
  }

  async function deliver(slot, current, test = false) {
    const [notification, animation] = await Promise.allSettled([
      notify(slot, test), current.animationEnabled ? showAnimationInActiveTab(api, slot, test)
        : Promise.resolve({shown: false, reason: 'disabled'})
    ]);
    const animationResult = animation.status === 'fulfilled' ? animation.value : {shown: false, reason: 'page-unavailable'};
    if (notification.status === 'rejected' && !animationResult.shown) throw notification.reason;
    return {
      notificationId: notification.status === 'fulfilled' ? notification.value : null,
      notificationError: notification.status === 'rejected' ? notification.reason.message : null,
      animation: animationResult
    };
  }

  async function confirm(reminderId) {
    const current = await reconcile();
    const progress = current.progress;
    const awaiting = progress.awaiting;
    if (!awaiting || awaiting.id !== reminderId) return {confirmed: false, ...await state()};
    progress.confirmedMl += awaiting.amountMl;
    progress.entries.push({id: awaiting.id, amountMl: awaiting.amountMl, confirmedAt: clock().getTime()});
    progress.awaiting = null;
    const now = clock().getTime();
    const minutes = current.settings.enabled ? current.settings.activityRestMinutes : 0;
    progress.activityBreak = minutes > 0 ? {
      id: `activity:${awaiting.id}`, startAt: now, endAt: now + minutes * 60000, minutes,
      notificationIds: [], animationTabIds: []
    } : null;
    progress.anchorAt = progress.activityBreak?.endAt ?? now;
    await api.storage.local.set({progress, pendingReminder: null, lastError: null});
    await clearReminder(awaiting);
    await reconcile(true);
    if (progress.activityBreak) await notifyActivity(progress.activityBreak, current.settings);
    return {confirmed: true, ...await state()};
  }

  async function notifyActivity(activity, settings) {
    const [notification, animation] = await Promise.allSettled([
      (async () => {
        if (await api.notifications.getPermissionLevel() !== 'granted') throw new Error('通知权限未开启，请允许 Chrome 发送系统通知。');
        return api.notifications.create({
          type: 'basic', iconUrl: api.runtime.getURL('icons/icon128.png'),
          title: `喝完水啦，起来活动 ${activity.minutes} 分钟`,
          message: `站起来走走、伸展一下，休息到 ${clockLabel(activity.endAt)}。休息结束后重新计算下一次喝水间隔。`,
          requireInteraction: false, priority: 1
        });
      })(),
      settings.animationEnabled ? showActivityInActiveTab(api, activity) : Promise.resolve({shown: false})
    ]);
    const {progress} = await api.storage.local.get('progress');
    if (progress?.activityBreak?.id !== activity.id) return;
    if (notification.status === 'fulfilled') progress.activityBreak.notificationIds.push(notification.value);
    if (animation.status === 'fulfilled' && animation.value.shown) progress.activityBreak.animationTabIds.push(animation.value.tabId);
    await api.storage.local.set({progress, lastError: notification.status === 'rejected' ? `活动提醒：${notification.reason.message}` : null});
  }

  async function dismissTest() {
    const stored = await api.storage.local.get(['lastTestNotificationId', 'lastTestAnimationTabIds']);
    await Promise.allSettled([
      api.notifications.clear(stored.lastTestNotificationId ?? 'water-reminder-test'),
      dismissAnimationInTabs(api, stored.lastTestAnimationTabIds ?? [], 'test')
    ]);
    return {success: true};
  }

  return {
    initialize: () => run(() => reconcile()), getState: () => run(state),
    confirmReminder: reminderId => run(() => confirm(reminderId)),
    dismissTestReminder: () => run(dismissTest),
    confirmNotification: notificationId => run(async () => {
      const current = await reconcile();
      if (current.awaitingReminder?.notificationIds.includes(notificationId)) return confirm(current.awaitingReminder.id);
      const {lastTestNotificationId, lastNotificationId, lastNotificationReminderId} = await api.storage.local.get(['lastTestNotificationId', 'lastNotificationId', 'lastNotificationReminderId']);
      if (notificationId === lastNotificationId && current.awaitingReminder?.id === lastNotificationReminderId) return confirm(lastNotificationReminderId);
      if (notificationId === lastTestNotificationId) return dismissTest();
      return {confirmed: false};
    }),
    saveSettings: value => run(async () => {
      const valid = validateSettings(value);
      const {progress} = await api.storage.local.get('progress');
      const sameCycle = progress?.cycleKey === currentCycle(valid, clock()).key;
      if (sameCycle && valid.totalMl < progress.confirmedMl + (progress.awaiting?.amountMl ?? 0)) {
        throw new Error(`新目标不能低于已确认和待确认的合计 ${progress.confirmedMl + (progress.awaiting?.amountMl ?? 0)} ml。`);
      }
      if (progress && sameCycle) {
        progress.anchorAt = Math.max(clock().getTime(), progress.activityBreak?.endAt ?? 0);
        await api.storage.local.set({progress});
        if (!valid.enabled || !valid.animationEnabled) await clearReminder(progress.awaiting);
        if (!valid.enabled || !valid.animationEnabled) await clearReminder(progress.activityBreak);
      }
      await api.storage.local.set({settings: valid, pendingReminder: null, lastError: null});
      await reconcile(true);
      return state();
    }),
    testNotification: () => run(async () => {
      const {settings: current} = await reconcile();
      const result = await deliver({...plan(current)[0], id: 'test'}, current, true);
      if (result.animation.shown) {
        const {lastTestAnimationTabIds = []} = await api.storage.local.get('lastTestAnimationTabIds');
        await api.storage.local.set({lastTestAnimationTabIds: [...new Set([...lastTestAnimationTabIds, result.animation.tabId])]});
      }
      return {success: true, ...result};
    }),
    onAlarm: alarm => run(async () => {
      if (!alarm.name.startsWith(ALARM_PREFIX)) return;
      if (alarm.name.startsWith(`${ALARM_PREFIX}activity:`)) {
        await reconcile();
        return;
      }
      const {pendingReminder: saved} = await api.storage.local.get('pendingReminder');
      if (!saved || alarm.name !== alarmName(saved)) return;
      const current = await reconcile();
      const pending = current.nextReminder;
      const now = clock().getTime();
      if (!current.settings.enabled || !pending || alarmName(pending) !== alarm.name || now < pending.at) return;
      const cycle = {key: current.progress.cycleKey, startAt: current.progress.startAt, endAt: current.progress.endAt};
      const allowed = nextAllowedTime(current.settings, cycle, now);
      const date = new Date(now);
      const endGrace = pending.at === cycle.endAt && now - cycle.endAt <= END_GRACE_MS
        && !isRestTime(current.settings, date.getHours() * 60 + date.getMinutes());
      if (allowed !== now && !endGrace) {
        // A delayed alarm inside a rest period is moved to the first allowed minute.
        await api.alarms.clear(alarm.name);
        if (allowed !== null) {
          current.progress.anchorAt = pending.kind === 'drink' ? allowed - INTERVAL_MINUTES * 60000 : now;
          const moved = pending.kind === 'drink' ? futurePlan(current.settings, current.progress)[0]
            : {...pending, at: allowed, time: clockLabel(allowed)};
          await api.storage.local.set({pendingReminder: moved, progress: current.progress});
          await reconcile();
        } else {
          await api.storage.local.set({pendingReminder: null});
          await reconcile(true);
        }
        return;
      }
      const progress = current.progress;
      if (!progress.awaiting) {
        progress.sequence++;
        progress.awaiting = {
          ...pending, id: `${cycle.key}:${progress.sequence}`, notificationIds: [], animationTabIds: [], attempts: 0
        };
      }
      progress.awaiting.attempts++;
      progress.awaiting.lastAttemptAt = now;
      progress.awaiting.confirmedMl = progress.confirmedMl;
      progress.awaiting.totalMl = current.settings.totalMl;
      progress.anchorAt = now;
      await api.storage.local.set({progress, pendingReminder: null});
      try {
        const delivery = await deliver(progress.awaiting, current.settings);
        if (delivery.notificationId) progress.awaiting.notificationIds.push(delivery.notificationId);
        if (delivery.animation.shown) progress.awaiting.animationTabIds = [...new Set([...progress.awaiting.animationTabIds, delivery.animation.tabId])];
        await api.storage.local.set({progress, lastReminder: {
          ...progress.awaiting, sentAt: now, animationShown: delivery.animation.shown
        }, lastError: delivery.notificationError});
      } catch (error) {
        await api.storage.local.set({lastError: error.message});
      } finally {
        await api.alarms.clear(alarm.name);
        await reconcile(true);
      }
    })
  };
}
