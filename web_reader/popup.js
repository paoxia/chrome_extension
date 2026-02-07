document.addEventListener('DOMContentLoaded', function() {
  const testBtn = document.getElementById('testBtn');
  const summarizeBtn = document.getElementById('summarizeBtn');
  const statusDiv = document.getElementById('status');
  const resultDiv = document.getElementById('result');
  
  // 测试连接按钮
  testBtn.addEventListener('click', function() {
    testBtn.disabled = true;
    statusDiv.textContent = '正在测试连接...';
    statusDiv.className = '';
    resultDiv.textContent = '';
    
    chrome.runtime.sendMessage({action: 'testConnection'}, function(response) {
      testBtn.disabled = false;
      
      // 检查是否有运行时错误
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
      
      // 检查响应是否存在
      if (!response) {
        statusDiv.textContent = '错误：未收到响应';
        statusDiv.className = 'error';
        resultDiv.textContent = '请检查Service Worker控制台获取详细信息';
        return;
      }
      
      if (response.success) {
        statusDiv.textContent = response.message;
        statusDiv.className = '';
        if (response.models && response.models.length > 0) {
          const modelList = response.models.map(m => `- ${m.name}`).join('\n');
          resultDiv.textContent = `可用模型列表：\n${modelList}`;
        } else {
          resultDiv.textContent = '未找到可用模型，请先下载模型。';
        }
      } else {
        statusDiv.textContent = '连接失败：' + (response.error || '未知错误');
        statusDiv.className = 'error';
        resultDiv.textContent = '请确保：\n1. Ollama服务正在运行\n2. 扩展已重新加载\n3. 检查浏览器控制台获取详细信息';
      }
    });
  });
  
  summarizeBtn.addEventListener('click', function() {
    // 禁用按钮，显示加载状态
    summarizeBtn.disabled = true;
    statusDiv.textContent = '正在读取网页内容...';
    resultDiv.textContent = '';
    
    // 向background发送消息，请求总结网页
    chrome.runtime.sendMessage({action: 'summarizePage'}, function(response) {
      // 恢复按钮状态
      summarizeBtn.disabled = false;
      
      // 检查是否有运行时错误
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message;
        statusDiv.textContent = '错误：' + errorMsg;
        statusDiv.className = 'error';
        if (errorMsg.includes('message port closed')) {
          resultDiv.textContent = '消息通道已关闭。请确保：\n1. 扩展已正确加载\n2. 重新加载扩展后重试\n3. 检查Service Worker是否正常运行';
        }
        return;
      }
      
      // 检查响应是否存在
      if (!response) {
        statusDiv.textContent = '错误：未收到响应';
        statusDiv.className = 'error';
        return;
      }
      
      if (response.error) {
        // 显示错误信息
        statusDiv.textContent = '错误：' + response.error;
        statusDiv.className = 'error';
      } else if (response.summary) {
        // 显示总结结果
        statusDiv.textContent = '总结完成';
        statusDiv.className = '';
        resultDiv.textContent = response.summary;
      } else {
        // 显示未知错误
        statusDiv.textContent = '未知错误：未收到有效响应';
        statusDiv.className = 'error';
      }
    });
  });
});
