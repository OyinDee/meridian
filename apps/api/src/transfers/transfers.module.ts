import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PostingService } from '../ledger/posting.service.js';
import { TransfersController } from './transfers.controller.js';
import { TransfersService } from './transfers.service.js';

@Module({
  imports: [AuthModule],
  controllers: [TransfersController],
  providers: [TransfersService, PostingService],
  exports: [TransfersService],
})
export class TransfersModule {}
