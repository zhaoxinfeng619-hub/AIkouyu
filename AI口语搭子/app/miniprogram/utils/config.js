const STORAGE_KEY = 'oral-buddy.connection.v1';
const DEFAULTS = { baseUrl: 'http://127.0.0.1:8788', accessToken: '' };

function normalizeBaseUrl(value) {
  const url = String(value || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/(?:\[[a-fA-F0-9:]+\]|[a-zA-Z0-9.-]+)(?::\d{1,5})?$/.test(url)) {
    throw new Error('请填写服务地址，例如 https://your-domain.com，不要添加页面路径。');
  }
  return url;
}

function getConfig() {
  return Object.assign({}, DEFAULTS, wx.getStorageSync(STORAGE_KEY) || {});
}

function saveConfig(config) {
  const saved = {
    baseUrl: normalizeBaseUrl(config.baseUrl),
    accessToken: String(config.accessToken || '').trim()
  };
  wx.setStorageSync(STORAGE_KEY, saved);
  return saved;
}

function websocketUrl(baseUrl, path) {
  if (typeof path !== 'string' || !path.startsWith('/ws?ticket=') || path.includes('#')) {
    throw new Error('服务返回了无效的通话地址，请检查后端版本。');
  }
  return normalizeBaseUrl(baseUrl).replace(/^http/, 'ws') + path;
}

function request(config, path, options) {
  const opts = options || {};
  return new Promise((resolve, reject) => {
    wx.request({
      url: normalizeBaseUrl(config.baseUrl) + path,
      method: opts.method || 'GET',
      data: opts.data,
      timeout: 12000,
      header: {
        'content-type': 'application/json',
        Authorization: 'Bearer ' + config.accessToken
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(res.data);
        const detail = res.data && res.data.error;
        const err = new Error(detail && detail.message || '连接失败，请检查服务地址和访问口令。');
        err.code = detail && detail.code;
        reject(err);
      },
      fail() { reject(new Error('暂时连不上服务，请检查地址、网络和服务是否启动。')); }
    });
  });
}

module.exports = { getConfig, saveConfig, normalizeBaseUrl, websocketUrl, request };
