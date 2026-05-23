(function() {
  'use strict';
  
  function isFollowPage() {
    return window.location.pathname.includes('/account/follow') || 
           window.location.href.includes('member.bilibili.com');
  }
  
  function getVideoCards() {
    return document.querySelectorAll('.small-item, .bili-video-card');
  }
  
  function getUnwatchedVideos() {
    const cards = getVideoCards();
    const unwatched = [];
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    
    cards.forEach(card => {
      const timeElement = card.querySelector('.pubdate-text, .bili-video-card__info--date');
      if (timeElement) {
        const timeText = timeElement.textContent;
        const videoTime = parseRelativeTime(timeText);
        
        if (videoTime && videoTime > twoDaysAgo) {
          const link = card.querySelector('a[href*="video/BV"], a[href*="video/av"]');
          if (link) {
            const href = link.getAttribute('href');
            const aidMatch = href.match(/av(\d+)/);
            const bvidMatch = href.match(/BV\w+/);
            
            if (aidMatch || bvidMatch) {
              unwatched.push({
                aid: aidMatch ? aidMatch[1] : null,
                bvid: bvidMatch ? bvidMatch[0] : null,
                title: card.querySelector('.title, .bili-video-card__info--tit')?.textContent?.trim()
              });
            }
          }
        }
      }
    });
    
    return unwatched;
  }
  
  function parseRelativeTime(timeText) {
    const now = Date.now();
    const match = timeText.match(/(\d+)(小时|天|分钟|秒)前/);
    
    if (!match) return null;
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case '秒':
        return now - value * 1000;
      case '分钟':
        return now - value * 60 * 1000;
      case '小时':
        return now - value * 60 * 60 * 1000;
      case '天':
        return now - value * 24 * 60 * 60 * 1000;
      default:
        return null;
    }
  }
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'scanVideos') {
      const videos = getUnwatchedVideos();
      sendResponse({videos: videos});
    }
    return true;
  });
  
  console.log('Bilibili 助手已加载');
})();
