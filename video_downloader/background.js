chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getVideos') {
    chrome.storage.local.get(['detectedVideos'], (result) => {
      sendResponse({videos: result.detectedVideos || []});
    });
    return true;
  }
});
