App({
  globalData: { activeSession: null },
  onHide() {
    if (this.globalData.activeSession) this.globalData.activeSession('background');
  }
});
