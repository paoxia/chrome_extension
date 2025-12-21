// 生成规则ID，使用网站哈希值确保ID稳定
function generateRuleId(site) {
  // 简单的哈希函数，生成稳定的规则ID
  let hash = 0;
  for (let i = 0; i < site.length; i++) {
    const char = site.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash) % 1000000 + 1; // 确保ID在1-1000000之间
}

// 生成单个规则
function generateRule(site) {
  return {
    id: generateRuleId(site),
    priority: 1,
    action: {
      type: 'block'
    },
    condition: {
      urlFilter: `*://${site}/*`,
      resourceTypes: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'other']
    }
  };
}

// 初始化规则 - 只在扩展启动时调用
async function initRules() {
  try {
    // 先获取所有现有规则
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map(rule => rule.id);
    
    // 获取所有应该存在的规则
    const { blockedSites = [] } = await chrome.storage.local.get('blockedSites');
    const newRules = blockedSites.map(generateRule);
    
    // 移除所有旧规则，然后添加所有新规则
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRuleIds,
      addRules: newRules
    });
  } catch (error) {
    console.error('规则初始化失败:', error);
  }
}

// 添加屏蔽网站
async function addBlockedSite(site) {
  const { blockedSites = [] } = await chrome.storage.local.get('blockedSites');
  
  // 检查是否已经存在
  if (!blockedSites.includes(site)) {
    // 更新存储
    const newBlockedSites = [...blockedSites, site];
    await chrome.storage.local.set({ blockedSites: newBlockedSites });
    
    // 只添加新规则，不重新处理所有规则
    try {
      const newRule = generateRule(site);
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [newRule]
      });
    } catch (error) {
      console.error('添加规则失败:', error);
      // 失败时回退到完整更新
      await initRules();
    }
  }
}

// 移除屏蔽网站
async function removeBlockedSite(site) {
  const { blockedSites = [] } = await chrome.storage.local.get('blockedSites');
  
  // 检查是否存在
  if (blockedSites.includes(site)) {
    // 更新存储
    const newBlockedSites = blockedSites.filter(s => s !== site);
    await chrome.storage.local.set({ blockedSites: newBlockedSites });
    
    // 只移除对应的规则，不重新处理所有规则
    try {
      const ruleId = generateRuleId(site);
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [ruleId]
      });
    } catch (error) {
      console.error('移除规则失败:', error);
      // 失败时回退到完整更新
      await initRules();
    }
  }
}

// 监听存储变化 - 只在外部修改存储时使用
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.blockedSites) {
    // 仅当变化不是由我们的扩展引起时才重新初始化
    // 这里简单处理，只在扩展首次加载时使用initRules
    // 平时通过addBlockedSite和removeBlockedSite直接操作规则
  }
});

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'addBlockedSite') {
    addBlockedSite(message.site).then(() => sendResponse({ success: true }));
    return true;
  } else if (message.action === 'removeBlockedSite') {
    removeBlockedSite(message.site).then(() => sendResponse({ success: true }));
    return true;
  } else if (message.action === 'getBlockedSites') {
    chrome.storage.local.get('blockedSites').then(data => {
      sendResponse({ blockedSites: data.blockedSites || [] });
    });
    return true;
  }
});

// 初始化
initRules();