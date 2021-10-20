import config from './config'
export default  (url, data={}, method='GET') => {
  return new Promise((resolve, reject) => {
    // 1. new Promise初始化，promise实例的状态为pending
    wx.request({
      url: config.host + url,
      data,
      method,
      header: {
        cookie: wx.getStorageSync('cookies')?wx.getStorageSync('cookies').find(item => item.indexOf('MUSIC_U') !== -1):''
      },
      success: (res) => {
        if(data.isLogin) { // 登录请求
          wx.setStorage({
            key: 'cookies',
            data: res.cookies
          })
        }
        resolve(res.data);
      },
      fail: (err) => {
        reject(err);
      }
    })
  })
  
}
