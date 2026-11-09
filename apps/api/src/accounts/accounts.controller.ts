import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AccessTokenClaims } from '../auth/tokens.service.js';
import { ZodQuery } from '../common/http/zod-http.js';
import { AccountsService } from './accounts.service.js';

const historyQuerySchema = z.object({
  accountId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.coerce.number().int().positive().optional(),
  direction: z.enum(['IN', 'OUT']).optional(),
  search: z.string().trim().max(80).optional(),
});
export type HistoryQuery = z.infer<typeof historyQuerySchema>;

@ApiTags('accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @ApiOperation({ summary: 'The signed-in customer’s accounts and balances' })
  list(@CurrentUser() user: AccessTokenClaims) {
    return this.accounts.list(user.sub);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Totals, month-to-date money in and out, and spend by category' })
  summary(@CurrentUser() user: AccessTokenClaims) {
    return this.accounts.summary(user.sub);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Ledger-backed transaction history, newest first' })
  history(
    @CurrentUser() user: AccessTokenClaims,
    @Query(ZodQuery(historyQuerySchema)) query: HistoryQuery,
  ) {
    return this.accounts.history(user.sub, query);
  }

  @Get('lookup/:accountNumber')
  @ApiOperation({ summary: 'Name enquiry for an on-us account' })
  lookup(@Param('accountNumber') accountNumber: string) {
    return this.accounts.lookup(accountNumber);
  }
}
