// RecorderManager is a singleton. Register listeners once and route to one owner.
let manager;
let active;
let stopping = false;

function getManager() {
  if (manager) return manager;
  manager = wx.getRecorderManager();
  manager.onFrameRecorded((event) => { if (active) active.onFrame(event.frameBuffer); });
  manager.onStart(() => { if (active && active.onStart) active.onStart(); });
  manager.onError(() => {
    const current = active;
    active = null;
    stopping = false;
    if (current) current.onError('麦克风启动失败，请检查录音权限并在真机上重试。');
  });
  manager.onStop((result) => {
    const current = active;
    active = null;
    stopping = false;
    // RecorderManager creates a temporary file even though only frames are used.
    if (result && result.tempFilePath && wx.getFileSystemManager) {
      wx.getFileSystemManager().unlink({ filePath: result.tempFilePath, fail() {} });
    }
    if (current) current.onError('本次录音已结束，休息一下再开始吧。');
  });
  manager.onInterruptionBegin(() => {
    const current = active;
    if (current) current.onError('录音被系统中断，本次通话已结束。');
  });
  return manager;
}

function startRecorder(callbacks) {
  if (stopping || active) throw new Error('麦克风正在释放，请稍等一秒再开始。');
  const recorder = getManager();
  active = callbacks;
  try {
    recorder.start({
      duration: 600000,
      sampleRate: 16000,
      numberOfChannels: 1,
      format: 'PCM',
      frameSize: 4,
      audioSource: 'auto'
    });
  } catch (error) {
    active = null;
    throw error;
  }
}

function stopRecorder() {
  if (!active) return;
  active = null;
  stopping = true;
  try { manager.stop(); } catch (_) { stopping = false; }
}

module.exports = { startRecorder, stopRecorder };
