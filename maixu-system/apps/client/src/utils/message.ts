import Taro from '@tarojs/taro';

export function showError(error: unknown, title = '请求失败') {
  const message = error instanceof Error ? error.message : title;
  Taro.showToast({ title: message.slice(0, 20), icon: 'none' });
}

export function showSuccess(title: string) {
  Taro.showToast({ title, icon: 'success' });
}
