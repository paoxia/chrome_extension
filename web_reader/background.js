async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['apiUrl', 'apiKey', 'modelName'], function(result) {
      resolve({
        apiUrl: result.apiUrl || '',
        apiKey: result.apiKey || '',
        modelName: result.modelName || ''
      });
    });
  });
}

async function testApiConnection() {
  try {
    const config = await getConfig();
    
    if (!config.apiUrl) {
      throw new Error('请先配置 API 地址');
    }
    if (!config.apiKey) {
      throw new Error('请先配置 API Key');
    }
    
    const modelsUrl = config.apiUrl.replace(/\/$/, '') + '/models';
    
    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('测试 API 连接失败:', error);
    throw error;
  }
}

async function summarizeWithOpenAI(content, title) {
  try {
    const config = await getConfig();
    
    if (!config.apiUrl) {
      throw new Error('请先配置 API 地址');
    }
    if (!config.apiKey) {
      throw new Error('请先配置 API Key');
    }
    if (!config.modelName) {
      throw new Error('请先配置模型名称');
    }
    
    console.log('开始调用 OpenAI API...');
    console.log('API 地址:', config.apiUrl);
    console.log('使用模型:', config.modelName);
    
    const chatUrl = config.apiUrl.replace(/\/$/, '') + '/chat/completions';
    
    const requestBody = {
      model: config.modelName,
      messages: [
        {
          role: 'system',
          content: '你是一个专业的网页内容总结助手。请用中文总结用户提供的网页内容，提取关键信息，保持简洁明了。'
        },
        {
          role: 'user',
          content: `请用中文总结以下网页内容，标题为"${title}"：\n\n${content}`
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    };
    
    console.log('请求 URL:', chatUrl);
    
    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log('响应状态:', response.status, response.statusText);
    
    if (!response.ok) {
      let errorMessage = `API 请求失败: ${response.status}`;
      let errorDetail = '';
      
      try {
        const errorData = await response.text();
        console.error('错误响应内容:', errorData);
        if (errorData) {
          try {
            const errorJson = JSON.parse(errorData);
            errorDetail = errorJson.error?.message || errorJson.error || errorData;
          } catch {
            errorDetail = errorData;
          }
          errorMessage += ` - ${errorDetail}`;
        }
      } catch (e) {
        console.error('解析错误响应失败:', e);
      }
      
      throw new Error(errorMessage);
    }
    
    const data = await response.json();
    console.log('响应数据:', data);
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('API 返回格式错误，未找到有效的响应内容');
    }
    
    return data.choices[0].message.content;
  } catch (error) {
    console.error('与 API 通信失败:', error);
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('ERR_')) {
      throw new Error('无法连接到 API 服务，请检查 API 地址是否正确');
    }
    throw error;
  }
}

function queryTabs(queryInfo) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(tabs);
      }
    });
  });
}

function executeScript(details) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(details, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

async function handleSummarizePage(tabId) {
  try {
    let tab;
    if (tabId) {
      tab = await new Promise((resolve, reject) => {
        chrome.tabs.get(tabId, (t) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(t);
          }
        });
      });
    } else {
      const tabs = await queryTabs({active: true, currentWindow: true});
      if (tabs.length === 0) {
        return {error: '无法获取当前标签页'};
      }
      tab = tabs[0];
    }
    
    if (tab.url.startsWith('chrome://')) {
      return {error: '无法在Chrome内置页面上使用此插件'};
    }
    
    try {
      await executeScript({
        target: {tabId: tab.id},
        files: ['content.js']
      });
    } catch (error) {
      return {error: '无法注入content script: ' + error.message};
    }
    
    let pageContent;
    try {
      pageContent = await sendMessageToTab(tab.id, {action: 'getPageContent'});
    } catch (error) {
      return {error: '无法与页面通信: ' + error.message};
    }
    
    if (!pageContent) {
      return {error: '无法获取页面内容'};
    }
    
    try {
      const summary = await summarizeWithOpenAI(pageContent.content, pageContent.title);
      return {summary: summary, title: pageContent.title};
    } catch (error) {
      console.error('总结失败:', error);
      return {error: error.message};
    }
  } catch (error) {
    console.error('处理总结请求失败:', error);
    return {error: error.message};
  }
}

function saveTaskState(state) {
  chrome.storage.local.set({taskState: state});
}

function clearTaskState() {
  chrome.storage.local.remove(['taskState']);
}

async function startBackgroundSummarize(tabId) {
  saveTaskState({
    status: 'processing',
    startTime: Date.now(),
    tabId: tabId
  });
  
  const result = await handleSummarizePage(tabId);
  
  if (result.summary) {
    saveTaskState({
      status: 'completed',
      startTime: Date.now(),
      result: result.summary,
      title: result.title
    });
  } else {
    saveTaskState({
      status: 'error',
      startTime: Date.now(),
      error: result.error || '未知错误'
    });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('收到消息:', message.action);
  
  let responded = false;
  const safeSendResponse = (response) => {
    if (!responded) {
      responded = true;
      try {
        sendResponse(response);
      } catch (error) {
        console.error('发送响应失败:', error);
      }
    }
  };
  
  if (message.action === 'testConnection') {
    console.log('开始测试 API 连接...');
    (async () => {
      try {
        const models = await testApiConnection();
        console.log('测试连接成功，找到模型:', models.length);
        safeSendResponse({
          success: true,
          message: `连接成功！`,
          models: models
        });
      } catch (error) {
        console.error('测试连接失败:', error);
        safeSendResponse({
          success: false,
          error: error.message || '未知错误'
        });
      }
    })();
    return true;
  }
  
  if (message.action === 'summarizePage') {
    console.log('开始处理总结请求...');
    (async () => {
      try {
        const result = await handleSummarizePage(message.tabId);
        console.log('总结完成');
        safeSendResponse(result);
      } catch (error) {
        console.error('处理总结请求时发生错误:', error);
        safeSendResponse({
          error: error.message || '未知错误'
        });
      }
    })();
    return true;
  }
  
  if (message.action === 'startBackgroundSummarize') {
    console.log('开始后台总结任务...');
    startBackgroundSummarize(message.tabId);
    safeSendResponse({started: true});
    return true;
  }
  
  if (message.action === 'getTaskState') {
    chrome.storage.local.get(['taskState'], (result) => {
      safeSendResponse(result.taskState || null);
    });
    return true;
  }
  
  if (message.action === 'clearTaskState') {
    clearTaskState();
    safeSendResponse({cleared: true});
    return true;
  }
  
  console.warn('未知的操作:', message.action);
  safeSendResponse({error: '未知的操作: ' + message.action});
  return false;
});
