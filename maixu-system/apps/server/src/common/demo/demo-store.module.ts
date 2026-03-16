import { Global, Module } from '@nestjs/common';
import { DemoStoreService } from './demo-store.service';

@Global()
@Module({
  providers: [DemoStoreService],
  exports: [DemoStoreService],
})
export class DemoStoreModule {}
