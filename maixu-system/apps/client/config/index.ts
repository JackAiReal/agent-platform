import { defineConfig } from '@tarojs/cli';

export default defineConfig({
  projectName: 'maixu-client',
  date: '2026-03-16',
  designWidth: 375,
  deviceRatio: {
    375: 2,
    750: 1,
    828: 1.81,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  compiler: 'vite',
  plugins: [],
  defineConstants: {},
  copy: { patterns: [], options: {} },
  mini: {},
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
  },
});
