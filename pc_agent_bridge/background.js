// background.js — entry point, wires modules together
const log = (...a) => console.log('[bg]', ...a);

chrome.runtime.onInstalled.addListener(() => log('installed'));
chrome.runtime.onStartup.addListener(() => log('startup'));
log('loaded');
