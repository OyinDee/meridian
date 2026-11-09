import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { beneficiarySchema, type BeneficiaryRequest } from '@meridian/contracts';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AccessTokenClaims } from '../auth/tokens.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotFoundError } from '../common/errors.js';

@ApiTags('beneficiaries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('beneficiaries')
export class BeneficiariesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Saved payees' })
  async list(@CurrentUser() user: AccessTokenClaims) {
    const beneficiaries = await this.prisma.beneficiary.findMany({
      where: { userId: user.sub },
      orderBy: [{ isFavorite: 'desc' }, { name: 'asc' }],
    });
    return {
      beneficiaries: beneficiaries.map((b) => ({
        id: b.id,
        name: b.name,
        accountNumber: b.accountNumber,
        bankCode: b.bankCode,
        nickname: b.nickname,
        isFavorite: b.isFavorite,
        lastUsedAt: b.lastUsedAt?.toISOString() ?? null,
      })),
    };
  }

  @Post()
  @ApiOperation({ summary: 'Save a new payee' })
  async create(@CurrentUser() user: AccessTokenClaims, @Body() body: BeneficiaryRequest) {
    const input = beneficiarySchema.parse(body);
    const created = await this.prisma.beneficiary.upsert({
      where: {
        userId_accountNumber_bankCode: {
          userId: user.sub,
          accountNumber: input.accountNumber,
          bankCode: input.bankCode,
        },
      },
      update: { name: input.name, nickname: input.nickname, updatedAt: new Date() },
      create: {
        userId: user.sub,
        name: input.name,
        accountNumber: input.accountNumber,
        bankCode: input.bankCode,
        type: input.type,
        nickname: input.nickname,
        updatedAt: new Date(),
      },
    });
    return { id: created.id };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a payee' })
  async remove(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    const existing = await this.prisma.beneficiary.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.sub) throw new NotFoundError('BENEFICIARY_NOT_FOUND', 'Payee not found.');
    await this.prisma.beneficiary.delete({ where: { id } });
    return { deleted: true };
  }
}
