export default defineAppConfig({
  pages: [
    'pages/auth/login/index',
    'pages/rooms/index/index',
    'pages/rooms/detail/index',
    'pages/host/dashboard/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: '排麦系统',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f7f8fa',
  },
});
