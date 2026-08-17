import { Global, Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

// Global: MetricsService/WsObservabilityInterceptor/WsExceptionFilter live in
// different modules (RealtimeModule) but all need the same singleton registry.
@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
