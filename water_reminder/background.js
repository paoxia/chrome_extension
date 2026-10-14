import {createController} from './controller.mjs';

const controller = createController(chrome);
const reportError = error => console.error('喝水提醒：', error);

chrome.runtime.onInstalled.addListener(() => controller.initialize().catch(reportError));
chrome.runtime.onStartup.addListener(() => controller.initialize().catch(reportError));
chrome.alarms.onAlarm.addListener(alarm => controller.onAlarm(alarm).catch(reportError));
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  const actions = {
    getState: () => controller.getState(),
    saveSettings: () => controller.saveSettings(message.settings),
    testNotification: () => controller.testNotification()
  };
  if (!Object.hasOwn(actions, message?.action)) return;
  actions[message.action]().then(
    state => sendResponse({ok: true, ...state}),
    error => sendResponse({ok: false, error: error.message})
  );
  return true;
});

// MV3 workers may stop between events; recover missing alarms whenever they start.
controller.initialize().catch(reportError);
