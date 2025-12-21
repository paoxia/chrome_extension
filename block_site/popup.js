// 获取当前标签页的URL
async function getCurrentTabUrl() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0].url;
}

// 获取当前标签页
async function getCurrentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

// 刷新当前页面
async function reloadCurrentTab() {
  const tab = await getCurrentTab();
  // 使用forceReload强制刷新，忽略缓存
  await chrome.tabs.reload(tab.id, { bypassCache: true });
}

// 提取域名
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return '';
  }
}

// 显示当前网站
async function displayCurrentSite() {
  const url = await getCurrentTabUrl();
  const domain = extractDomain(url);
  document.getElementById('currentSite').textContent = domain;
}

// 更新已屏蔽网站列表
async function updateBlockedSitesList() {
  const response = await chrome.runtime.sendMessage({ action: 'getBlockedSites' });
  const blockedSites = response.blockedSites || [];
  const listContainer = document.getElementById('blockedSitesList');
  const noSitesMsg = document.getElementById('noSitesMsg');
  
  // 清空列表
  listContainer.innerHTML = '';
  
  if (blockedSites.length === 0) {
    noSitesMsg.style.display = 'block';
  } else {
    noSitesMsg.style.display = 'none';
    
    // 创建列表项
    blockedSites.forEach(site => {
      const siteItem = document.createElement('div');
      siteItem.className = 'blocked-site-item';
      
      const siteName = document.createElement('span');
      siteName.className = 'site-name';
      siteName.textContent = site;
      
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = '移除';
      removeBtn.addEventListener('click', async () => {
        // 保存原始按钮文本
        const originalText = removeBtn.textContent;
        // 禁用按钮防止重复点击
        removeBtn.disabled = true;
        removeBtn.textContent = '移除中...';
        
        try {
          // 添加超时处理
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('操作超时')), 5000);
          });
          
          // 移除屏蔽网站，使用Promise.race处理超时
          await Promise.race([
            chrome.runtime.sendMessage({ action: 'removeBlockedSite', site }),
            timeoutPromise
          ]);
          
          // 更新列表
          await Promise.race([
            updateBlockedSitesList(),
            timeoutPromise
          ]);
          
          // 刷新页面
          await Promise.race([
            reloadCurrentTab(),
            timeoutPromise
          ]);
        } catch (error) {
          console.error('移除操作失败:', error);
        } finally {
          // 恢复按钮状态
          removeBtn.disabled = false;
          removeBtn.textContent = originalText;
        }
      });
      
      siteItem.appendChild(siteName);
      siteItem.appendChild(removeBtn);
      listContainer.appendChild(siteItem);
    });
  }
}

// 检查当前网站是否已被屏蔽
async function checkCurrentSiteStatus() {
  const url = await getCurrentTabUrl();
  const domain = extractDomain(url);
  
  if (domain) {
    const response = await chrome.runtime.sendMessage({ action: 'getBlockedSites' });
    const blockedSites = response.blockedSites || [];
    const isBlocked = blockedSites.includes(domain);
    
    // 更新按钮显示状态
    const blockBtn = document.getElementById('blockCurrentBtn');
    const unblockBtn = document.getElementById('unblockCurrentBtn');
    
    if (isBlocked) {
      blockBtn.style.display = 'none';
      unblockBtn.style.display = 'block';
    } else {
      blockBtn.style.display = 'block';
      unblockBtn.style.display = 'none';
    }
  }
}

// 初始化
async function init() {
  // 并行执行初始化任务，提高启动速度
  await Promise.all([
    displayCurrentSite(),
    updateBlockedSitesList(),
    checkCurrentSiteStatus()
  ]);
  
  // 绑定屏蔽当前网站按钮事件
  document.getElementById('blockCurrentBtn').addEventListener('click', async () => {
    const url = await getCurrentTabUrl();
    const domain = extractDomain(url);
    
    if (domain) {
      // 先禁用按钮防止重复点击
      const blockBtn = document.getElementById('blockCurrentBtn');
      blockBtn.disabled = true;
      blockBtn.textContent = '处理中...';
      
      try {
        // 添加屏蔽网站
        await chrome.runtime.sendMessage({ action: 'addBlockedSite', site: domain });
        
        // 并行执行后续操作
        await Promise.all([
          updateBlockedSitesList(),
          checkCurrentSiteStatus()
        ]);
        
        // 最后刷新页面
        await reloadCurrentTab();
      } catch (error) {
        console.error('屏蔽操作失败:', error);
      } finally {
        // 恢复按钮状态
        blockBtn.disabled = false;
        blockBtn.textContent = '屏蔽当前网站';
      }
    }
  });
  
  // 绑定移除屏蔽按钮事件
  document.getElementById('unblockCurrentBtn').addEventListener('click', async () => {
    const url = await getCurrentTabUrl();
    const domain = extractDomain(url);
    
    if (domain) {
      // 先禁用按钮防止重复点击
      const unblockBtn = document.getElementById('unblockCurrentBtn');
      unblockBtn.disabled = true;
      unblockBtn.textContent = '处理中...';
      
      try {
        // 移除屏蔽网站
        await chrome.runtime.sendMessage({ action: 'removeBlockedSite', site: domain });
        
        // 并行执行后续操作
        await Promise.all([
          updateBlockedSitesList(),
          checkCurrentSiteStatus()
        ]);
        
        // 最后刷新页面
        await reloadCurrentTab();
      } catch (error) {
        console.error('移除屏蔽操作失败:', error);
      } finally {
        // 恢复按钮状态
        unblockBtn.disabled = false;
        unblockBtn.textContent = '移除屏蔽';
      }
    }
  });
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);