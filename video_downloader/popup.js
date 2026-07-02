document.addEventListener('DOMContentLoaded', function() {
  const videoList = document.getElementById('videoList');
  const videoCount = document.getElementById('videoCount');
  const scanBtn = document.getElementById('scanBtn');
  const clearBtn = document.getElementById('clearBtn');
  const statusBadge = document.getElementById('statusBadge');
  const toast = document.getElementById('toast');
  
  let currentVideos = [];
  let isScanning = false;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }

  function copyToClipboard(text) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        
        try {
          const successful = document.execCommand('copy');
          document.body.removeChild(textarea);
          resolve(successful);
        } catch (err) {
          document.body.removeChild(textarea);
          resolve(false);
        }
      }, 0);
    });
  }

  function copyVideoUrl(url, filename) {
    return new Promise((resolve) => {
      const thunderUrl = convertToThunder(url, filename);
      const clipboardText = filename ? `${url}|${filename}` : url;
      
      copyToClipboard(clipboardText).then((success) => {
        if (success) {
          showToast('已复制到剪贴板，迅雷将自动检测');
          resolve(true);
        } else {
          navigator.clipboard.writeText(clipboardText).then(() => {
            showToast('已复制到剪贴板，迅雷将自动检测');
            resolve(true);
          }).catch(() => {
            window.location.href = thunderUrl;
            showToast('尝试通过协议唤起迅雷');
            resolve(true);
          });
        }
      }).catch(() => {
        window.location.href = thunderUrl;
        showToast('尝试通过协议唤起迅雷');
        resolve(true);
      });
    });
  }

  function convertToThunder(url, filename) {
    const prefix = 'AA';
    const suffix = 'ZZ';
    const content = filename ? `${url}|${filename}` : url;
    const encoded = prefix + content + suffix;
    const utf8Bytes = new TextEncoder().encode(encoded);
    const base64 = btoa(String.fromCharCode(...utf8Bytes));
    return 'thunder://' + base64;
  }

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

  function renderVideos(videos) {
    currentVideos = videos;
    videoCount.textContent = videos.length;
    
    const sortedVideos = [...videos].sort((a, b) => {
      const sizeA = a.size || 0;
      const sizeB = b.size || 0;
      return sizeB - sizeA;
    });
    
    if (sortedVideos.length === 0) {
      videoList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎬</div>
          <div class="empty-state-title">未检测到视频</div>
          <div class="empty-state-desc">点击扫描按钮检测当前页面视频</div>
        </div>
      `;
      return;
    }

    videoList.innerHTML = '';
    sortedVideos.forEach(video => {
      const escapedFilename = escapeHtml(video.filename || video.title);
      const escapedType = video.mimeType ? escapeHtml(video.mimeType.split('/')[1].toUpperCase()) : 'Video';
      
      const item = document.createElement('div');
      item.className = 'video-item';
      item.innerHTML = `
        <div class="video-icon">▶</div>
        <div class="video-info">
          <div class="video-name" title="${escapedFilename}">${escapedFilename}</div>
          <div class="video-size">${formatSize(video.size)}</div>
          <div class="video-type">${escapedType}</div>
        </div>
        <div class="btn-group">
          <button class="action-btn copy-btn" title="复制链接（唤起迅雷）">📋</button>
          <button class="action-btn download-btn" title="下载">⬇️</button>
        </div>
      `;
      
      const copyBtn = item.querySelector('.copy-btn');
      copyBtn.videoData = { url: video.url, filename: video.filename || video.title };
      copyBtn.addEventListener('click', function() {
        const { url, filename } = this.videoData;
        this.innerHTML = '⏳';
        copyVideoUrl(url, filename).then(() => {
          this.innerHTML = '✓';
          setTimeout(() => {
            this.innerHTML = '📋';
          }, 2000);
        });
      });
      
      const downloadBtn = item.querySelector('.download-btn');
      downloadBtn.videoData = { url: video.url, filename: video.filename || video.title };
      downloadBtn.addEventListener('click', function() {
        const { url, filename } = this.videoData;
        this.innerHTML = '⏳';
        
        chrome.runtime.sendMessage({
          action: 'downloadVideo',
          url: url,
          filename: filename
        }, (response) => {
          if (response && response.success) {
            this.innerHTML = '✓';
            setTimeout(() => {
              this.innerHTML = '⬇️';
            }, 2000);
          } else {
            this.innerHTML = '✗';
            setTimeout(() => {
              this.innerHTML = '⬇️';
            }, 2000);
          }
        });
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
            renderVideos(response.videos);
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

  scanBtn.addEventListener('click', function() {
    if (isScanning) return;
    this.textContent = '扫描中...';
    this.disabled = true;
    statusBadge.textContent = '扫描中';
    statusBadge.classList.add('scanning');
    
    chrome.runtime.sendMessage({ action: 'scanPage' }, (response) => {
      if (response && response.success) {
        loadVideos();
      }
      this.textContent = '🔍 扫描视频';
      this.disabled = false;
      statusBadge.textContent = '就绪';
      statusBadge.classList.remove('scanning');
    });
  });

  clearBtn.addEventListener('click', function() {
    chrome.runtime.sendMessage({ action: 'clearVideos' }, (response) => {
      if (response && response.success) {
        renderVideos([]);
      }
    });
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