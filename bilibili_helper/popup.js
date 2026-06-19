const DEFAULT_RANGE = { value: 2, unit: 'day' };
const STORAGE_KEY = 'watchLaterRange';

function unitLabel(unit) {
  return unit === 'hour' ? '小时' : '天';
}

function loadRange() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const range = result[STORAGE_KEY];
      if (range && typeof range.value === 'number' && (range.unit === 'day' || range.unit === 'hour')) {
        resolve(range);
      } else {
        resolve(DEFAULT_RANGE);
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', async function() {
  const addWatchLaterBtn = document.getElementById('addWatchLaterBtn');
  const watchWatchLaterBtn = document.getElementById('watchWatchLaterBtn');
  const openWatchLaterBtn = document.getElementById('openWatchLaterBtn');
  const openOptionsBtn = document.getElementById('openOptionsBtn');
  const videoCount = document.getElementById('videoCount');
  const countLabel = document.getElementById('countLabel');
  const logArea = document.getElementById('logArea');

  function addLog(message, type = 'info') {
    const logItem = document.createElement('div');
    logItem.className = 'log-item' + (type !== 'info' ? ' ' + type : '');
    logItem.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logArea.appendChild(logItem);
    logArea.scrollTop = logArea.scrollHeight;
  }

  function updateLabel(range) {
    countLabel.textContent = `${range.value} ${unitLabel(range.unit)}内未观看的视频`;
  }

  function refreshCount() {
    chrome.runtime.sendMessage({ action: 'getVideoCount' }, function(response) {
      if (response && response.count !== undefined) {
        videoCount.textContent = response.count;
      }
    });
  }

  const initialRange = await loadRange();
  updateLabel(initialRange);
  refreshCount();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    const newRange = changes[STORAGE_KEY].newValue || DEFAULT_RANGE;
    updateLabel(newRange);
    videoCount.textContent = '...';
    refreshCount();
  });

  openOptionsBtn.addEventListener('click', function() {
    chrome.runtime.openOptionsPage();
  });

  addWatchLaterBtn.addEventListener('click', function() {
    addWatchLaterBtn.disabled = true;
    addWatchLaterBtn.textContent = '处理中...';
    addLog('开始扫描关注页面视频...');

    chrome.runtime.sendMessage({action: 'addWatchLater'}, function(response) {
      addWatchLaterBtn.disabled = false;
      addWatchLaterBtn.textContent = '一键添加到稍后观看';

      if (response && response.success) {
        addLog(`成功添加 ${response.count} 个视频到稍后观看`, 'success');
        videoCount.textContent = '0';
      } else {
        addLog('操作失败: ' + (response?.error || '未知错误'), 'error');
      }
    });
  });

  watchWatchLaterBtn.addEventListener('click', function() {
    chrome.tabs.create({url: 'https://www.bilibili.com/list/watchlater'});
  });

  openWatchLaterBtn.addEventListener('click', function() {
    chrome.tabs.create({url: 'https://www.bilibili.com/watchlater/list'});
  });
});
