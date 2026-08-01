document.addEventListener('DOMContentLoaded', function() {
  const imageGrid = document.getElementById('imageGrid');
  const imageCount = document.getElementById('imageCount');
  const imageTabCount = document.getElementById('imageTabCount');
  const statusBadge = document.getElementById('imageStatusBadge');
  const refreshBtn = document.getElementById('imageRefreshBtn');
  const toast = document.getElementById('toast');
  const minSizeInput = document.getElementById('minSize');
  const hideUnknownInput = document.getElementById('hideUnknown');
  const selectionCount = document.getElementById('imageSelectionCount');
  const selectAllBtn = document.getElementById('imageSelectAllBtn');
  const clearSelectionBtn = document.getElementById('imageClearSelectionBtn');
  const batchDownloadBtn = document.getElementById('imageBatchDownloadBtn');

  let currentImages = [];
  let isScanning = false;
  let isBatchDownloading = false;
  const selectedImageUrls = new Set();
  const downloadingImageUrls = new Set();
  const downloadedImageUrls = new Set();
  const renderedImageItems = new Map();
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

  function updateSelectionControls(filteredImages = applyFilter(currentImages)) {
    const allVisibleSelected = filteredImages.length > 0
      && filteredImages.every(img => selectedImageUrls.has(img.url));

    selectionCount.textContent = `已选 ${selectedImageUrls.size}`;
    selectAllBtn.disabled = isBatchDownloading || filteredImages.length === 0 || allVisibleSelected;
    clearSelectionBtn.disabled = isBatchDownloading || selectedImageUrls.size === 0;
    batchDownloadBtn.disabled = isBatchDownloading || selectedImageUrls.size === 0;
    batchDownloadBtn.textContent = isBatchDownloading ? '下载中...' : '下载已选';
  }

  function syncImageItemState(url) {
    const refs = renderedImageItems.get(url);
    if (!refs) return;

    const isSelected = selectedImageUrls.has(url);
    refs.item.classList.toggle('selected', isSelected);
    refs.item.classList.toggle('downloading', downloadingImageUrls.has(url));
    refs.item.classList.toggle('downloaded', downloadedImageUrls.has(url));
    refs.selectButton.classList.toggle('selected', isSelected);
    refs.selectButton.textContent = isSelected ? '✓' : '';
    refs.selectButton.setAttribute('aria-label', isSelected ? '取消选择图片' : '选择图片');
    refs.selectButton.setAttribute('aria-pressed', String(isSelected));
    refs.selectButton.disabled = isBatchDownloading;
  }

  function syncAllImageItemStates() {
    renderedImageItems.forEach((_, url) => syncImageItemState(url));
    updateSelectionControls();
  }

  function showDownloadedState(url) {
    downloadedImageUrls.add(url);
    syncImageItemState(url);
    setTimeout(() => {
      downloadedImageUrls.delete(url);
      syncImageItemState(url);
    }, 2000);
  }

  function downloadSingleImage(img) {
    if (downloadingImageUrls.has(img.url)) return;

    downloadingImageUrls.add(img.url);
    syncImageItemState(img.url);

    chrome.runtime.sendMessage({
      action: 'downloadImage',
      url: img.url,
      filename: img.filename
    }, (response) => {
      const errorMessage = response?.error || chrome.runtime.lastError?.message;
      downloadingImageUrls.delete(img.url);
      syncImageItemState(img.url);

      if (response && response.success) {
        showDownloadedState(img.url);
        showToast('下载已开始');
      } else {
        showToast(errorMessage ? `下载失败：${errorMessage}` : '下载失败');
      }
    });
  }

  function renderImages(images) {
    currentImages = images;
    const filtered = applyFilter(images);
    const availableUrls = new Set(images.map(img => img.url));
    selectedImageUrls.forEach((url) => {
      if (!availableUrls.has(url)) selectedImageUrls.delete(url);
    });
    renderedImageItems.clear();
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
      updateSelectionControls(filtered);
      return;
    }

    imageGrid.innerHTML = '';
    filtered.forEach(img => {
      const item = document.createElement('div');
      item.className = 'image-item';
      item.title = '点击下载，左上角勾选后可批量下载';

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

      const selectButton = document.createElement('button');
      selectButton.type = 'button';
      selectButton.className = 'image-select-btn';
      selectButton.addEventListener('click', function(event) {
        event.stopPropagation();
        if (isBatchDownloading) return;
        if (selectedImageUrls.has(img.url)) {
          selectedImageUrls.delete(img.url);
        } else {
          selectedImageUrls.add(img.url);
        }
        syncImageItemState(img.url);
        updateSelectionControls(filtered);
      });
      item.appendChild(selectButton);

      item.addEventListener('click', () => downloadSingleImage(img));

      imageGrid.appendChild(item);
      renderedImageItems.set(img.url, { item, selectButton });
      syncImageItemState(img.url);
    });

    updateSelectionControls(filtered);
  }

  selectAllBtn.addEventListener('click', () => {
    applyFilter(currentImages).forEach(img => selectedImageUrls.add(img.url));
    syncAllImageItemStates();
  });

  clearSelectionBtn.addEventListener('click', () => {
    selectedImageUrls.clear();
    syncAllImageItemStates();
  });

  batchDownloadBtn.addEventListener('click', () => {
    if (isBatchDownloading) return;

    const selectedImages = currentImages.filter(img => selectedImageUrls.has(img.url));
    if (selectedImages.length === 0) {
      showToast('请先选择图片');
      return;
    }

    isBatchDownloading = true;
    selectedImages.forEach(img => downloadingImageUrls.add(img.url));
    syncAllImageItemStates();

    chrome.runtime.sendMessage({
      action: 'downloadImages',
      images: selectedImages.map(img => ({ url: img.url, filename: img.filename }))
    }, (response) => {
      const runtimeError = chrome.runtime.lastError?.message;
      isBatchDownloading = false;
      selectedImages.forEach(img => downloadingImageUrls.delete(img.url));

      const results = response?.results || [];
      const successfulResults = results.filter(result => result.success);
      successfulResults.forEach((result) => {
        selectedImageUrls.delete(result.url);
        showDownloadedState(result.url);
      });
      syncAllImageItemStates();

      if (!response) {
        showToast(runtimeError ? `批量下载失败：${runtimeError}` : '批量下载失败');
        return;
      }

      if (response.failed > 0) {
        const firstError = results.find(result => !result.success)?.error;
        const summary = `已开始 ${response.succeeded} 张，失败 ${response.failed} 张`;
        showToast(firstError ? `${summary}：${firstError}` : summary);
      } else {
        showToast(`已开始下载 ${response.succeeded} 张图片`);
      }
    });
  });

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
