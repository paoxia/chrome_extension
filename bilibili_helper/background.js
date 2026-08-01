const BILIBILI_API = {
  navInfo: 'https://api.bilibili.com/x/web-interface/nav',
  followings: 'https://api.bilibili.com/x/relation/followings',
  feed: 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all',
  watchLaterList: 'https://api.bilibili.com/x/v2/history/toview/web?jsonp=jsonp',
  watchLater: 'https://api.bilibili.com/x/v2/history/toview/add'
};

const FEED_PARAMS = 'timezone_offset=-480&type=video&platform=web&features=itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,decorationCard,onlyfansAssetsV2,forwardListHidden,ugcDelete,onlyfansQaCard,commentsNewVersion,avatarAutoTheme,sunflowerStyle,cardsEnhance,eva3CardOpus,eva3CardVideo,eva3CardComment,eva3CardVote,eva3CardUser&web_location=333.1365&x-bili-device-req-json=%7B%22platform%22:%22web%22,%22device%22:%22pc%22,%22spmid%22:%22333.1365%22%7D';
const ADDED_HISTORY_KEY = 'watchLaterAddedHistoryV1';
const HISTORY_RETENTION_SECONDS = 32 * 24 * 60 * 60;
const MAX_HISTORY_ITEMS_PER_USER = 5000;
let historyMutationQueue = Promise.resolve();
let watchLaterProcessing = false;

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

function getLocalStorage(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function setLocalStorage(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

function normalizeTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? Math.floor(timestamp) : 0;
}

function pruneUserHistory(history) {
  const cutoff = Math.floor(Date.now() / 1000) - HISTORY_RETENTION_SECONDS;
  return Object.fromEntries(
    Object.entries(history || {})
      .filter(([, record]) => {
        const referenceTime = normalizeTimestamp(record?.publishedAt) || normalizeTimestamp(record?.addedAt);
        return referenceTime >= cutoff;
      })
      .sort(([, left], [, right]) => {
        const leftTime = normalizeTimestamp(left?.publishedAt) || normalizeTimestamp(left?.addedAt);
        const rightTime = normalizeTimestamp(right?.publishedAt) || normalizeTimestamp(right?.addedAt);
        return rightTime - leftTime;
      })
      .slice(0, MAX_HISTORY_ITEMS_PER_USER)
  );
}

function normalizeHistoryStore(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const store = {};
  for (const [userId, history] of Object.entries(value)) {
    const pruned = pruneUserHistory(history);
    if (Object.keys(pruned).length > 0) store[userId] = pruned;
  }
  return store;
}

function withHistoryStore(mutator) {
  const operation = historyMutationQueue.then(async () => {
    const result = await getLocalStorage([ADDED_HISTORY_KEY]);
    const store = normalizeHistoryStore(result[ADDED_HISTORY_KEY]);
    const output = await mutator(store);
    await setLocalStorage({ [ADDED_HISTORY_KEY]: store });
    return output;
  });

  historyMutationQueue = operation.catch(() => {});
  return operation;
}

async function getAddedHistory(userId) {
  return withHistoryStore((store) => ({ ...(store[String(userId)] || {}) }));
}

async function recordAddedVideos(userId, videos) {
  if (!userId || !Array.isArray(videos) || videos.length === 0) return;

  const now = Math.floor(Date.now() / 1000);
  await withHistoryStore((store) => {
    const key = String(userId);
    const history = store[key] || {};
    for (const video of videos) {
      if (!video?.aid) continue;
      history[String(video.aid)] = {
        publishedAt: normalizeTimestamp(video.created),
        addedAt: now
      };
    }
    store[key] = pruneUserHistory(history);
  });
}

async function clearAddedHistory(userId) {
  return withHistoryStore((store) => {
    const key = String(userId);
    const count = Object.keys(store[key] || {}).length;
    delete store[key];
    return count;
  });
}

async function getAddedHistoryCount(userId) {
  const history = await getAddedHistory(userId);
  return Object.keys(history).length;
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

const DEFAULT_RANGE = { value: 2, unit: 'day' };
const STORAGE_KEY = 'watchLaterRange';

async function getRangeSeconds() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const range = result[STORAGE_KEY];
      const valid = range && typeof range.value === 'number' && (range.unit === 'day' || range.unit === 'hour');
      const { value, unit } = valid ? range : DEFAULT_RANGE;
      const secondsPerUnit = unit === 'hour' ? 3600 : 86400;
      resolve(value * secondsPerUnit);
    });
  });
}

async function getRecentVideosFromFeed(rangeSeconds) {
  try {
    const cutoff = Math.floor(Date.now() / 1000) - rangeSeconds;
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

        if (pubDate && pubDate < cutoff) {
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
        console.log('已获取范围内所有视频');
        break;
      }

      offset = data.data.offset;
      page++;

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    const uniqueVideos = Array.from(
      new Map(allVideos.map(video => [String(video.aid), { ...video, aid: String(video.aid) }])).values()
    );
    console.log('动态 feed 获取完成，共', uniqueVideos.length, '个去重后视频');
    return uniqueVideos;
  } catch (error) {
    console.error('获取动态 feed 失败:', error);
    return [];
  }
}

async function getCurrentWatchLaterAidSet() {
  try {
    const response = await fetch(BILIBILI_API.watchLaterList, {
      headers: getCommonHeaders(),
      credentials: 'include'
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      return { success: false, aids: new Set(), error: '稍后观看列表返回了非 JSON 数据' };
    }

    if (data.code !== 0) {
      return { success: false, aids: new Set(), error: data.message || `错误码: ${data.code}` };
    }

    const list = Array.isArray(data.data?.list) ? data.data.list : [];
    return {
      success: true,
      aids: new Set(list.map(item => String(item.aid)).filter(Boolean))
    };
  } catch (error) {
    return { success: false, aids: new Set(), error: error.message };
  }
}

async function getEligibleVideos(rangeSeconds, userId) {
  const [videos, localHistory, remoteWatchLater] = await Promise.all([
    getRecentVideosFromFeed(rangeSeconds),
    getAddedHistory(userId),
    getCurrentWatchLaterAidSet()
  ]);

  const eligible = [];
  const remoteHistoryVideos = [];
  let skippedLocal = 0;
  let skippedRemote = 0;

  for (const video of videos) {
    const aid = String(video.aid);
    if (localHistory[aid]) {
      skippedLocal++;
      continue;
    }
    if (remoteWatchLater.aids.has(aid)) {
      skippedRemote++;
      remoteHistoryVideos.push(video);
      continue;
    }
    eligible.push(video);
  }

  if (remoteHistoryVideos.length > 0) {
    await recordAddedVideos(userId, remoteHistoryVideos);
  }

  if (!remoteWatchLater.success) {
    console.warn('获取当前稍后观看列表失败，已退回本地记录去重:', remoteWatchLater.error);
  }

  return {
    videos: eligible,
    total: videos.length,
    skipped: skippedLocal + skippedRemote,
    skippedLocal,
    skippedRemote,
    remoteCheckFailed: !remoteWatchLater.success
  };
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
  if (watchLaterProcessing) {
    return {success: false, error: '已有添加任务正在进行，请稍候'};
  }

  watchLaterProcessing = true;
  try {
    const isLoggedIn = await checkLogin();
    if (!isLoggedIn) {
      return {success: false, error: '请先登录 Bilibili'};
    }

    const userId = await getUserId();
    if (!userId) {
      return {success: false, error: '无法获取当前用户信息'};
    }

    const rangeSeconds = await getRangeSeconds();
    console.log('开始从动态 feed 获取视频，范围（秒）:', rangeSeconds);
    const candidates = await getEligibleVideos(rangeSeconds, userId);

    if (candidates.total === 0) {
      return {success: false, error: '关注的UP主在所选范围内没有新视频'};
    }

    if (candidates.videos.length === 0) {
      return {
        success: true,
        count: 0,
        skipped: candidates.skipped,
        errors: [],
        remoteCheckFailed: candidates.remoteCheckFailed
      };
    }
    
    console.log(`共找到 ${candidates.total} 个视频，跳过 ${candidates.skipped} 个，开始添加 ${candidates.videos.length} 个`);
    
    let totalAdded = 0;
    let errors = [];
    
    for (const video of candidates.videos) {
      const result = await addToWatchLater(video.aid);
      if (result.success) {
        totalAdded++;
        await recordAddedVideos(userId, [video]);
      } else {
        errors.push(`${video.title}: ${result.error}`);
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`处理完成: 成功添加 ${totalAdded}, 失败 ${errors.length}`);
    
    if (totalAdded === 0 && errors.length > 0) {
      return {success: false, error: errors[0]};
    }
    
    return {
      success: true,
      count: totalAdded,
      skipped: candidates.skipped,
      errors,
      remoteCheckFailed: candidates.remoteCheckFailed
    };
  } catch (error) {
    console.error('处理稍后观看失败:', error);
    return {success: false, error: error.message};
  } finally {
    watchLaterProcessing = false;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'addWatchLater') {
    processWatchLater().then(sendResponse);
    return true;
  }
  
  if (message.action === 'getVideoCount') {
    (async () => {
      const isLoggedIn = await checkLogin();
      const userId = isLoggedIn ? await getUserId() : null;
      if (!userId) {
        sendResponse({count: 0, skipped: 0, error: '请先登录 Bilibili'});
        return;
      }
      const rangeSeconds = await getRangeSeconds();
      const candidates = await getEligibleVideos(rangeSeconds, userId);
      sendResponse({
        count: candidates.videos.length,
        skipped: candidates.skipped,
        total: candidates.total,
        remoteCheckFailed: candidates.remoteCheckFailed
      });
    })();
    return true;
  }

  if (message.action === 'getAddedHistoryStats') {
    (async () => {
      const userId = await getUserId();
      if (!userId) {
        sendResponse({success: false, count: 0, error: '请先登录 Bilibili'});
        return;
      }
      const count = await getAddedHistoryCount(userId);
      sendResponse({success: true, count});
    })();
    return true;
  }

  if (message.action === 'clearAddedHistory') {
    (async () => {
      const userId = await getUserId();
      if (!userId) {
        sendResponse({success: false, count: 0, error: '请先登录 Bilibili'});
        return;
      }
      const count = await clearAddedHistory(userId);
      sendResponse({success: true, count});
    })();
    return true;
  }
  
  return false;
});
