// 监听来自background或popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getPageContent') {
    // 读取网页标题
    const title = document.title;
    
    // 读取网页主要内容
    let content = '';
    
    // 尝试获取主要内容区域
    const mainContent = document.querySelector('main') || 
                       document.querySelector('article') || 
                       document.querySelector('.article-content') || 
                       document.querySelector('.content') || 
                       document.body;
    
    // 提取文本内容，排除脚本和样式
    const walker = document.createTreeWalker(
      mainContent,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent.trim();
      if (text) {
        content += text + '\n';
      }
    }
    
    // 限制内容长度，避免超过API限制
    const maxContentLength = 10000;
    if (content.length > maxContentLength) {
      content = content.substring(0, maxContentLength) + '...';
    }
    
    // 发送内容回background
    sendResponse({
      title: title,
      content: content
    });
  }
});
