import './app.scss';
import type { PropsWithChildren } from 'react';
import { useLaunch } from '@tarojs/taro';
import { restoreSession } from './services/auth';

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    restoreSession();
  });

  return children;
}

export default App;
