document.addEventListener('DOMContentLoaded', function() {
  const videoList = document.getElementById('videoList');
  const videoCount = document.getElementById('videoCount');
  const statusBadge = document.getElementById('statusBadge');
  const filterSelect = document.getElementById('filterSelect');
  const notice = document.getElementById('notice');

  let currentVideos = [];
  let isScanning = false;
  let minSizeMB = 0;
  const editedFilenames = new Map();
  let statusTimer = null;

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
  }

  function formatSize(bytes) {
    if (!bytes) return '未知大小';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function showStatus(text, type = '') {
    if (statusTimer) clearTimeout(statusTimer);
    statusBadge.textContent = type === 'error' ? '失败' : text;
    statusBadge.classList.remove('scanning', 'success', 'error');
    if (type) statusBadge.classList.add(type);
    notice.textContent = text;
    notice.classList.toggle('error', type === 'error');
    notice.hidden = false;
    statusTimer = setTimeout(() => {
      statusBadge.textContent = '就绪';
      statusBadge.classList.remove('scanning', 'success', 'error');
      notice.hidden = true;
    }, 3000);
  }

  function runDownload(button, message, idleIcon, successText) {
    button.disabled = true;
    button.textContent = '⏳';

    chrome.runtime.sendMessage(message, (response) => {
      button.disabled = false;
      if (chrome.runtime.lastError || !response?.success) {
        button.textContent = '✗';
        showStatus(response?.error || chrome.runtime.lastError?.message || '下载失败', 'error');
      } else {
        button.textContent = '✓';
        showStatus(successText, 'success');
      }

      setTimeout(() => {
        button.textContent = idleIcon;
      }, 2000);
    });
  }

  function renderVideos(videos) {
    currentVideos = videos;
    videoCount.textContent = videos.length;

    const minBytes = minSizeMB * 1024 * 1024;
    const filteredVideos = minSizeMB > 0
      ? videos.filter(v => v.size === null || v.size === undefined || v.size >= minBytes)
      : videos;

    const sortedVideos = [...filteredVideos].sort((a, b) => {
      const sizeA = a.size || 0;
      const sizeB = b.size || 0;
      return sizeB - sizeA;
    });
    
    if (sortedVideos.length === 0) {
      videoList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎬</div>
          <div class="empty-state-title">未检测到视频</div>
          <div class="empty-state-desc">正在自动检测当前页面视频...</div>
        </div>
      `;
      return;
    }

    videoList.innerHTML = '';
    sortedVideos.forEach(video => {
      const filename = editedFilenames.get(video.url) || video.filename || video.title;
      const escapedFilename = escapeHtml(filename);
      const escapedType = video.mimeType ? escapeHtml(video.mimeType.split('/')[1].toUpperCase()) : 'Video';
      
      const item = document.createElement('div');
      item.className = 'video-item';
      item.innerHTML = `
        <div class="video-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </div>
        <div class="video-info">
          <input class="video-name-input" title="可编辑下载文件名" value="${escapedFilename}">
          <div class="video-meta">
            <span class="video-size">${formatSize(video.size)}</span>
            <span class="video-type">${escapedType}</span>
          </div>
        </div>
        <div class="btn-group">
          <button class="action-btn download-btn" title="浏览器下载">⬇️</button>
          <button class="action-btn thunder-btn" title="迅雷下载">⚡</button>
        </div>
      `;

      const filenameInput = item.querySelector('.video-name-input');
      const downloadBtn = item.querySelector('.download-btn');
      const thunderBtn = item.querySelector('.thunder-btn');

      filenameInput.addEventListener('input', function() {
        editedFilenames.set(video.url, this.value);
      });

      downloadBtn.addEventListener('click', function() {
        runDownload(this, {
          action: 'downloadVideo',
          url: video.url,
          filename: filenameInput.value
        }, '⬇️', '已开始下载');
      });

      thunderBtn.addEventListener('click', function() {
        runDownload(this, {
          action: 'downloadVideoWithThunder',
          url: video.url,
          filename: filenameInput.value,
          size: video.size,
          referer: video.pageUrl,
          userAgent: navigator.userAgent
        }, '⚡', '已发送到迅雷');
      });
      
      videoList.appendChild(item);
    });
  }

  function loadVideos() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.runtime.sendMessage({
          action: 'getVideos',
          tabId: tabs[0].id
        }, (response) => {
          if (response && response.videos) {
            renderVideos(response.videos.map(video => ({
              ...video,
              pageUrl: video.pageUrl || tabs[0].url || ''
            })));
          }
        });
      }
    });
  }

  async function autoScan() {
    if (isScanning) return;
    isScanning = true;
    statusBadge.textContent = '扫描中';
    statusBadge.classList.add('scanning');
    
    try {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'scanPage' }, (response) => {
          resolve(response);
        });
      });
      loadVideos();
    } catch (error) {
      console.error('自动扫描失败:', error);
    } finally {
      isScanning = false;
      statusBadge.textContent = '就绪';
      statusBadge.classList.remove('scanning');
    }
  }

  chrome.storage.local.get(['minSizeMB'], (result) => {
    if (result.minSizeMB !== undefined) {
      minSizeMB = result.minSizeMB;
      filterSelect.value = String(minSizeMB);
      renderVideos(currentVideos);
    }
  });

  filterSelect.addEventListener('change', function() {
    minSizeMB = parseInt(this.value);
    chrome.storage.local.set({ minSizeMB: minSizeMB });
    renderVideos(currentVideos);
  });

  loadVideos();

  setTimeout(() => {
    autoScan();
  }, 500);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'videoDetected') {
      loadVideos();
    }
    if (message.action === 'videoSizeUpdated') {
      loadVideos();
    }
  });
});
