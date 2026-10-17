import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS, plan, validateSettings, nextReminder, isRestTime, currentCycle, followingCycle, remainingPlan, nextRetryAt} from '../schedule.mjs';

const settings = overrides => ({...DEFAULT_SETTINGS, ...overrides});
const localDate = (day, hour, minute = 0) => new Date(2026, 9, day, hour, minute);
const rest = (startTime, endTime) => ({startTime, endTime});

test('确认时间为新的半小时起点，尾段对齐结束，整数剩余量精确均分', () => {
  const cycle = currentCycle(DEFAULT_SETTINGS, localDate(14, 9));
  const slots = remainingPlan(DEFAULT_SETTINGS, cycle, 1888, localDate(14, 9, 37).getTime());
  assert.equal(slots[0].time, '10:07');
  assert.equal(slots.at(-1).time, '18:00');
  assert.equal(slots.reduce((sum, slot) => sum + slot.amountMl, 0), 1888);
  assert.ok(slots.every(slot => slot.amountMl > 0));
  assert.deepEqual(remainingPlan(DEFAULT_SETTINGS, cycle, 0, cycle.startAt), []);
  assert.deepEqual(remainingPlan(DEFAULT_SETTINGS, cycle, 100, cycle.endAt), []);
});

test('极少剩余毫升也不会生成 0 ml 提醒，覆盖末次有效时点', () => {
  const cycle = currentCycle(DEFAULT_SETTINGS, localDate(14, 9));
  const slots = remainingPlan(DEFAULT_SETTINGS, cycle, 3, cycle.startAt);
  assert.equal(slots.length, 3);
  assert.ok(slots.every(slot => slot.amountMl === 1));
  assert.equal(slots.at(-1).time, '18:00');
});

test('五分钟重试避开重叠休息，跨午夜正确，结束之后无催促', () => {
  const current = settings({restPeriods: [rest('09:32', '09:45'), rest('09:40', '10:00')]});
  const cycle = currentCycle(current, localDate(14, 9));
  assert.equal(nextRetryAt(current, cycle, localDate(14, 9, 30).getTime()), localDate(14, 10).getTime());
  assert.equal(nextRetryAt(current, cycle, localDate(14, 17, 56).getTime()), null);
  const night = settings({startTime: '23:00', endTime: '01:00', restPeriods: [rest('23:55', '00:15')]});
  const nightCycle = currentCycle(night, localDate(14, 23, 50));
  assert.equal(nextRetryAt(night, nightCycle, localDate(14, 23, 50).getTime()), localDate(15, 0, 15).getTime());
  assert.equal(currentCycle(night, localDate(15, 0, 30)).key, nightCycle.key);
  assert.equal(followingCycle(night, nightCycle).startAt, localDate(15, 23).getTime());
});

test('午休跳过开始时点，结束时恢复，并将总量均分到剩余 16 次', () => {
  const current = settings({restPeriods: [rest('12:00', '13:00')]});
  const slots = plan(current);
  assert.equal(slots.length, 16);
  assert.ok(!slots.some(slot => ['12:00', '12:30'].includes(slot.time)));
  assert.ok(slots.some(slot => slot.time === '13:00'));
  assert.ok(slots.every(slot => slot.amountMl === 125));
  assert.equal(slots.at(-1).cumulativeMl, 2000);
  assert.equal(nextReminder(current, localDate(14, 12, 5)).time, '13:00');
});

test('多段和重叠休息按覆盖范围过滤，时段外休息不影响计划', () => {
  const current = settings({restPeriods: [rest('12:00', '13:00'), rest('12:30', '13:30'), rest('15:00', '15:30'), rest('20:00', '21:00')]});
  const slots = plan(current);
  assert.equal(slots.length, 14);
  assert.ok(!slots.some(slot => ['12:00', '12:30', '13:00', '15:00'].includes(slot.time)));
  assert.equal(slots.reduce((sum, slot) => sum + slot.amountMl, 0), 2000);
  assert.ok(slots.some(slot => slot.time === '13:30'));
});

test('非整点休息不平移半小时节奏，末次若在休息内也应排除', () => {
  const slots = plan(settings({restPeriods: [rest('12:10', '12:50'), rest('17:45', '18:30')]}));
  assert.ok(slots.some(slot => slot.time === '12:00'));
  assert.ok(!slots.some(slot => ['12:30', '12:50', '18:00'].includes(slot.time)));
  assert.equal(slots.at(-1).time, '17:30');
  assert.equal(slots.at(-1).cumulativeMl, 2000);
});

test('跨午夜休息覆盖两侧，开始包含、结束不包含', () => {
  const current = settings({startTime: '23:00', endTime: '01:00', restPeriods: [rest('23:45', '00:45')]});
  assert.deepEqual(plan(current).map(slot => slot.time), ['23:30', '01:00']);
  assert.equal(nextReminder(current, localDate(14, 0, 5)).time, '01:00');
  assert.equal(isRestTime(current, 23 * 60 + 45), true);
  assert.equal(isRestTime(current, 44), true);
  assert.equal(isRestTime(current, 45), false);
  assert.equal(isRestTime(current, 23 * 60 + 44), false);
});

test('兼容没有休息字段的旧设置；拒绝无效休息和全部覆盖', () => {
  const {restPeriods, ...legacy} = DEFAULT_SETTINGS;
  assert.deepEqual(validateSettings(legacy).restPeriods, []);
  for (const periods of [null, {}, [null], [rest('12:00', '')], [rest('12:00', '12:00')], [rest('09:00', '18:01')]]) {
    assert.throws(() => validateSettings(settings({restPeriods: periods})));
  }
  // Exactly ending at the daily end leaves the final reminder available.
  assert.equal(plan(settings({restPeriods: [rest('09:00', '18:00')]})).length, 1);
});

test('9–18 时段共 18 次，首次 9:30、末次 18:00，整数毫升精确合计 2000', () => {
  const slots = plan(DEFAULT_SETTINGS);
  assert.equal(slots.length, 18);
  assert.equal(slots[0].time, '09:30');
  assert.equal(slots.at(-1).time, '18:00');
  assert.equal(slots.reduce((sum, slot) => sum + slot.amountMl, 0), 2000);
  assert.equal(slots.at(-1).cumulativeMl, 2000);
  assert.ok(slots.every(slot => [111, 112].includes(slot.amountMl)));
});

test('尾段不足半小时仍在结束时间提醒，短时段仅一次', () => {
  assert.deepEqual(plan(settings({endTime: '10:10'})).map(slot => slot.time), ['09:30', '10:00', '10:10']);
  assert.deepEqual(plan(settings({endTime: '09:10'})).map(slot => slot.amountMl), [2000]);
});

test('跨午夜计划可找到前一天开始的时段，凌晨和当晚各归属正确', () => {
  const night = settings({startTime: '23:00', endTime: '01:00', totalMl: 1000});
  assert.deepEqual(plan(night).map(slot => [slot.time, slot.nextDay]), [
    ['23:30', false], ['00:00', true], ['00:30', true], ['01:00', true]
  ]);
  const next = nextReminder(night, localDate(14, 0, 5));
  assert.equal(next.at, localDate(14, 0, 30).getTime());
  assert.equal(next.index, 3);
  assert.equal(nextReminder(night, localDate(14, 1)).at, localDate(14, 23, 30).getTime());
});

test('设置、重启仅取未来时点，不追补之前的量；结束后转至次日', () => {
  assert.equal(nextReminder(DEFAULT_SETTINGS, localDate(14, 8)).at, localDate(14, 9, 30).getTime());
  assert.equal(nextReminder(DEFAULT_SETTINGS, localDate(14, 12, 10)).at, localDate(14, 12, 30).getTime());
  assert.equal(nextReminder(DEFAULT_SETTINGS, localDate(14, 18)).at, localDate(15, 9, 30).getTime());
  assert.equal(nextReminder(settings({enabled: false}), localDate(14, 12)), null);
});

test('拒绝空值、非整数、无效时间、相同时间及无法每次分配至少 1 ml 的目标', () => {
  for (const invalid of [null, settings({totalMl: 0}), settings({totalMl: 2.5}), settings({totalMl: 20001}),
    settings({startTime: '24:00'}), settings({endTime: ''}), settings({endTime: '09:00'}),
    settings({enabled: 'true'}), settings({totalMl: 10})]) {
    assert.throws(() => validateSettings(invalid));
  }
});

test('任意合法时长的整数分配都精确合计，间隔最多 30 分钟，末次对齐结束', () => {
  for (let duration = 1; duration < 1440; duration++) {
    const endTime = `${String(Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}`;
    const slots = plan(settings({startTime: '00:00', endTime, totalMl: 2003}));
    assert.equal(slots.reduce((sum, slot) => sum + slot.amountMl, 0), 2003);
    assert.equal(slots.at(-1).offsetMinutes, duration);
    assert.ok(slots.every((slot, index) => slot.offsetMinutes - (slots[index - 1]?.offsetMinutes ?? 0) <= 30));
  }
});
