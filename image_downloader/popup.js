document.addEventListener('DOMContentLoaded', function() {
  const imageList = document.getElementById('imageList');
  const imageCount = document.getElementById('imageCount');
  const statusBadge = document.getElementById('statusBadge');
  const filterSelect = document.getElementById('filterSelect');
  const downloadAllBtn = document.getElementById('downloadAllBtn');
  const clearBtn = document.getElementById('clearBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const toast = document.getElementById('toast');

  let currentImages = [];
  let isScanning = false;
  let minSizeKB = 0;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }

  function formatSize(bytes) {
    if (!bytes) return '未知大小';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatDimensions(width, height) {
    if (!width || !height) return '';
    return width + '×' + height;
  }

  function renderImages(images) {
    currentImages = images;
    imageCount.textContent = images.length;

    const minBytes = minSizeKB * 1024;
    const filteredImages = minSizeKB > 0
      ? images.filter(img => img.size === null || img.size >= minBytes)
      : images;

    downloadAllBtn.disabled = filteredImages.length === 0;

    if (filteredImages.length === 0) {
      imageList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🖼️</div>
          <div class="empty-state-title">未检测到图片</div>
          <div class="empty-state-desc">点击刷新按钮重新扫描页面...</div>
        </div>
      `;
      return;
    }

    imageList.innerHTML = '';
    filteredImages.forEach(img => {
      const item = document.createElement('div');
      item.className = 'image-item';
      item.innerHTML = `
        <img class="image-thumb" src="${img.url}" alt="" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'48\' height=\'48\' viewBox=\'0 0 24 24\' fill=\'%23f5f5f7\' stroke=\'%23ccc\' stroke-width=\'1.5\'%3E%3Crect x=\'3\' y=\'3\' width=\'18\' height=\'18\' rx=\'2\'/%3E%3Ccircle cx=\'8.5\' cy=\'8.5\' r=\'1.5\'/%3E%3Cpolyline points=\'21 15 16 10 5 21\'/%3E%3C/svg%3E'">
        <div class="image-info">
          <div class="image-name" title="${img.filename}">${img.filename}</div>
          <div class="image-meta">
            <span class="image-size">${formatSize(img.size)}</span>
            <span class="image-dim">${formatDimensions(img.width, img.height)}</span>
          </div>
        </div>
        <div class="btn-group">
          <button class="copy-btn" title="复制链接">🔗</button>
          <button class="download-btn" title="下载">⬇️</button>
        </div>
      `;

      const copyBtn = item.querySelector('.copy-btn');
      copyBtn.imageData = { url: img.url };
      copyBtn.addEventListener('click', function() {
        const { url } = this.imageData;
        this.innerHTML = '⏳';

        chrome.runtime.sendMessage({
          action: 'copyUrl',
          url: url
        }, (response) => {
          if (response && response.success) {
            this.innerHTML = '✓';
            showToast('链接已复制');
            setTimeout(() => {
              this.innerHTML = '🔗';
            }, 2000);
          } else {
            this.innerHTML = '✗';
            setTimeout(() => {
              this.innerHTML = '🔗';
            }, 2000);
          }
        });
      });

      const downloadBtn = item.querySelector('.download-btn');
      downloadBtn.imageData = { url: img.url, filename: img.filename };
      downloadBtn.addEventListener('click', function() {
        const { url, filename } = this.imageData;
        this.innerHTML = '⏳';

        chrome.runtime.sendMessage({
          action: 'downloadImage',
          url: url,
          filename: filename
        }, (response) => {
          if (response && response.success) {
            this.innerHTML = '✓';
            showToast('下载已开始');
            setTimeout(() => {
              this.innerHTML = '⬇️';
            }, 2000);
          } else {
            this.innerHTML = '✗';
            showToast('下载失败');
            setTimeout(() => {
              this.innerHTML = '⬇️';
            }, 2000);
          }
        });
      });

      imageList.appendChild(item);
    });
  }

  function loadImages() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.runtime.sendMessage({
          action: 'getImages',
          tabId: tabs[0].id
        }, (response) => {
          if (response && response.images) {
            renderImages(response.images);
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
      loadImages();
    } catch (error) {
      console.error('自动扫描失败:', error);
    } finally {
      isScanning = false;
      statusBadge.textContent = '就绪';
      statusBadge.classList.remove('scanning');
    }
  }

  chrome.storage.local.get(['minSizeKB'], (result) => {
    if (result.minSizeKB !== undefined) {
      minSizeKB = result.minSizeKB;
      filterSelect.value = String(minSizeKB);
      renderImages(currentImages);
    }
  });

  filterSelect.addEventListener('change', function() {
    minSizeKB = parseInt(this.value);
    chrome.storage.local.set({ minSizeKB: minSizeKB });
    renderImages(currentImages);
  });

  downloadAllBtn.addEventListener('click', function() {
    const minBytes = minSizeKB * 1024;
    const filteredImages = minSizeKB > 0
      ? currentImages.filter(img => img.size === null || img.size >= minBytes)
      : currentImages;

    if (filteredImages.length === 0) {
      showToast('没有可下载的图片');
      return;
    }

    this.disabled = true;
    this.textContent = '下载中...';

    chrome.runtime.sendMessage({
      action: 'downloadAll',
      images: filteredImages
    }, (response) => {
      if (response && response.success) {
        showToast(`成功下载 ${response.successCount}/${response.total} 张图片`);
      } else {
        showToast('批量下载失败');
      }
      this.disabled = false;
      this.textContent = '全部下载';
    });
  });

  clearBtn.addEventListener('click', function() {
    chrome.runtime.sendMessage({ action: 'clearImages' }, (response) => {
      if (response && response.success) {
        renderImages([]);
        showToast('列表已清空');
      }
    });
  });

  refreshBtn.addEventListener('click', function() {
    autoScan();
  });

  loadImages();

  setTimeout(() => {
    autoScan();
  }, 500);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'imageDetected') {
      loadImages();
    }
  });
});