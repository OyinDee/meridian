import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { TokensService } from './tokens.service.js';

/**
 * Identity. `JwtModule` is registered without a global secret on purpose: the access
 * and refresh tokens are signed with different keys, and each call passes the one it
 * needs, so a leaked refresh key cannot forge an access token.
 */
@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, TokensService, JwtAuthGuard],
  exports: [AuthService, TokensService, JwtAuthGuard],
})
export class AuthModule {}
