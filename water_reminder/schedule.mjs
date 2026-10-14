export const DEFAULT_SETTINGS = Object.freeze({
  totalMl: 2000, startTime: '09:00', endTime: '18:00', enabled: true, restPeriods: Object.freeze([]), animationEnabled: false
});
export const INTERVAL_MINUTES = 30;

export function timeMinutes(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error('请选择有效的开始时间和结束时间。');
  }
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

// Rest periods repeat daily: include their start, exclude their end.
export function isRestTime(settings, minutes) {
  return (settings.restPeriods ?? []).some(period => {
    const start = timeMinutes(period.startTime);
    const end = timeMinutes(period.endTime);
    return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
  });
}

function reminderOffsets(settings) {
  const start = timeMinutes(settings.startTime);
  const duration = (timeMinutes(settings.endTime) - start + 1440) % 1440;
  return Array.from({length: Math.ceil(duration / INTERVAL_MINUTES)}, (_, index) =>
    Math.min((index + 1) * INTERVAL_MINUTES, duration)
  ).filter(offset => !isRestTime(settings, (start + offset) % 1440));
}

export function validateSettings(value) {
  if (!value || !Number.isInteger(value.totalMl) || value.totalMl < 1 || value.totalMl > 20000) {
    throw new Error('每日目标请输入 1–20000 之间的整数（ml）。');
  }
  const start = timeMinutes(value.startTime);
  const end = timeMinutes(value.endTime);
  if (start === end) throw new Error('开始时间和结束时间不能相同。');
  if (typeof value.enabled !== 'boolean') throw new Error('提醒开关无效。');
  const animationEnabled = value.animationEnabled === undefined ? false : value.animationEnabled;
  if (typeof animationEnabled !== 'boolean') throw new Error('网页动画开关无效。');
  const periods = value.restPeriods === undefined ? [] : value.restPeriods;
  if (!Array.isArray(periods)) throw new Error('休息时间设置无效。');
  const restPeriods = periods.map((period, index) => {
    if (!period || typeof period !== 'object') throw new Error(`第 ${index + 1} 段休息时间无效。`);
    try {
      if (timeMinutes(period.startTime) === timeMinutes(period.endTime)) {
        throw new Error('开始时间和结束时间不能相同。');
      }
    } catch (error) {
      throw new Error(`第 ${index + 1} 段休息时间：${error.message}`);
    }
    return {startTime: period.startTime, endTime: period.endTime};
  });
  const valid = {totalMl: value.totalMl, startTime: value.startTime, endTime: value.endTime, enabled: value.enabled, restPeriods, animationEnabled};
  const count = reminderOffsets(valid).length;
  if (count === 0) throw new Error('休息时间覆盖了全部提醒，请缩短休息时间或调整饮水时段。');
  if (value.totalMl < count) throw new Error(`此时段有 ${count} 次提醒，目标至少需要 ${count} ml。`);
  return valid;
}

// Split into integer millilitres without losing any of the daily target.
export function plan(settings) {
  const valid = validateSettings(settings);
  const start = timeMinutes(valid.startTime);
  const offsets = reminderOffsets(valid);
  const count = offsets.length;
  let cumulativeMl = 0;
  return offsets.map((offsetMinutes, index) => {
    const amountMl = Math.floor(valid.totalMl / count) + (index < valid.totalMl % count ? 1 : 0);
    cumulativeMl += amountMl;
    const clock = (start + offsetMinutes) % 1440;
    return {
      index: index + 1, count, offsetMinutes, amountMl, cumulativeMl,
      time: `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`,
      nextDay: start + offsetMinutes >= 1440
    };
  });
}

export function scheduleForDate(settings, date) {
  const start = timeMinutes(settings.startTime);
  // Use local calendar dates, including overnight plans and daylight saving changes.
  return plan(settings).map(slot => {
    const at = new Date(date);
    at.setHours(0, start + slot.offsetMinutes, 0, 0);
    return {...slot, at: at.getTime(), totalMl: settings.totalMl};
  });
}

export function nextReminder(settings, now = new Date()) {
  if (!settings.enabled) return null;
  const candidates = [];
  for (const dayOffset of [-1, 0, 1]) {
    const date = new Date(now);
    date.setDate(date.getDate() + dayOffset);
    candidates.push(...scheduleForDate(settings, date));
  }
  return candidates.filter(slot => slot.at > now.getTime()).sort((a, b) => a.at - b.at)[0] ?? null;
}
