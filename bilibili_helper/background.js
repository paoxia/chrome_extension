const BILIBILI_API = {
  navInfo: 'https://api.bilibili.com/x/web-interface/nav',
  followings: 'https://api.bilibili.com/x/relation/followings',
  feed: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all',
  watchLater: 'https://api.bilibili.com/x/v2/history/toview/add'
};

const FEED_PARAMS = 'timezone_offset=-480&type=video&platform=web&features=itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,onlyfansAssetsV2,forwardListHidden,ugcDelete,onlyfansQaCard,commentsNewVersion,avatarAutoTheme,sunflowerStyle,cardsEnhance,eva3CardOpus,eva3CardVideo,eva3CardComment,eva3CardVote,eva3CardUser&web_location=333.1365&x-bili-device-req-json=%7B%22platform%22:%22web%22,%22device%22:%22pc%22,%22spmid%22:%22333.1365%22%7D';

async function getCookie(name) {
  return new Promise((resolve) => {
    chrome.cookies.get({url: 'https://www.bilibili.com', name: name}, (cookie) => {
      resolve(cookie ? cookie.value : null);
    });
  });
}

async function checkLogin() {
  const sessdata = await getCookie('SESSDATA');
  return !!sessdata;
}

async function getCsrfToken() {
  return await getCookie('bili_jct');
}

function getCommonHeaders() {
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Referer': 'https://www.bilibili.com/',
    'Origin': 'https://www.bilibili.com',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
  };
}

async function getFollowings() {
  try {
    const vmid = await getUserId();
    if (!vmid) {
      console.error('获取关注列表失败: 无法获取用户ID');
      return [];
    }
    
    console.log('当前用户ID:', vmid);
    
    const response = await fetch(`${BILIBILI_API.followings}?vmid=${vmid}&pn=1&ps=50&order=desc`, {
      headers: getCommonHeaders(),
      credentials: 'include'
    });
    
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error('关注列表响应不是 JSON:', text.substring(0, 200));
      return [];
    }
    
    console.log('关注列表 API code:', data.code, 'message:', data.message);
    
    if (data.code === 0 && data.data && data.data.list) {
      console.log('关注UP主数量:', data.data.list.length);
      return data.data.list.map(item => item.mid);
    }
    return [];
  } catch (error) {
    console.error('获取关注列表失败:', error);
    return [];
  }
}

async function getUserId() {
  try {
    const response = await fetch(BILIBILI_API.navInfo, {
      headers: getCommonHeaders(),
      credentials: 'include'
    });
    
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error('响应不是 JSON:', text.substring(0, 200));
      return null;
    }
    
    if (data.code === 0 && data.data) {
      return data.data.mid;
    }
    return null;
  } catch (error) {
    console.error('获取用户ID失败:', error);
    return null;
  }
}

async function getRecentVideosFromFeed() {
  try {
    const twoDaysAgo = Math.floor((Date.now() - 2 * 24 * 60 * 60 * 1000) / 1000);
    const allVideos = [];
    let offset = '';
    let page = 0;
    const maxPages = 5;
    
    while (page < maxPages) {
      const url = offset 
        ? `${BILIBILI_API.feed}?${FEED_PARAMS}&page=${page + 1}&offset=${offset}`
        : `${BILIBILI_API.feed}?${FEED_PARAMS}&page=${page + 1}`;
      
      const response = await fetch(url, {
        headers: {
          'Referer': 'https://www.bilibili.com/',
          'Origin': 'https://www.bilibili.com',
          'Accept': 'application/json, text/plain, */*'
        },
        credentials: 'include'
      });
      
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error('动态 feed 响应不是 JSON:', text.substring(0, 200));
        break;
      }
      
      if (data.code !== 0) {
        console.error('获取动态 feed 失败:', data.code, data.message);
        break;
      }
      
      if (!data.data || !data.data.items || data.data.items.length === 0) {
        console.log('没有更多动态');
        break;
      }
      
      let hasOldVideo = false;
      
      for (const item of data.data.items) {
        if (item.type !== 'DYNAMIC_TYPE_AV') continue;
        
        const modules = item.modules;
        if (!modules || !modules.module_dynamic) continue;
        
        const major = modules.module_dynamic.major;
        if (!major || !major.archive) continue;
        
        const archive = major.archive;
        const pubDate = archive.pubdate || (modules.module_author && modules.module_author.pub_ts);
        
        if (pubDate && pubDate < twoDaysAgo) {
          hasOldVideo = true;
          continue;
        }
        
        if (archive.aid && archive.title) {
          allVideos.push({
            aid: archive.aid,
            title: archive.title,
            created: pubDate
          });
        }
      }
      
      console.log(`第 ${page + 1} 页: 累计 ${allVideos.length} 个视频`);
      
      if (hasOldVideo || !data.data.has_more) {
        console.log('已获取两天内所有视频');
        break;
      }
      
      offset = data.data.offset;
      page++;
      
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log('动态 feed 获取完成，共', allVideos.length, '个视频');
    return allVideos;
  } catch (error) {
    console.error('获取动态 feed 失败:', error);
    return [];
  }
}

async function addToWatchLater(aid) {
  try {
    const csrf = await getCsrfToken();
    if (!csrf) {
      return {success: false, error: '无法获取 CSRF Token'};
    }
    
    const formData = new URLSearchParams();
    formData.append('aid', aid);
    formData.append('csrf', csrf);
    
    const response = await fetch(BILIBILI_API.watchLater, {
      method: 'POST',
      headers: getCommonHeaders(),
      body: formData.toString(),
      credentials: 'include'
    });
    
    console.log(`[添加稍后观看 aid=${aid}] HTTP状态:`, response.status, 'Content-Type:', response.headers.get('content-type'));
    
    const text = await response.text();
    console.log(`[添加稍后观看 aid=${aid}] 响应前100字符:`, text.substring(0, 100));
    
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error(`[添加稍后观看 aid=${aid}] 响应不是 JSON:`, text.substring(0, 200));
      return {success: false, error: 'API 返回 HTML 而非 JSON，可能需要重新登录'};
    }
    
    if (data.code === 0) {
      return {success: true};
    } else {
      console.error(`[添加稍后观看 aid=${aid}] 失败:`, data.code, data.message);
      return {success: false, error: data.message || `错误码: ${data.code}`};
    }
  } catch (error) {
    console.error('添加稍后观看失败:', error);
    return {success: false, error: error.message};
  }
}

async function processWatchLater() {
  try {
    const isLoggedIn = await checkLogin();
    if (!isLoggedIn) {
      return {success: false, error: '请先登录 Bilibili'};
    }
    
    console.log('开始从动态 feed 获取视频...');
    const videos = await getRecentVideosFromFeed();
    
    if (videos.length === 0) {
      return {success: false, error: '关注的UP主两天内没有新视频'};
    }
    
    console.log('共找到', videos.length, '个视频，开始添加到稍后观看');
    
    let totalAdded = 0;
    let errors = [];
    
    for (const video of videos) {
      const result = await addToWatchLater(video.aid);
      if (result.success) {
        totalAdded++;
      } else {
        errors.push(`${video.title}: ${result.error}`);
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`处理完成: 成功添加 ${totalAdded}, 失败 ${errors.length}`);
    
    if (totalAdded === 0 && errors.length > 0) {
      return {success: false, error: errors[0]};
    }
    
    return {success: true, count: totalAdded, errors: errors};
  } catch (error) {
    console.error('处理稍后观看失败:', error);
    return {success: false, error: error.message};
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'addWatchLater') {
    processWatchLater().then(sendResponse);
    return true;
  }
  
  if (message.action === 'getVideoCount') {
    (async () => {
      const videos = await getRecentVideosFromFeed();
      sendResponse({count: videos.length});
    })();
    return true;
  }
  
  return false;
});