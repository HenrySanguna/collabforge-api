import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { correlationMiddleware } from './observability/correlation.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  // Registered before app.init()/listen() triggers LoggerModule's own
  // middleware (via its configure()), so pino-http's genReqId can read the
  // ALS correlation context this middleware seeds.
  app.use(correlationMiddleware);
  app.useLogger(app.get(Logger));

  app.use(helmet());
  app.use(cookieParser());

  app.enableCors({
    origin: config.getOrThrow<string>('CORS_ORIGINS').split(','),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix('api', { exclude: ['health', 'metrics'] });

  await app.listen(config.get<number>('PORT') ?? 3000);
}
void bootstrap();
