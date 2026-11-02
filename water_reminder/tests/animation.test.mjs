import test from 'node:test';
import assert from 'node:assert/strict';
import {showAnimationInActiveTab, showWaterAnimation} from '../animation.mjs';

test('仅向最后聚焦窗口的当前网页主框架注入，传入本次饮水量和测试状态', async () => {
  const slot = {amountMl: 125, index: 2, count: 16, cumulativeMl: 250};
  const calls = [];
  const api = {
    tabs: {query: async filter => {assert.deepEqual(filter, {active: true, lastFocusedWindow: true}); return [{id: 12, url: 'https://example.com/'}];}},
    scripting: {executeScript: async options => {calls.push(options); return [{result: true}];}},
    runtime: {getURL: path => `chrome-extension://test/${path}`}
  };
  assert.deepEqual(await showAnimationInActiveTab(api, slot, true), {shown: true, tabId: 12});
  assert.equal(calls[0].func, showWaterAnimation);
  assert.deepEqual(calls[0].target, {tabId: 12});
  assert.deepEqual(calls[0].args, [{...slot, test: true, mascotUrl: 'chrome-extension://test/assets/doraemon-water.png'}]);
});

test('没有网页、内置页、文件页和未知网址不注入动画', async () => {
  for (const tab of [null, {id: 12, url: 'chrome://extensions/'}, {id: 12, url: 'file:///a.html'}, {id: 12}]) {
    const api = {
      tabs: {query: async () => tab ? [tab] : []},
      scripting: {executeScript: async () => {throw new Error('不应注入');}}
    };
    assert.deepEqual(await showAnimationInActiveTab(api, {}), {shown: false, reason: 'unsupported-page'});
  }
});

test('网页隐藏、权限拒绝和标签页关闭不会中断后台提醒', async () => {
  const api = {
    tabs: {query: async () => [{id: 12, url: 'https://example.com/'}]},
    scripting: {executeScript: async () => [{result: false}]},
    runtime: {getURL: path => `chrome-extension://test/${path}`}
  };
  assert.deepEqual(await showAnimationInActiveTab(api, {}), {shown: false, reason: 'hidden-page'});
  api.scripting.executeScript = async () => {throw new Error('Missing host permission');};
  assert.deepEqual(await showAnimationInActiveTab(api, {}), {shown: false, reason: 'page-unavailable'});
  api.tabs.query = async () => {throw new Error('Window closed');};
  assert.deepEqual(await showAnimationInActiveTab(api, {}), {shown: false, reason: 'page-unavailable'});
});
