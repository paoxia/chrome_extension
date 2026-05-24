let workflows = [];
let currentWorkflow = null;
let editingStepIndex = -1;
let timerState = {
  isRunning: false,
  isPaused: false,
  currentStepIndex: 0,
  remainingSeconds: 0,
  totalSeconds: 0
};

let pollInterval = null;

const workflowListView = document.getElementById('workflowListView');
const workflowEditView = document.getElementById('workflowEditView');
const timerView = document.getElementById('timerView');
const workflowList = document.getElementById('workflowList');
const noWorkflowMsg = document.getElementById('noWorkflowMsg');
const stepsList = document.getElementById('stepsList');
const stepModal = document.getElementById('stepModal');

function loadWorkflows() {
  chrome.storage.local.get(['workflows'], (result) => {
    workflows = result.workflows || [];
    renderWorkflowList();
    checkRunningTimer();
  });
}

function checkRunningTimer() {
  chrome.storage.local.get(['runningTimer'], (result) => {
    if (result.runningTimer && result.runningTimer.workflowId) {
      const wf = workflows.find(w => w.id === result.runningTimer.workflowId);
      if (wf) {
        currentWorkflow = wf;
        timerState.currentStepIndex = result.runningTimer.stepIndex;
        
        chrome.runtime.sendMessage({action: 'getTimerState'}, (state) => {
          if (state && state.isRunning && state.remainingSeconds > 0) {
            timerState.isRunning = true;
            timerState.remainingSeconds = state.remainingSeconds;
            const step = currentWorkflow.steps[timerState.currentStepIndex];
            if (step && !step.manual) {
              timerState.totalSeconds = step.duration * 60;
            }
            showTimerView();
            updateTimerDisplay();
            startPolling();
          } else {
            timerState.currentStepIndex++;
            timerState.isRunning = false;
            timerState.remainingSeconds = 0;
            
            if (timerState.currentStepIndex >= currentWorkflow.steps.length) {
              chrome.storage.local.remove(['runningTimer']);
              showListView();
            } else {
              chrome.storage.local.set({
                runningTimer: {
                  isRunning: false,
                  workflowId: result.runningTimer.workflowId,
                  stepIndex: timerState.currentStepIndex
                }
              });
              
              const step = currentWorkflow.steps[timerState.currentStepIndex];
              if (step && !step.manual) {
                timerState.totalSeconds = step.duration * 60;
                timerState.remainingSeconds = step.duration * 60;
              }
              showTimerView();
              updateTimerDisplay();
            }
          }
        });
      }
    }
  });
}

function saveWorkflows(callback) {
  chrome.storage.local.set({workflows: workflows}, callback);
}

function renderWorkflowList() {
  if (workflows.length === 0) {
    workflowList.innerHTML = '';
    noWorkflowMsg.style.display = 'block';
    return;
  }
  
  noWorkflowMsg.style.display = 'none';
  workflowList.innerHTML = workflows.map((wf, index) => `
    <div class="workflow-item" data-index="${index}">
      <div class="workflow-info">
        <div class="workflow-name">${wf.name}</div>
        <div class="workflow-meta">${wf.steps.length} 个步骤</div>
      </div>
      <div class="workflow-actions">
        <button class="secondary-btn start-workflow-btn" data-index="${index}">开始</button>
        <button class="secondary-btn edit-workflow-btn" data-index="${index}">编辑</button>
      </div>
    </div>
  `).join('');
  
  document.querySelectorAll('.start-workflow-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      startWorkflow(index);
    });
  });
  
  document.querySelectorAll('.edit-workflow-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      editWorkflow(index);
    });
  });
}

function showEditView(workflow = null) {
  workflowListView.style.display = 'none';
  timerView.style.display = 'none';
  workflowEditView.style.display = 'block';
  
  if (workflow) {
    currentWorkflow = JSON.parse(JSON.stringify(workflow));
    document.getElementById('editTitle').textContent = '编辑工作流';
    document.getElementById('workflowName').value = workflow.name;
    document.getElementById('deleteWorkflowBtn').style.display = 'block';
  } else {
    currentWorkflow = {name: '', steps: []};
    document.getElementById('editTitle').textContent = '新建工作流';
    document.getElementById('workflowName').value = '';
    document.getElementById('deleteWorkflowBtn').style.display = 'none';
  }
  
  renderStepsList();
}

function showListView() {
  stopPolling();
  workflowEditView.style.display = 'none';
  timerView.style.display = 'none';
  workflowListView.style.display = 'block';
  currentWorkflow = null;
}

function renderStepsList() {
  if (!currentWorkflow || currentWorkflow.steps.length === 0) {
    stepsList.innerHTML = '<div class="empty-msg">暂无步骤，点击"添加步骤"</div>';
    return;
  }
  
  stepsList.innerHTML = currentWorkflow.steps.map((step, index) => `
    <div class="step-item" data-index="${index}">
      <span class="step-drag">⋮⋮</span>
      <div class="step-info">
        <span class="step-name">${step.name}</span>
        ${step.manual ? '<span class="step-manual-badge">手动</span>' : ''}
        <div class="step-duration">${step.manual ? '需手动确认' : step.duration + ' 分钟'}</div>
      </div>
      <div class="step-actions">
        <button class="edit-step-btn" data-index="${index}">编辑</button>
        <button class="delete-step-btn" data-index="${index}">删除</button>
      </div>
    </div>
  `).join('');
  
  document.querySelectorAll('.edit-step-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index);
      editStep(index);
    });
  });
  
  document.querySelectorAll('.delete-step-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index);
      currentWorkflow.steps.splice(index, 1);
      renderStepsList();
    });
  });
}

function showStepModal(step = null, index = -1) {
  stepModal.style.display = 'flex';
  editingStepIndex = index;
  
  if (step) {
    document.getElementById('stepModalTitle').textContent = '编辑步骤';
    document.getElementById('stepName').value = step.name;
    document.getElementById('stepDuration').value = step.duration || '';
    document.getElementById('stepManual').checked = step.manual || false;
  } else {
    document.getElementById('stepModalTitle').textContent = '添加步骤';
    document.getElementById('stepName').value = '';
    document.getElementById('stepDuration').value = '';
    document.getElementById('stepManual').checked = false;
  }
}

function hideStepModal() {
  stepModal.style.display = 'none';
  editingStepIndex = -1;
}

function editStep(index) {
  const step = currentWorkflow.steps[index];
  showStepModal(step, index);
}

function saveStep() {
  const name = document.getElementById('stepName').value.trim();
  const duration = parseInt(document.getElementById('stepDuration').value) || 0;
  const manual = document.getElementById('stepManual').checked;
  
  if (!name) {
    alert('请输入步骤名称');
    return;
  }
  
  if (!manual && duration <= 0) {
    alert('请输入有效的时长');
    return;
  }
  
  const step = {
    name: name,
    duration: manual ? 0 : duration,
    manual: manual
  };
  
  if (editingStepIndex >= 0) {
    currentWorkflow.steps[editingStepIndex] = step;
  } else {
    currentWorkflow.steps.push(step);
  }
  
  hideStepModal();
  renderStepsList();
}

function saveCurrentWorkflow() {
  const name = document.getElementById('workflowName').value.trim();
  
  if (!name) {
    alert('请输入工作流名称');
    return;
  }
  
  if (currentWorkflow.steps.length === 0) {
    alert('请至少添加一个步骤');
    return;
  }
  
  currentWorkflow.name = name;
  
  const existingIndex = workflows.findIndex(wf => wf.id === currentWorkflow.id);
  if (existingIndex >= 0) {
    workflows[existingIndex] = currentWorkflow;
  } else {
    currentWorkflow.id = Date.now().toString();
    workflows.push(currentWorkflow);
  }
  
  saveWorkflows(() => {
    showListView();
    renderWorkflowList();
  });
}

function editWorkflow(index) {
  showEditView(workflows[index]);
}

function deleteCurrentWorkflow() {
  if (!confirm('确定要删除这个工作流吗？')) return;
  
  const index = workflows.findIndex(wf => wf.id === currentWorkflow.id);
  if (index >= 0) {
    workflows.splice(index, 1);
    saveWorkflows(() => {
      showListView();
      renderWorkflowList();
    });
  }
}

function startWorkflow(index) {
  currentWorkflow = workflows[index];
  timerState = {
    isRunning: false,
    isPaused: false,
    currentStepIndex: 0,
    remainingSeconds: 0,
    totalSeconds: 0
  };
  
  chrome.storage.local.remove(['runningTimer']);
  showTimerView();
}

function showTimerView() {
  workflowListView.style.display = 'none';
  workflowEditView.style.display = 'none';
  timerView.style.display = 'block';
  
  document.getElementById('timerWorkflowName').textContent = currentWorkflow.name;
  renderTimeline();
  resetTimerDisplay();
}

function renderTimeline() {
  const timeline = document.getElementById('stepsTimeline');
  timeline.innerHTML = currentWorkflow.steps.map((step, index) => {
    let statusClass = 'pending';
    if (index < timerState.currentStepIndex) {
      statusClass = 'completed';
    } else if (index === timerState.currentStepIndex && timerState.isRunning) {
      statusClass = 'current';
    }
    
    return `
      <div class="timeline-step ${statusClass}">
        <div class="timeline-dot"></div>
        <span class="timeline-text">${step.name}</span>
        <span class="timeline-time">${step.manual ? '手动' : step.duration + '分钟'}</span>
      </div>
    `;
  }).join('');
}

function resetTimerDisplay() {
  const step = currentWorkflow.steps[timerState.currentStepIndex];
  if (step) {
    document.getElementById('currentStepName').textContent = step.name;
    if (step.manual) {
      document.getElementById('timerDisplay').textContent = '手动确认';
      timerState.remainingSeconds = 0;
      timerState.totalSeconds = 0;
      document.getElementById('progressFill').style.width = '100%';
    } else {
      timerState.totalSeconds = step.duration * 60;
      if (!timerState.isRunning) {
        timerState.remainingSeconds = step.duration * 60;
        updateTimerDisplay();
      }
    }
  } else {
    document.getElementById('currentStepName').textContent = '已完成';
    document.getElementById('timerDisplay').textContent = '00:00';
    document.getElementById('progressFill').style.width = '0%';
  }
  
  document.getElementById('stepProgress').textContent = `步骤 ${timerState.currentStepIndex + 1}/${currentWorkflow.steps.length}`;
  
  if (timerState.isRunning) {
    document.getElementById('startBtn').style.display = 'none';
    document.getElementById('pauseBtn').style.display = 'block';
    document.getElementById('skipBtn').style.display = 'block';
  } else {
    document.getElementById('startBtn').style.display = 'block';
    document.getElementById('pauseBtn').style.display = 'none';
    document.getElementById('skipBtn').style.display = 'none';
  }
}

function updateTimerDisplay() {
  const minutes = Math.floor(timerState.remainingSeconds / 60);
  const seconds = timerState.remainingSeconds % 60;
  document.getElementById('timerDisplay').textContent = 
    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  
  const progress = timerState.totalSeconds > 0 
    ? (timerState.remainingSeconds / timerState.totalSeconds) * 100 
    : 100;
  document.getElementById('progressFill').style.width = progress + '%';
}

function startTimer() {
  const step = currentWorkflow.steps[timerState.currentStepIndex];
  
  if (step.manual) {
    if (confirm(`"${step.name}" - 点击确认继续下一步`)) {
      nextStep();
    }
    return;
  }
  
  timerState.isRunning = true;
  timerState.isPaused = false;
  
  document.getElementById('startBtn').style.display = 'none';
  document.getElementById('pauseBtn').style.display = 'block';
  document.getElementById('skipBtn').style.display = 'block';
  
  updateTimerDisplay();
  
  chrome.storage.local.set({
    runningTimer: {
      isRunning: true,
      workflowId: currentWorkflow.id,
      stepIndex: timerState.currentStepIndex
    }
  });
  
  chrome.runtime.sendMessage({
    action: 'startTimer',
    seconds: timerState.remainingSeconds,
    workflowId: currentWorkflow.id,
    stepIndex: timerState.currentStepIndex
  });
  
  startPolling();
  renderTimeline();
}

function pauseTimer() {
  timerState.isPaused = true;
  timerState.isRunning = false;
  
  document.getElementById('pauseBtn').textContent = '继续';
  document.getElementById('pauseBtn').onclick = resumeTimer;
  
  chrome.storage.local.get(['runningTimer'], (result) => {
    if (result.runningTimer) {
      result.runningTimer.isRunning = false;
      chrome.storage.local.set({runningTimer: result.runningTimer});
    }
  });
  
  chrome.runtime.sendMessage({action: 'pauseTimer'});
  stopPolling();
}

function resumeTimer() {
  timerState.isPaused = false;
  timerState.isRunning = true;
  
  document.getElementById('pauseBtn').textContent = '暂停';
  document.getElementById('pauseBtn').onclick = pauseTimer;
  
  chrome.storage.local.get(['runningTimer'], (result) => {
    if (result.runningTimer) {
      result.runningTimer.isRunning = true;
      chrome.storage.local.set({runningTimer: result.runningTimer});
    }
  });
  
  chrome.runtime.sendMessage({
    action: 'startTimer',
    seconds: timerState.remainingSeconds
  });
  
  startPolling();
}

function skipStep() {
  if (confirm('确定要跳过当前步骤吗？')) {
    chrome.runtime.sendMessage({action: 'stopTimer'});
    stopPolling();
    nextStep();
  }
}

function resetWorkflow() {
  chrome.runtime.sendMessage({action: 'stopTimer'});
  stopPolling();
  chrome.storage.local.remove(['runningTimer']);
  
  timerState = {
    isRunning: false,
    isPaused: false,
    currentStepIndex: 0,
    remainingSeconds: 0,
    totalSeconds: 0
  };
  
  resetTimerDisplay();
  renderTimeline();
}

function nextStep() {
  timerState.currentStepIndex++;
  timerState.isRunning = false;
  timerState.isPaused = false;
  
  chrome.runtime.sendMessage({action: 'stepCompleted'});
  
  if (timerState.currentStepIndex >= currentWorkflow.steps.length) {
    chrome.storage.local.remove(['runningTimer']);
    
    document.getElementById('currentStepName').textContent = '已完成！';
    document.getElementById('timerDisplay').textContent = '00:00';
    document.getElementById('stepProgress').textContent = '全部完成';
    document.getElementById('startBtn').style.display = 'none';
    document.getElementById('pauseBtn').style.display = 'none';
    document.getElementById('skipBtn').style.display = 'none';
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: '工作流完成',
      message: `"${currentWorkflow.name}" 已完成所有步骤`
    });
  } else {
    chrome.storage.local.get(['runningTimer'], (result) => {
      if (result.runningTimer) {
        result.runningTimer.stepIndex = timerState.currentStepIndex;
        chrome.storage.local.set({runningTimer: result.runningTimer});
      }
    });
    
    resetTimerDisplay();
    renderTimeline();
  }
}

function startPolling() {
  stopPolling();
  pollInterval = setInterval(() => {
    chrome.runtime.sendMessage({action: 'getTimerState'}, (state) => {
      if (state && state.isRunning) {
        timerState.remainingSeconds = state.remainingSeconds;
        updateTimerDisplay();
        
        if (state.remainingSeconds <= 0) {
          stopPolling();
          nextStep();
        }
      }
    });
  }, 500);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

document.getElementById('addWorkflowBtn').addEventListener('click', () => showEditView());
document.getElementById('backToListBtn').addEventListener('click', showListView);
document.getElementById('backFromTimerBtn').addEventListener('click', () => {
  stopPolling();
  showListView();
});
document.getElementById('addStepBtn').addEventListener('click', () => showStepModal());
document.getElementById('cancelStepBtn').addEventListener('click', hideStepModal);
document.getElementById('confirmStepBtn').addEventListener('click', saveStep);
document.getElementById('saveWorkflowBtn').addEventListener('click', saveCurrentWorkflow);
document.getElementById('deleteWorkflowBtn').addEventListener('click', deleteCurrentWorkflow);
document.getElementById('startBtn').addEventListener('click', startTimer);
document.getElementById('pauseBtn').addEventListener('click', pauseTimer);
document.getElementById('skipBtn').addEventListener('click', skipStep);
document.getElementById('resetBtn').addEventListener('click', resetWorkflow);

loadWorkflows();
