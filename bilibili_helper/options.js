const DEFAULT_RANGE = { value: 2, unit: 'day' };
const STORAGE_KEY = 'watchLaterRange';

function loadRange() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const range = result[STORAGE_KEY];
      if (range && typeof range.value === 'number' && (range.unit === 'day' || range.unit === 'hour')) {
        resolve(range);
      } else {
        resolve(DEFAULT_RANGE);
      }
    });
  });
}

function saveRange(range) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: range }, resolve);
  });
}

document.addEventListener('DOMContentLoaded', async function() {
  const rangeValueInput = document.getElementById('rangeValue');
  const rangeUnitSelect = document.getElementById('rangeUnit');
  const saveStatus = document.getElementById('saveStatus');
  const historyCount = document.getElementById('historyCount');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const historyStatus = document.getElementById('historyStatus');

  let saveStatusTimer = null;
  function flashSaved() {
    saveStatus.classList.add('visible');
    if (saveStatusTimer) clearTimeout(saveStatusTimer);
    saveStatusTimer = setTimeout(() => {
      saveStatus.classList.remove('visible');
    }, 1500);
  }

  function getCurrentRange() {
    let value = parseInt(rangeValueInput.value, 10);
    if (isNaN(value) || value < 1) value = 1;
    if (value > 30) value = 30;
    rangeValueInput.value = value;
    const unit = rangeUnitSelect.value === 'hour' ? 'hour' : 'day';
    return { value, unit };
  }

  async function onChange() {
    const range = getCurrentRange();
    await saveRange(range);
    flashSaved();
  }

  function refreshHistoryCount() {
    chrome.runtime.sendMessage({ action: 'getAddedHistoryStats' }, (response) => {
      if (response?.success) {
        historyCount.textContent = `当前账号保存了 ${response.count} 条添加记录`;
        clearHistoryBtn.disabled = response.count === 0;
        historyStatus.textContent = '';
        historyStatus.classList.remove('error');
      } else {
        historyCount.textContent = response?.error || '无法读取添加记录';
        clearHistoryBtn.disabled = true;
      }
    });
  }

  const initialRange = await loadRange();
  rangeValueInput.value = initialRange.value;
  rangeUnitSelect.value = initialRange.unit;

  rangeValueInput.addEventListener('change', onChange);
  rangeUnitSelect.addEventListener('change', onChange);

  clearHistoryBtn.addEventListener('click', () => {
    if (!confirm('确定清除当前 Bilibili 账号的本地添加记录吗？')) return;

    clearHistoryBtn.disabled = true;
    historyStatus.textContent = '正在清除...';
    historyStatus.classList.remove('error');
    chrome.runtime.sendMessage({ action: 'clearAddedHistory' }, (response) => {
      if (response?.success) {
        historyCount.textContent = '当前账号保存了 0 条添加记录';
        historyStatus.textContent = `已清除 ${response.count} 条记录`;
      } else {
        historyStatus.textContent = response?.error || '清除失败';
        historyStatus.classList.add('error');
        refreshHistoryCount();
      }
    });
  });

  refreshHistoryCount();
});
