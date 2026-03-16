# @maixu/frontend-sdk

前端联调 SDK，适配当前排麦系统后端接口。

## 功能

- TypeScript 类型定义
- 通用 API Client
- 浏览器/Node fetch transport
- Taro request 适配器
- Auth / Rooms / Slots / Rank 接口封装

## 快速使用（fetch）

```ts
import { createMaixuSdk } from '@maixu/frontend-sdk';

const sdk = createMaixuSdk({
  baseUrl: 'http://localhost:3000/api/v1',
  getToken: () => localStorage.getItem('token') || undefined,
});

const login = await sdk.auth.devLogin({ nickname: 'Jack' });
const rooms = await sdk.rooms.list();
```

## 在 Taro 中使用

```ts
import Taro from '@tarojs/taro';
import { createMaixuSdk, createTaroTransport } from '@maixu/frontend-sdk';

const sdk = createMaixuSdk({
  baseUrl: 'http://localhost:3000/api/v1',
  getToken: () => Taro.getStorageSync('token'),
  transport: createTaroTransport((options) => Taro.request(options)),
});
```
