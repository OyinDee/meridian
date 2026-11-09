import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfig } from './app-config.service.js';
import { validateEnv } from './env.validation.js';

/**
 * Configuration is global and validated at boot. Anything that reads config does
 * it through `AppConfig`, never `process.env`.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      // Works from `apps/api` (default) and from the repo root.
      envFilePath: ['../../.env', '.env'],
      validate: validateEnv,
      ignoreEnvFile: process.env.NODE_ENV === 'test' && process.env.CI === 'true',
    }),
  ],
  providers: [AppConfig],
  exports: [AppConfig],
})
export class AppConfigModule {}
