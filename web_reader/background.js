// 测试Ollama连接并获取可用模型列表
async function testOllamaConnection() {
  try {
    const response = await fetch('http://localhost:11434/api/tags', {
      method: 'GET'
    });
    
    if (!response.ok) {
      throw new Error(`无法连接到Ollama服务: ${response.status}`);
    }
    
    const data = await response.json();
    return data.models || [];
  } catch (error) {
    console.error('测试Ollama连接失败:', error);
    throw error;
  }
}

// 获取可用的模型名称
async function getAvailableModel() {
  try {
    const models = await testOllamaConnection();
    if (!models || models.length === 0) {
      throw new Error('未找到可用的模型，请先下载模型');
    }
    
    // 优先选择中文模型（包含 qwen, llama, mistral 等常见模型）
    const preferredModels = models.filter(m => {
      const name = m.name.toLowerCase();
      return name.includes('qwen') || name.includes('llama') || name.includes('mistral') || name.includes('chatglm');
    });
    
    // 如果有优先模型，使用第一个；否则使用第一个可用模型
    const selectedModel = preferredModels.length > 0 ? preferredModels[0] : models[0];
    console.log('选择的模型:', selectedModel.name);
    return selectedModel.name;
  } catch (error) {
    console.error('获取模型列表失败:', error);
    throw error;
  }
}

// 与本地ollama API通信的函数
async function summarizeWithOllama(content, title) {
  try {
    console.log('开始调用Ollama API...');
    
    // 先获取可用的模型
    const modelName = await getAvailableModel();
    console.log('使用模型:', modelName);
    console.log('请求URL: http://localhost:11434/api/generate');
    
    const requestBody = {
      model: modelName, 
      prompt: `请用中文总结以下网页内容，标题为"${title}"：\n\n${content}`,
      stream: false
    };
    
    console.log('请求体:', JSON.stringify(requestBody, null, 2));
    
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log('响应状态:', response.status, response.statusText);
    console.log('响应头:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      // 尝试获取错误详情
      let errorMessage = `API请求失败: ${response.status}`;
      let errorDetail = '';
      
      try {
        const errorData = await response.text();
        console.error('错误响应内容:', errorData);
        if (errorData) {
          try {
            const errorJson = JSON.parse(errorData);
            errorDetail = errorJson.error || errorData;
          } catch {
            errorDetail = errorData;
          }
          errorMessage += ` - ${errorDetail}`;
        }
      } catch (e) {
        console.error('解析错误响应失败:', e);
      }
      
      // 如果是403，提供更具体的提示
      if (response.status === 403) {
        errorMessage += `。使用的模型: ${modelName}。可能原因：1) 该模型不存在或未正确下载；2) 模型名称格式不正确；3) Ollama服务配置问题。请使用"测试Ollama连接"按钮查看可用的模型列表。`;
      }
      
      throw new Error(errorMessage);
    }
    
    const data = await response.json();
    console.log('响应数据:', data);
    
    if (!data.response) {
      throw new Error('Ollama API返回格式错误，未找到response字段。响应: ' + JSON.stringify(data));
    }
    return data.response;
  } catch (error) {
    console.error('与Ollama通信失败:', error);
    // 如果是网络错误，提供更友好的提示
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('ERR_')) {
      throw new Error('无法连接到Ollama服务，请确保Ollama正在运行（http://localhost:11434）');
    }
    throw error;
  }
}

// 将Chrome API回调转换为Promise的辅助函数
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

// 处理总结页面的异步函数
async function handleSummarizePage() {
  try {
    // 获取当前标签页
    const tabs = await queryTabs({active: true, currentWindow: true});
    
    if (tabs.length === 0) {
      return {error: '无法获取当前标签页'};
    }
    
    const tab = tabs[0];
    
    // 检查是否为chrome:// URL
    if (tab.url.startsWith('chrome://')) {
      return {error: '无法在Chrome内置页面上使用此插件'};
    }
    
    // 先执行content script
    try {
      await executeScript({
        target: {tabId: tab.id},
        files: ['content.js']
      });
    } catch (error) {
      return {error: '无法注入content script: ' + error.message};
    }
    
    // 向content script发送消息，获取页面内容
    let pageContent;
    try {
      pageContent = await sendMessageToTab(tab.id, {action: 'getPageContent'});
    } catch (error) {
      return {error: '无法与页面通信: ' + error.message};
    }
    
    if (!pageContent) {
      return {error: '无法获取页面内容'};
    }
    
    // 调用ollama进行总结
    try {
      const summary = await summarizeWithOllama(pageContent.content, pageContent.title);
      return {summary: summary};
    } catch (error) {
      console.error('总结失败:', error);
      return {error: error.message};
    }
  } catch (error) {
    console.error('处理总结请求失败:', error);
    return {error: error.message};
  }
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('收到消息:', message.action);
  
  // 使用标志确保 sendResponse 只被调用一次
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
  
  // 测试Ollama连接
  if (message.action === 'testConnection') {
    console.log('开始测试Ollama连接...');
    // 使用 async 函数包装，确保正确处理
    (async () => {
      try {
        const models = await testOllamaConnection();
        console.log('测试连接成功，找到模型:', models.length);
        const modelNames = models.map(m => m.name).join(', ');
        safeSendResponse({
          success: true,
          message: `连接成功！可用模型: ${modelNames || '无'}`,
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
    return true; // 保持消息通道开放
  }
  
  // 总结页面
  if (message.action === 'summarizePage') {
    console.log('开始处理总结请求...');
    // 使用 async 函数包装，确保正确处理
    (async () => {
      try {
        const result = await handleSummarizePage();
        console.log('总结完成');
        safeSendResponse(result);
      } catch (error) {
        console.error('处理总结请求时发生错误:', error);
        safeSendResponse({
          error: error.message || '未知错误'
        });
      }
    })();
    return true; // 保持消息通道开放
  }
  
  // 如果消息不匹配任何操作，返回错误
  console.warn('未知的操作:', message.action);
  safeSendResponse({error: '未知的操作: ' + message.action});
  return false;
});
