document.addEventListener('DOMContentLoaded', function() {
  const saveBtn = document.getElementById('saveBtn');
  const testBtn = document.getElementById('testBtn');
  const summarizeBtn = document.getElementById('summarizeBtn');
  const statusDiv = document.getElementById('status');
  const resultDiv = document.getElementById('result');
  const apiUrlInput = document.getElementById('apiUrl');
  const apiKeyInput = document.getElementById('apiKey');
  const modelNameInput = document.getElementById('modelName');
  
  function loadConfig() {
    chrome.storage.sync.get(['apiUrl', 'apiKey', 'modelName'], function(result) {
      if (result.apiUrl) {
        apiUrlInput.value = result.apiUrl;
      }
      if (result.apiKey) {
        apiKeyInput.value = result.apiKey;
      }
      if (result.modelName) {
        modelNameInput.value = result.modelName;
      }
    });
  }
  
  loadConfig();
  
  saveBtn.addEventListener('click', function() {
    const apiUrl = apiUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const modelName = modelNameInput.value.trim();
    
    if (!apiUrl) {
      statusDiv.textContent = '请输入 API 地址';
      statusDiv.className = 'error';
      return;
    }
    
    if (!apiKey) {
      statusDiv.textContent = '请输入 API Key';
      statusDiv.className = 'error';
      return;
    }
    
    if (!modelName) {
      statusDiv.textContent = '请输入模型名称';
      statusDiv.className = 'error';
      return;
    }
    
    chrome.storage.sync.set({
      apiUrl: apiUrl,
      apiKey: apiKey,
      modelName: modelName
    }, function() {
      statusDiv.textContent = '配置已保存';
      statusDiv.className = 'success';
      resultDiv.textContent = '';
    });
  });
  
  testBtn.addEventListener('click', function() {
    testBtn.disabled = true;
    statusDiv.textContent = '正在测试连接...';
    statusDiv.className = '';
    resultDiv.textContent = '';
    
    chrome.runtime.sendMessage({action: 'testConnection'}, function(response) {
      testBtn.disabled = false;
      
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message;
        statusDiv.textContent = '错误：' + errorMsg;
        statusDiv.className = 'error';
        if (errorMsg.includes('message port closed')) {
          resultDiv.textContent = '消息通道已关闭。请确保：\n1. 扩展已正确加载\n2. 重新加载扩展后重试\n3. 检查Service Worker是否正常运行';
        } else {
          resultDiv.textContent = '请检查Service Worker控制台获取详细信息';
        }
        return;
      }
      
      if (!response) {
        statusDiv.textContent = '错误：未收到响应';
        statusDiv.className = 'error';
        resultDiv.textContent = '请检查Service Worker控制台获取详细信息';
        return;
      }
      
      if (response.success) {
        statusDiv.textContent = response.message;
        statusDiv.className = 'success';
        if (response.models && response.models.length > 0) {
          const modelList = response.models.map(m => `- ${m.id}`).join('\n');
          resultDiv.textContent = `可用模型列表：\n${modelList}`;
        } else {
          resultDiv.textContent = '连接成功';
        }
      } else {
        statusDiv.textContent = '连接失败：' + (response.error || '未知错误');
        statusDiv.className = 'error';
        resultDiv.textContent = '请检查：\n1. API 地址是否正确\n2. API Key 是否有效\n3. 网络连接是否正常';
      }
    });
  });
  
  summarizeBtn.addEventListener('click', function() {
    summarizeBtn.disabled = true;
    statusDiv.textContent = '正在读取网页内容...';
    resultDiv.textContent = '';
    
    chrome.runtime.sendMessage({action: 'summarizePage'}, function(response) {
      summarizeBtn.disabled = false;
      
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message;
        statusDiv.textContent = '错误：' + errorMsg;
        statusDiv.className = 'error';
        if (errorMsg.includes('message port closed')) {
          resultDiv.textContent = '消息通道已关闭。请确保：\n1. 扩展已正确加载\n2. 重新加载扩展后重试\n3. 检查Service Worker是否正常运行';
        }
        return;
      }
      
      if (!response) {
        statusDiv.textContent = '错误：未收到响应';
        statusDiv.className = 'error';
        return;
      }
      
      if (response.error) {
        statusDiv.textContent = '错误：' + response.error;
        statusDiv.className = 'error';
      } else if (response.summary) {
        statusDiv.textContent = '总结完成';
        statusDiv.className = 'success';
        resultDiv.textContent = response.summary;
      } else {
        statusDiv.textContent = '未知错误：未收到有效响应';
        statusDiv.className = 'error';
      }
    });
  });
});
