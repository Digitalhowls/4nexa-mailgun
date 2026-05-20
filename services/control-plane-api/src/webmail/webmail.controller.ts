import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { WebmailService } from './webmail.service';
import type { AuthTokenPayload } from '@4nexa/types';

@Controller('auth/webmail-token')
@UseGuards(JwtAuthGuard)
export class WebmailController {
  constructor(private readonly webmailService: WebmailService) {}

  @Post()
  async generateToken(@CurrentUser() user: AuthTokenPayload) {
    const data = await this.webmailService.generateSsoToken(user.sub, user.tenantId ?? '');
    return { success: true, data };
  }
}
