import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import configuration from './config/configuration';
import { validate } from './config/validation.schema';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { BoardsModule } from './boards/boards.module';
import { RealtimeModule } from './realtime/realtime.module';
import { MetricsModule } from './observability/metrics.module';
import { currentCorrelation } from './observability/correlation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),
    LoggerModule.forRoot({
      exclude: ['health', 'metrics'],
      pinoHttp: {
        genReqId: (req) => {
          const incoming = (req as { headers: Record<string, unknown> })
            .headers['x-correlation-id'];
          return (
            currentCorrelation()?.correlationId ??
            (typeof incoming === 'string' ? incoming : undefined) ??
            randomUUID()
          );
        },
        customAttributeKeys: { reqId: 'correlationId' },
        autoLogging: process.env.NODE_ENV !== 'test',
        level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
      },
    }),
    MetricsModule,
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
      // e2e specs register many users against the same in-memory IP bucket within
      // a single spec file; NODE_ENV=test (set by CI's e2e job and expected locally
      // when running pnpm test:e2e) relaxes throttling without touching prod/dev.
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
        synchronize: false,
        logging:
          config.get('NODE_ENV') === 'development'
            ? ['query', 'error']
            : ['error'],
      }),
    }),
    HealthModule,
    UsersModule,
    AuthModule,
    BoardsModule,
    RealtimeModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
