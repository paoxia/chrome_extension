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
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      
      try {
        const successful = document.execCommand('copy');
        resolve(successful);
      } catch (err) {
        resolve(false);
      } finally {
        document.body.removeChild(textarea);
      }
    });
  }

  function copyVideoUrl(url) {
    return new Promise((resolve) => {
      const thunderUrl = convertToThunder(url);
      
      copyToClipboard(url).then((success) => {
        if (success) {
          showToast('已复制到剪贴板，迅雷将自动检测');
          resolve(true);
        } else {
          try {
            navigator.clipboard.writeText(url).then(() => {
              showToast('已复制到剪贴板，迅雷将自动检测');
              resolve(true);
            }).catch(() => {
              window.location.href = thunderUrl;
              showToast('尝试通过协议唤起迅雷');
              resolve(true);
            });
          } catch (err) {
            window.location.href = thunderUrl;
            showToast('尝试通过协议唤起迅雷');
            resolve(true);
          }
        }
      });
    });
  }

  function convertToThunder(url) {
    const prefix = 'AA';
    const suffix = 'ZZ';
    const encoded = prefix + url + suffix;
    const base64 = btoa(encoded);
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
    
    if (videos.length === 0) {
      videoList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎬</div>
          <div class="empty-state-title">未检测到视频</div>
          <div class="empty-state-desc">点击扫描按钮检测当前页面视频</div>
        </div>
      `;
      return;
    }

    videoList.innerHTML = videos.map(video => {
      const escapedUrl = escapeHtml(video.url);
      const escapedFilename = escapeHtml(video.filename || video.title);
      const escapedType = video.mimeType ? escapeHtml(video.mimeType.split('/')[1].toUpperCase()) : 'Video';
      
      return `
      <div class="video-item">
        <div class="video-icon">▶</div>
        <div class="video-info">
          <div class="video-name" title="${escapedFilename}">${escapedFilename}</div>
          <div class="video-size">${formatSize(video.size)}</div>
          <div class="video-type">${escapedType}</div>
        </div>
        <div class="btn-group">
          <button class="action-btn copy-btn" data-url="${escapedUrl}" title="复制链接（唤起迅雷）">
            📋
          </button>
          <button class="action-btn download-btn" data-url="${escapedUrl}" data-filename="${escapedFilename}" title="下载">
            ⬇️
          </button>
        </div>
      </div>
      `;
    }).join('');

    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const url = this.getAttribute('data-url');
        this.innerHTML = '⏳';
        copyVideoUrl(url).then(() => {
          this.innerHTML = '✓';
          setTimeout(() => {
            this.innerHTML = '📋';
          }, 2000);
        });
      });
    });

    document.querySelectorAll('.download-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const url = this.getAttribute('data-url');
        const filename = this.getAttribute('data-filename');
        
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
  });
});