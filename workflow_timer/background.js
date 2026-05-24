let timerState = {
  isRunning: false,
  workflowId: null,
  stepIndex: 0,
  remainingSeconds: 0
};

let offscreenDocumentCreated = false;

async function ensureOffscreenDocument() {
  if (offscreenDocumentCreated) return;
  
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: '播放步骤完成提示音'
    });
    offscreenDocumentCreated = true;
  } catch (e) {
    if (e.message.includes('already exists')) {
      offscreenDocumentCreated = true;
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startTimer') {
    timerState.isRunning = true;
    timerState.workflowId = message.workflowId;
    timerState.stepIndex = message.stepIndex;
    timerState.remainingSeconds = message.seconds;
    
    chrome.storage.local.set({timerState: timerState});
    
    startTimerInterval();
    sendResponse({success: true});
  }
  
  if (message.action === 'pauseTimer') {
    timerState.isRunning = false;
    chrome.storage.local.set({timerState: timerState});
    stopTimerInterval();
    sendResponse({success: true});
  }
  
  if (message.action === 'stopTimer') {
    timerState.isRunning = false;
    timerState.remainingSeconds = 0;
    chrome.storage.local.set({timerState: timerState});
    stopTimerInterval();
    sendResponse({success: true});
  }
  
  if (message.action === 'getTimerState') {
    sendResponse(timerState);
  }
  
  return true;
});

let timerInterval = null;

function startTimerInterval() {
  stopTimerInterval();
  
  timerInterval = setInterval(() => {
    if (timerState.isRunning && timerState.remainingSeconds > 0) {
      timerState.remainingSeconds--;
      chrome.storage.local.set({timerState: timerState});
      
      if (timerState.remainingSeconds <= 0) {
        timerState.isRunning = false;
        stopTimerInterval();
        
        playNotificationSound();
        
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: '步骤完成',
          message: '当前步骤已完成，请查看下一步',
          requireInteraction: true
        });
      }
    }
  }, 1000);
}

function stopTimerInterval() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

async function playNotificationSound() {
  await ensureOffscreenDocument();
  chrome.runtime.sendMessage({action: 'playSound'});
}

chrome.storage.local.get(['timerState'], (result) => {
  if (result.timerState && result.timerState.isRunning) {
    timerState = result.timerState;
    startTimerInterval();
  }
});
