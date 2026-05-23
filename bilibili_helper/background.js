const BILIBILI_API = {
  checkin: 'https://api.bilibili.com/x/web-interface/coin/today/add',
  userInfo: 'https://api.bilibili.com/x/space/acc/info',
  getCoins: 'https://api.bilibili.com/x/member/web/coin/log',
  followings: 'https://api.bilibili.com/x/relation/followings',
  videos: 'https://api.bilibili.com/x/space/wbi/arc/search',
  watchLater: 'https://api.bilibili.com/x/v2/history/toview/add'
};

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

async function doCheckin() {
  try {
    const isLoggedIn = await checkLogin();
    if (!isLoggedIn) {
      return {success: false, error: '请先登录 Bilibili'};
    }
    
    const response = await fetch(BILIBILI_API.checkin, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (data.code === 0) {
      const today = new Date().toDateString();
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(['checkinDays'], (res) => {
          const days = (res.checkinDays || 0) + 1;
          chrome.storage.local.set({
            checkinStatus: true,
            checkinDays: days,
            lastCheckinDate: today
          }, () => resolve({success: true, days: days}));
        });
      });
      return result;
    } else if (data.code === -111) {
      return {success: false, error: '请先登录 Bilibili'};
    } else {
      return {success: false, error: data.message || '签到失败'};
    }
  } catch (error) {
    console.error('签到失败:', error);
    return {success: false, error: error.message};
  }
}

async function getFollowings() {
  try {
    const vmid = await getUserId();
    if (!vmid) {
      return [];
    }
    
    const response = await fetch(`${BILIBILI_API.followings}?vmid=${vmid}&pn=1&ps=50`, {
      credentials: 'include'
    });
    
    const data = await response.json();
    if (data.code === 0 && data.data && data.data.list) {
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
    const response = await fetch(BILIBILI_API.userInfo, {
      credentials: 'include'
    });
    const data = await response.json();
    if (data.code === 0 && data.data) {
      return data.data.mid;
    }
    return null;
  } catch (error) {
    console.error('获取用户ID失败:', error);
    return null;
  }
}

async function getRecentVideos(mid) {
  try {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const response = await fetch(`${BILIBILI_API.videos}?mid=${mid}&ps=30&order=pubdate`, {
      credentials: 'include'
    });
    
    const data = await response.json();
    if (data.code === 0 && data.data && data.data.list && data.data.list.vlist) {
      return data.data.list.vlist
        .filter(video => video.created * 1000 > twoDaysAgo)
        .map(video => ({
          aid: video.aid,
          title: video.title,
          created: video.created
        }));
    }
    return [];
  } catch (error) {
    console.error('获取视频列表失败:', error);
    return [];
  }
}

async function addToWatchLater(aid) {
  try {
    const response = await fetch(BILIBILI_API.watchLater, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `aid=${aid}`,
      credentials: 'include'
    });
    
    const data = await response.json();
    return data.code === 0;
  } catch (error) {
    console.error('添加稍后观看失败:', error);
    return false;
  }
}

async function processWatchLater() {
  try {
    const isLoggedIn = await checkLogin();
    if (!isLoggedIn) {
      return {success: false, error: '请先登录 Bilibili'};
    }
    
    const followings = await getFollowings();
    if (followings.length === 0) {
      return {success: false, error: '未找到关注的UP主'};
    }
    
    let totalAdded = 0;
    
    for (const mid of followings.slice(0, 10)) {
      const videos = await getRecentVideos(mid);
      for (const video of videos) {
        const success = await addToWatchLater(video.aid);
        if (success) {
          totalAdded++;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    return {success: true, count: totalAdded};
  } catch (error) {
    console.error('处理稍后观看失败:', error);
    return {success: false, error: error.message};
  }
}

chrome.alarms.create('dailyCheckin', {
  periodInMinutes: 60
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'dailyCheckin') {
    const result = await chrome.storage.local.get(['lastCheckinDate']);
    const today = new Date().toDateString();
    
    if (result.lastCheckinDate !== today) {
      await doCheckin();
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'checkin') {
    doCheckin().then(sendResponse);
    return true;
  }
  
  if (message.action === 'addWatchLater') {
    processWatchLater().then(sendResponse);
    return true;
  }
  
  if (message.action === 'getVideoCount') {
    (async () => {
      const followings = await getFollowings();
      let totalCount = 0;
      
      for (const mid of followings.slice(0, 5)) {
        const videos = await getRecentVideos(mid);
        totalCount += videos.length;
      }
      
      sendResponse({count: totalCount});
    })();
    return true;
  }
  
  return false;
});
