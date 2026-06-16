document.addEventListener('DOMContentLoaded', function() {
  const addWatchLaterBtn = document.getElementById('addWatchLaterBtn');
  const watchWatchLaterBtn = document.getElementById('watchWatchLaterBtn');
  const openWatchLaterBtn = document.getElementById('openWatchLaterBtn');
  const videoCount = document.getElementById('videoCount');
  const logArea = document.getElementById('logArea');
  
  function addLog(message, type = 'info') {
    const logItem = document.createElement('div');
    logItem.className = 'log-item' + (type !== 'info' ? ' ' + type : '');
    logItem.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logArea.appendChild(logItem);
    logArea.scrollTop = logArea.scrollHeight;
  }
  
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
  
  chrome.runtime.sendMessage({action: 'getVideoCount'}, function(response) {
    if (response && response.count !== undefined) {
      videoCount.textContent = response.count;
    }
  });
});