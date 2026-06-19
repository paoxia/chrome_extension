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

  const initialRange = await loadRange();
  rangeValueInput.value = initialRange.value;
  rangeUnitSelect.value = initialRange.unit;

  rangeValueInput.addEventListener('change', onChange);
  rangeUnitSelect.addEventListener('change', onChange);
});
