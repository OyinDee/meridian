import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TransferRequest } from '@meridian/contracts';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AccessTokenClaims } from '../auth/tokens.service.js';
import { TransfersService } from './transfers.service.js';

@ApiTags('transfers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post()
  @ApiOperation({ summary: 'Send money to a saved beneficiary or an account number' })
  create(
    @CurrentUser() user: AccessTokenClaims,
    @Body() body: TransferRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.transfers.create(user.sub, body, idempotencyKey);
  }

  @Get()
  @ApiOperation({ summary: 'Recent transfers initiated by the customer' })
  list(@CurrentUser() user: AccessTokenClaims) {
    return this.transfers.list(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One transfer by id' })
  get(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.transfers.get(user.sub, id);
  }
}
