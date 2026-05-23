document.addEventListener('DOMContentLoaded', function() {
  const scanBtn = document.getElementById('scanBtn');
  const clearBtn = document.getElementById('clearBtn');
  const downloadAllBtn = document.getElementById('downloadAllBtn');
  const videoList = document.getElementById('videoList');
  const videoCount = document.getElementById('videoCount');
  const batchActions = document.getElementById('batchActions');
  
  let videos = [];
  
  function renderVideoList() {
    if (videos.length === 0) {
      videoList.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📭</span>
          <p>点击"扫描当前页面"检测视频</p>
        </div>
      `;
      batchActions.style.display = 'none';
      return;
    }
    
    videoList.innerHTML = videos.map((video, index) => `
      <div class="video-item" data-index="${index}">
        <input type="checkbox" class="video-checkbox" data-index="${index}">
        <div class="video-info">
          <div class="video-title">${video.title || '未知视频'}</div>
          <div class="video-meta">
            <span class="video-type">${video.type || 'MP4'}</span>
            <span>${formatSize(video.size)}</span>
          </div>
        </div>
        <div class="video-actions">
          <button class="btn btn-primary download-btn" data-index="${index}">迅雷下载</button>
        </div>
      </div>
    `).join('');
    
    videoCount.textContent = videos.length;
    batchActions.style.display = 'block';
    
    document.querySelectorAll('.download-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index);
        downloadWithThunder(videos[index].url);
      });
    });
    
    document.querySelectorAll('.video-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', updateBatchButton);
    });
  }
  
  function updateBatchButton() {
    const checked = document.querySelectorAll('.video-checkbox:checked').length;
    downloadAllBtn.textContent = checked > 0 
      ? `⚡ 迅雷下载 (${checked})` 
      : '⚡ 迅雷批量下载';
  }
  
  function formatSize(bytes) {
    if (!bytes) return '未知大小';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return bytes.toFixed(1) + ' ' + units[i];
  }
  
  function convertToThunder(url) {
    const thunderPrefix = 'thunder://';
    const encoded = btoa('AA' + url + 'ZZ');
    return thunderPrefix + encoded;
  }
  
  function downloadWithThunder(url) {
    const thunderUrl = convertToThunder(url);
    chrome.tabs.create({url: thunderUrl});
  }
  
  scanBtn.addEventListener('click', function() {
    scanBtn.disabled = true;
    videoList.innerHTML = '<div class="loading">正在扫描页面...</div>';
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const tab = tabs[0];
      
      if (tab.url.startsWith('chrome://')) {
        videoList.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">🚫</span>
            <p>无法在 Chrome 内置页面扫描</p>
          </div>
        `;
        scanBtn.disabled = false;
        return;
      }
      
      chrome.scripting.executeScript({
        target: {tabId: tab.id},
        files: ['content.js']
      }, () => {
        chrome.tabs.sendMessage(tab.id, {action: 'scanVideos'}, function(response) {
          scanBtn.disabled = false;
          
          if (chrome.runtime.lastError) {
            videoList.innerHTML = `
              <div class="empty-state">
                <span class="empty-icon">❌</span>
                <p>扫描失败：${chrome.runtime.lastError.message}</p>
              </div>
            `;
            return;
          }
          
          if (response && response.videos) {
            videos = response.videos;
            renderVideoList();
          } else {
            videoList.innerHTML = `
              <div class="empty-state">
                <span class="empty-icon">📭</span>
                <p>未检测到视频资源</p>
              </div>
            `;
          }
        });
      });
    });
  });
  
  clearBtn.addEventListener('click', function() {
    videos = [];
    renderVideoList();
    videoCount.textContent = '0';
  });
  
  downloadAllBtn.addEventListener('click', function() {
    const checkedBoxes = document.querySelectorAll('.video-checkbox:checked');
    const urlsToDownload = [];
    
    if (checkedBoxes.length === 0) {
      urlsToDownload.push(...videos.map(v => v.url));
    } else {
      checkedBoxes.forEach(checkbox => {
        const index = parseInt(checkbox.dataset.index);
        urlsToDownload.push(videos[index].url);
      });
    }
    
    urlsToDownload.forEach(url => downloadWithThunder(url));
  });
  
  chrome.storage.local.get(['cachedVideos'], function(result) {
    if (result.cachedVideos && result.cachedVideos.length > 0) {
      videos = result.cachedVideos;
      renderVideoList();
    }
  });
});
