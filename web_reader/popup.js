const DEFAULT_CONFIG = {
  provider: 'openai',
  apiUrl: '',
  apiKey: '',
  modelName: '',
  codexModel: '',
  targetLanguage: '简体中文',
  translationMode: 'bilingual'
};

document.addEventListener('DOMContentLoaded', () => {
  const elements = {
    configBtn: document.getElementById('configBtn'),
    configSection: document.getElementById('configSection'),
    providerBadge: document.getElementById('providerBadge'),
    provider: document.getElementById('provider'),
    openaiFields: document.getElementById('openaiFields'),
    nativeCodexFields: document.getElementById('nativeCodexFields'),
    codexSharedFields: document.getElementById('codexSharedFields'),
    apiUrl: document.getElementById('apiUrl'),
    apiKey: document.getElementById('apiKey'),
    modelName: document.getElementById('modelName'),
    codexModel: document.getElementById('codexModel'),
    targetLanguage: document.getElementById('targetLanguage'),
    translationMode: document.getElementById('translationMode'),
    saveBtn: document.getElementById('saveBtn'),
    testBtn: document.getElementById('testBtn'),
    summarizeBtn: document.getElementById('summarizeBtn'),
    translateBtn: document.getElementById('translateBtn'),
    translationControls: document.getElementById('translationControls'),
    clearTranslationBtn: document.getElementById('clearTranslationBtn'),
    status: document.getElementById('status'),
    result: document.getElementById('result')
  };

  let currentConfig = { ...DEFAULT_CONFIG };
  let currentTabId = null;
  let pollingTimer = null;

  function setStatus(message, type = '') {
    elements.status.textContent = message || '';
    elements.status.className = type;
  }

  function setResult(message = '') {
    elements.result.textContent = message;
    elements.result.classList.toggle('show', !!message);
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(response);
      });
    });
  }

  function getActiveTab() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(tabs[0]);
      });
    });
  }

  function updateProviderUi() {
    const provider = elements.provider.value;
    const isNative = provider === 'codex-native';
    elements.openaiFields.hidden = provider !== 'openai';
    elements.nativeCodexFields.hidden = !isNative;
    elements.codexSharedFields.hidden = !isNative;
    elements.providerBadge.textContent = isNative
      ? '本地 Codex · Native'
      : 'OpenAI 兼容 API';
  }

  function readConfigFromForm() {
    return {
      provider: elements.provider.value === 'codex-native' ? 'codex-native' : 'openai',
      apiUrl: elements.apiUrl.value.trim(),
      apiKey: elements.apiKey.value.trim(),
      modelName: elements.modelName.value.trim(),
      codexModel: elements.codexModel.value.trim(),
      targetLanguage: elements.targetLanguage.value,
      translationMode: elements.translationMode.value
    };
  }

  function validateConfig(config) {
    if (config.provider === 'openai') {
      if (!config.apiUrl) throw new Error('请输入 API 地址');
      if (!config.modelName) throw new Error('请输入模型名称');
    }
  }

  function persistConfig(showStatus = true) {
    const config = readConfigFromForm();
    validateConfig(config);
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set(config, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        currentConfig = config;
        updateProviderUi();
        if (showStatus) setStatus('配置已保存', 'success');
        resolve(config);
      });
    });
  }

  function loadConfig() {
    chrome.storage.sync.get(Object.keys(DEFAULT_CONFIG), (result) => {
      currentConfig = { ...DEFAULT_CONFIG, ...result };
      if (currentConfig.provider === 'codex' || currentConfig.provider === 'codex-app-server') {
        currentConfig.provider = 'codex-native';
      }
      Object.entries(currentConfig).forEach(([key, value]) => {
        if (elements[key] && value !== undefined) elements[key].value = value;
      });
      updateProviderUi();
    });
  }

  function setBusy(type = null) {
    const busy = !!type;
    elements.summarizeBtn.disabled = busy;
    elements.translateBtn.disabled = busy;
    elements.summarizeBtn.textContent = type === 'summary' ? '总结中...' : '总结当前网页';
    elements.translateBtn.textContent = type === 'translation' ? '翻译中...' : '翻译当前网页';
  }

  function setActiveMode(mode) {
    elements.translationControls.querySelectorAll('[data-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === mode);
    });
  }

  function showCompletedState(state) {
    setBusy();
    if (state.type === 'translation') {
      const partial = state.translatedCount < state.totalCount;
      const note = state.truncated ? '（页面较长，仅处理首批正文）' : (partial ? '（部分段落未返回译文）' : '');
      setStatus(`已翻译 ${state.translatedCount}/${state.totalCount} 个段落${note}`, 'success');
      setResult('译文已直接显示在当前页面，可使用页面右下角工具条或下方按钮切换显示方式。');
      elements.translationControls.hidden = false;
      setActiveMode(state.mode);
    } else {
      setStatus('总结完成', 'success');
      setResult(state.summary || '');
    }
  }

  function stopPolling() {
    if (pollingTimer) clearInterval(pollingTimer);
    pollingTimer = null;
  }

  function updateTaskState(state) {
    if (!state) return;
    if (state.status === 'processing') {
      setBusy(state.type);
      const otherPage = currentTabId && state.tabId !== currentTabId;
      setStatus(otherPage
        ? '另一个页面正在执行 AI 任务...'
        : (state.type === 'translation' ? '正在翻译页面，可关闭弹窗等待...' : '正在总结页面，可关闭弹窗等待...'));
      startPolling();
    } else if (state.status === 'completed') {
      stopPolling();
      setBusy();
      if (!currentTabId || state.tabId === currentTabId) showCompletedState(state);
    } else if (state.status === 'error') {
      stopPolling();
      setBusy();
      if (!currentTabId || state.tabId === currentTabId) setStatus(`错误：${state.error}`, 'error');
    }
  }

  function startPolling() {
    if (pollingTimer) return;
    pollingTimer = setInterval(async () => {
      try {
        const state = await sendRuntimeMessage({ action: 'getTaskState' });
        updateTaskState(state);
      } catch (error) {
        stopPolling();
        setBusy();
        setStatus(`错误：${error.message}`, 'error');
      }
    }, 1000);
  }

  async function startTask(type) {
    try {
      await persistConfig(false);
      const tab = await getActiveTab();
      if (!tab) throw new Error('无法获取当前标签页');
      currentTabId = tab.id;
      setBusy(type);
      setResult('');
      setStatus(type === 'translation' ? '正在启动翻译...' : '正在启动总结...');
      const response = await sendRuntimeMessage({
        action: 'startBackgroundTask',
        type,
        tabId: tab.id,
        mode: currentConfig.translationMode
      });
      if (!response?.started) throw new Error(response?.error || '任务启动失败');
      startPolling();
    } catch (error) {
      setBusy();
      setStatus(`错误：${error.message}`, 'error');
    }
  }

  async function refreshTranslationState() {
    try {
      const tab = await getActiveTab();
      if (!tab) return;
      const state = await sendRuntimeMessage({ action: 'getTranslationState', tabId: tab.id });
      if (state?.active) {
        elements.translationControls.hidden = false;
        setActiveMode(state.mode);
      } else {
        elements.translationControls.hidden = true;
      }
    } catch {
      // 页面不支持内容脚本时保持控件隐藏。
    }
  }

  elements.configBtn.addEventListener('click', () => {
    const shown = elements.configSection.classList.toggle('show');
    elements.configBtn.classList.toggle('active', shown);
    elements.configBtn.textContent = shown ? '收起' : '配置';
  });
  elements.provider.addEventListener('change', updateProviderUi);
  elements.saveBtn.addEventListener('click', () => {
    persistConfig().catch(error => setStatus(`错误：${error.message}`, 'error'));
  });
  elements.testBtn.addEventListener('click', async () => {
    elements.testBtn.disabled = true;
    setResult('');
    setStatus('正在测试连接...');
    try {
      const config = await persistConfig(false);
      const response = await sendRuntimeMessage({ action: 'testConnection' });
      if (!response?.success) throw new Error(response?.error || '连接失败');
      const models = response.models || [];
      const modelNames = models.slice(0, 20).map(model => model.id || model.model || model.displayName || model.name).filter(Boolean);
      const isCodex = config.provider.startsWith('codex-');
      setStatus(isCodex ? '本地 Codex 连接成功' : 'API 连接成功', 'success');
      if (response.version) {
        setResult(`Native Host 连接成功：${response.version}`);
      } else {
        setResult(modelNames.length ? `可用模型：\n${modelNames.map(name => `• ${name}`).join('\n')}` : '连接成功');
      }
    } catch (error) {
      setStatus(`连接失败：${error.message}`, 'error');
    } finally {
      elements.testBtn.disabled = false;
    }
  });
  elements.summarizeBtn.addEventListener('click', () => startTask('summary'));
  elements.translateBtn.addEventListener('click', () => startTask('translation'));

  elements.translationControls.addEventListener('click', async (event) => {
    const modeButton = event.target.closest('[data-mode]');
    if (!modeButton) return;
    try {
      const tab = await getActiveTab();
      const response = await sendRuntimeMessage({ action: 'setTranslationMode', tabId: tab.id, mode: modeButton.dataset.mode });
      if (!response?.success) throw new Error(response?.error || '切换失败');
      setActiveMode(response.mode);
      setStatus('页面显示方式已切换', 'success');
    } catch (error) {
      setStatus(`错误：${error.message}`, 'error');
    }
  });

  elements.clearTranslationBtn.addEventListener('click', async () => {
    try {
      const tab = await getActiveTab();
      const response = await sendRuntimeMessage({ action: 'clearPageTranslations', tabId: tab.id });
      if (!response?.success) throw new Error(response?.error || '移除失败');
      elements.translationControls.hidden = true;
      setStatus('已移除页面译文', 'success');
      setResult('');
    } catch (error) {
      setStatus(`错误：${error.message}`, 'error');
    }
  });

  loadConfig();
  getActiveTab().then((tab) => {
    currentTabId = tab?.id || null;
    return Promise.all([
      sendRuntimeMessage({ action: 'getTaskState' }).then(updateTaskState),
      refreshTranslationState()
    ]);
  }).catch(() => {});
});
