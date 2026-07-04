document.addEventListener('DOMContentLoaded', function() {
  const imageGrid = document.getElementById('imageGrid');
  const imageCount = document.getElementById('imageCount');
  const statusBadge = document.getElementById('statusBadge');
  const refreshBtn = document.getElementById('refreshBtn');
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
        <img class="image-thumb" src="${img.url}" alt="" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'120\' height=\'120\' viewBox=\'0 0 24 24\' fill=\'%23f5f5f7\' stroke=\'%23ccc\' stroke-width=\'1.5\'%3E%3Crect x=\'3\' y=\'3\' width=\'18\' height=\'18\' rx=\'2\'/%3E%3Ccircle cx=\'8.5\' cy=\'8.5\' r=\'1.5\'/%3E%3Cpolyline points=\'21 15 16 10 5 21\'/%3E%3C/svg%3E'">
        <div class="download-overlay">
          <div class="download-icon">⬇️</div>
        </div>
        ${sizeTag}
      `;

      item.addEventListener('click', function() {
        if (item.classList.contains('downloading')) return;

        item.classList.add('downloading');

        chrome.runtime.sendMessage({
          action: 'downloadImage',
          url: img.url,
          filename: img.filename
        }, (response) => {
          item.classList.remove('downloading');
          if (response && response.success) {
            item.classList.add('downloaded');
            showToast('下载已开始');
            setTimeout(() => {
              item.classList.remove('downloaded');
            }, 2000);
          } else {
            showToast('下载失败');
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