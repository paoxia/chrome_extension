document.addEventListener('DOMContentLoaded', function() {
  const imageGrid = document.getElementById('imageGrid');
  const imageCount = document.getElementById('imageCount');
  const imageTabCount = document.getElementById('imageTabCount');
  const statusBadge = document.getElementById('imageStatusBadge');
  const refreshBtn = document.getElementById('imageRefreshBtn');
  const toast = document.getElementById('toast');
  const minSizeInput = document.getElementById('minSize');
  const hideUnknownInput = document.getElementById('hideUnknown');

  let currentImages = [];
  let isScanning = false;
  let filter = {
    minSize: 0,
    hideUnknown: false
  };

  // 加载持久化的过滤设置
  chrome.storage.local.get(['sizeFilter'], (result) => {
    if (result.sizeFilter) {
      filter = Object.assign(filter, result.sizeFilter);
      minSizeInput.value = filter.minSize || '';
      hideUnknownInput.checked = !!filter.hideUnknown;
      renderImages(currentImages);
    }
  });

  function saveFilter() {
    chrome.storage.local.set({ sizeFilter: filter });
  }

  function formatSize(bytes) {
    if (bytes == null) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  function applyFilter(images) {
    return images.filter(img => {
      if (img.size == null) {
        return !filter.hideUnknown;
      }
      if (filter.minSize > 0 && img.size < filter.minSize * 1024) return false;
      return true;
    });
  }

  minSizeInput.addEventListener('change', () => {
    filter.minSize = Math.max(0, parseFloat(minSizeInput.value) || 0);
    if (filter.minSize === 0) minSizeInput.value = '';
    saveFilter();
    renderImages(currentImages);
  });

  hideUnknownInput.addEventListener('change', () => {
    filter.hideUnknown = hideUnknownInput.checked;
    saveFilter();
    renderImages(currentImages);
  });

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2000);
  }

  function renderImages(images) {
    currentImages = images;
    const filtered = applyFilter(images);
    imageCount.textContent = `${filtered.length}/${images.length}`;
    imageTabCount.textContent = images.length;

    if (filtered.length === 0) {
      imageGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🖼️</div>
          <div class="empty-state-title">${images.length === 0 ? '未检测到图片' : '无符合过滤条件的图片'}</div>
          <div class="empty-state-desc">${images.length === 0 ? '点击刷新按钮重新扫描页面...' : '调整过滤条件后重试...'}</div>
        </div>
      `;
      return;
    }

    imageGrid.innerHTML = '';
    filtered.forEach(img => {
      const item = document.createElement('div');
      item.className = 'image-item';

      const hasSize = img.size != null && img.size > 0;
      const sizeTag = hasSize
        ? `<div class="image-size-tag">${formatSize(img.size)}</div>`
        : `<div class="image-size-tag unknown">未知大小</div>`;

      item.innerHTML = `
        <div class="download-overlay">
          <div class="download-icon">⬇️</div>
        </div>
        ${sizeTag}
      `;

      const thumbnail = document.createElement('img');
      thumbnail.className = 'image-thumb';
      thumbnail.alt = '';
      thumbnail.src = img.url;
      thumbnail.addEventListener('error', () => thumbnail.classList.add('load-error'));
      item.prepend(thumbnail);

      item.addEventListener('click', function() {
        if (item.classList.contains('downloading')) return;

        item.classList.add('downloading');

        chrome.runtime.sendMessage({
          action: 'downloadImage',
          url: img.url,
          filename: img.filename
        }, (response) => {
          item.classList.remove('downloading');
          const errorMessage = response?.error || chrome.runtime.lastError?.message;
          if (response && response.success) {
            item.classList.add('downloaded');
            showToast('下载已开始');
            setTimeout(() => {
              item.classList.remove('downloaded');
            }, 2000);
          } else {
            showToast(errorMessage ? `下载失败：${errorMessage}` : '下载失败');
          }
        });
      });

      imageGrid.appendChild(item);
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
    refreshBtn.disabled = true;
    statusBadge.textContent = '扫描中';
    statusBadge.classList.add('scanning');

    try {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'scanImagesPage' }, (response) => {
          resolve(response);
        });
      });
      loadImages();
    } catch (error) {
      console.error('自动扫描失败:', error);
    } finally {
      isScanning = false;
      refreshBtn.disabled = false;
      statusBadge.textContent = '就绪';
      statusBadge.classList.remove('scanning');
    }
  }

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
