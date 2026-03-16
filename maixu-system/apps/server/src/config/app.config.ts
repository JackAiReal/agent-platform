import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  name: process.env.APP_NAME ?? 'maixu-server',
  port: parseInt(process.env.PORT ?? '3000', 10),
}));
