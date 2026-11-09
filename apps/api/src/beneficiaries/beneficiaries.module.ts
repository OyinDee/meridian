import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BeneficiariesController } from './beneficiaries.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [BeneficiariesController],
})
export class BeneficiariesModule {}
