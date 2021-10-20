import PubSub from 'pubsub-js'
import moment from 'moment'
import request from '../../utils/request'

// 获取全局实例
const appInstance = getApp();
Page({

  /**
   * 页面的初始数据
   */
  data: {
    isPlay: false, // 音乐是否播放
    song: {}, // 歌曲详情
    musicId: '', //音乐id
    currentTime: '00:00',  // 实时时间
    durationTime: '00:00', // 总时长
    currentWidth: 0, // 实时进度条的宽度
    lyric: [], //歌词
    lyricTime: 0, //歌词对应的时间
    currentLyric: "" //当前歌词对象
  },
  
  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    // options：用于接收路由跳转的query参数
    // 原生小程序路由传参对长度有限制，参数过长会被自动截取
    let musicId = options.musicId;
    this.setData({
      musicId
    })
    this.getMusicInfo(musicId)
    this.getLyric(musicId);
    // 判断当前页面音乐是否在播放
    if(appInstance.globalData.isMusicPlay && appInstance.globalData.musicId === musicId){
      // 修改当前页面音乐播放状态为true
      this.setData({
        isPlay: true
      })
    }

    // 音乐播放/暂停的实例
    this.backgroundAudioManager = wx.getBackgroundAudioManager();
    //监视音乐播放与暂停
    this.backgroundAudioManager.onPlay(() => {
      //修改音乐播放状态
      this.changePlayState(true)
    });
    this.backgroundAudioManager.onPause(() => {
      this.changePlayState(false)

    });
    this.backgroundAudioManager.onStop(() => {
      this.changePlayState(false)

    });

    // 监听音乐播放自然结束
    this.backgroundAudioManager.onEnded(() => {
      // 自动切换至下一首音乐，并且自动播放
      PubSub.publish('switchType', 'next')
      // 将实时进度条的长度还原成 0；时间还原成 0；
      this.setData({
        currentWidth: 0,
        currentTime: '00:00',
        lyric: [],
        lyricTime: 0,
      })
    });

    // 监听音乐实时播放的进度
    this.backgroundAudioManager.onTimeUpdate(() => {
      //获取歌词对应时间
      let lyricTime = Math.ceil(this.backgroundAudioManager.currentTime); 
      // 格式化实时的播放时间
      let currentTime = moment(this.backgroundAudioManager.currentTime * 1000).format('mm:ss')
      let currentWidth = this.backgroundAudioManager.currentTime/this.backgroundAudioManager.duration * 450;
      this.setData({
        lyricTime,
        currentTime,
        currentWidth
      })
      this.getCurrentLyric();
    })
  },

  // 修改播放状态的函数
  changePlayState(isPlay) {
    this.setData({
      isPlay
    })
    // 修改全局音乐播放的状态
    appInstance.globalData.isMusicPlay = isPlay;
  },

  // 获取音乐详情的功能函数
  async getMusicInfo(musicId) {
    let songData = await request('/song/detail', {ids: musicId})
    let durationTime = moment(songData.songs[0].dt).format('mm:ss');

    this.setData({
      song: songData.songs[0],
      durationTime
    })

    // 动态修改窗口标题
    wx.setNavigationBarTitle({
      title: this.data.song.name
    })
  },
  // 点击播放/暂停的回调
  handleMusicPlay() {
    let isPlay = !this.data.isPlay;

    let {musicId} = this.data;
    this.musicControl(isPlay, musicId);
  },
  // 控制音乐播放/暂停的回调
  async musicControl(isPlay, musicId) {
    if(isPlay) {
      //获取音频资源
      let musicLinkData = await request('/song/url',{id: musicId})
      let musicLink = musicLinkData.data[0].url;
      if(musicLink === null){
        wx.showToast({
          title: '请开通会员',
          icon: 'none'
        })
        return;
      }

      this.backgroundAudioManager.src = musicLink
      this.backgroundAudioManager.title = this.data.song.name
    }else {
      this.backgroundAudioManager.pause()
    }
  },

  // 点击切歌的回调
  handleSwitch(event){
    // 获取切歌的类型
    let type = event.currentTarget.id;

    //关闭当前播放音乐
    this.backgroundAudioManager.stop();

    // 订阅来自recommendSong页面发布的消息
    PubSub.subscribe('musicId', (msg, musicId) => {
      
      // 获取音乐详情信息
      this.getMusicInfo(musicId);
      // 自动播放当前的音乐
      this.musicControl(true, musicId);
      // 取消订阅
      PubSub.unsubscribe('musicId');
    })

    // 发布消息数据给recommendSong页面
    PubSub.publish('switchType', type)
  },
  
  //获取歌词
  async getLyric(musicId){
    let lyricData = await request("/lyric", {id: musicId});
    let lyric = this.formatLyric(lyricData.lrc.lyric);
  },
  //传入初始歌词文本text
  formatLyric(text) {
    let result = [];
    let arr = text.split("\n"); //原歌词文本已经换好行了方便很多，我们直接通过换行符“\n”进行切割
    let row = arr.length; //获取歌词行数
    for (let i = 0; i < row; i++) {
      let temp_row = arr[i]; //现在每一行格式大概就是这样"[00:04.302][02:10.00]hello world";
      let temp_arr = temp_row.split("]");//我们可以通过“]”对时间和文本进行分离
      let text = temp_arr.pop(); //把歌词文本从数组中剔除出来，获取到歌词文本了！
      //再对剩下的歌词时间进行处理
      temp_arr.forEach(element => {
        let obj = {};
        let time_arr = element.substr(1, element.length - 1).split(":");//先把多余的“[”去掉，再分离出分、秒
        let s = parseInt(time_arr[0]) * 60 + Math.ceil(time_arr[1]); //把时间转换成与currentTime相同的类型，方便待会实现滚动效果
        obj.time = s;
        obj.text = text;
        result.push(obj); //每一行歌词对象存到组件的lyric歌词属性里
      });
    }
    result.sort(this.sortRule) //由于不同时间的相同歌词我们给排到一起，所以这里要以时间顺序重新排列一下
    this.setData({
      lyric: result
    })
  },
  sortRule(a, b) { //设置排序规则
    return a.time - b.time;
  },

  //控制歌词播放
  getCurrentLyric() {
    let j;
    for(j=0; j<this.data.lyric.length-1; j++){
      if(this.data.lyricTime == this.data.lyric[j].time){
        this.setData({
          currentLyric : this.data.lyric[j].text
        })
      }
    }
  },
  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady: function () {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide: function () {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function () {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {

  }
})