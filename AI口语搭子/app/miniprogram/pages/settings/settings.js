const { getConfig, saveConfig, normalizeBaseUrl, request } = require('../../utils/config');

Page({
  data: { baseUrl: '', accessToken: '', reveal: false, checking: false, status: '', statusOk: false, model: '' },
  onLoad() { this.setData(getConfig()); },
  changeAddress(event) { this.setData({ baseUrl: event.detail.value, status: '' }); },
  changeToken(event) { this.setData({ accessToken: event.detail.value, status: '' }); },
  toggleReveal() { this.setData({ reveal: !this.data.reveal }); },
  copyOrbSource() { wx.setClipboardData({ data: 'https://rareui.com' }); },
  save() {
    try {
      saveConfig(this.data);
      wx.showToast({ title: '连接设置已保存', icon: 'success' });
    } catch (error) { this.setData({ status: error.message, statusOk: false }); }
  },
  async testConnection() {
    if (this.data.checking) return;
    this.setData({ checking: true, status: '', model: '' });
    try {
      const config = { baseUrl: normalizeBaseUrl(this.data.baseUrl), accessToken: this.data.accessToken.trim() };
      const health = await request(config, '/api/health');
      this.setData({
        statusOk: Boolean(health.configured),
        model: health.model || '',
        status: health.configured
          ? '服务已连接，可以保存设置并开始练习。访问口令会在开始练习时验证。'
          : '服务已连接，但千问尚未配置。请按项目 README 在服务器上填写百炼密钥并重启服务。'
      });
    } catch (error) { this.setData({ status: error.message, statusOk: false }); }
    finally { this.setData({ checking: false }); }
  },
  clearToken() { this.setData({ accessToken: '' }); this.save(); }
});
