document.addEventListener('DOMContentLoaded', function() {
  const checkinBtn = document.getElementById('checkinBtn');
  const addWatchLaterBtn = document.getElementById('addWatchLaterBtn');
  const checkinStatus = document.getElementById('checkinStatus');
  const checkinDays = document.getElementById('checkinDays');
  const videoCount = document.getElementById('videoCount');
  const logArea = document.getElementById('logArea');
  
  function addLog(message, type = 'info') {
    const logItem = document.createElement('div');
    logItem.className = 'log-item' + (type !== 'info' ? ' ' + type : '');
    logItem.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logArea.appendChild(logItem);
    logArea.scrollTop = logArea.scrollHeight;
  }
  
  function updateCheckinStatus(status, days) {
    checkinStatus.textContent = status ? '已签到' : '未签到';
    checkinStatus.className = 'status-value ' + (status ? 'success' : 'pending');
    checkinDays.textContent = days + ' 天';
  }
  
  function loadCheckinStatus() {
    chrome.storage.local.get(['checkinStatus', 'checkinDays', 'lastCheckinDate'], function(result) {
      const today = new Date().toDateString();
      const isTodayChecked = result.lastCheckinDate === today;
      updateCheckinStatus(isTodayChecked, result.checkinDays || 0);
    });
  }
  
  loadCheckinStatus();
  
  checkinBtn.addEventListener('click', function() {
    checkinBtn.disabled = true;
    checkinBtn.textContent = '签到中...';
    addLog('开始执行签到...');
    
    chrome.runtime.sendMessage({action: 'checkin'}, function(response) {
      checkinBtn.disabled = false;
      checkinBtn.textContent = '立即签到';
      
      if (response && response.success) {
        addLog('签到成功！', 'success');
        updateCheckinStatus(true, response.days || 1);
      } else {
        addLog('签到失败: ' + (response?.error || '未知错误'), 'error');
      }
    });
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
  
  chrome.runtime.sendMessage({action: 'getVideoCount'}, function(response) {
    if (response && response.count !== undefined) {
      videoCount.textContent = response.count;
    }
  });
});
