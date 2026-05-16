import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';

@Injectable()
export class SlackSignatureGuard implements CanActivate {
  private readonly logger = new Logger(SlackSignatureGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const signingSecret = this.configService.get<string>('SLACK_SIGNING_SECRET');
    if (!signingSecret) {
      this.logger.warn('SLACK_SIGNING_SECRET not configured - skipping verification');
      return true;
    }

    const timestamp = request.headers['x-slack-request-timestamp'] as string;
    const signature = request.headers['x-slack-signature'] as string;

    if (!timestamp || !signature) {
      this.logger.warn('Missing Slack signature headers');
      throw new UnauthorizedException('Missing Slack signature headers');
    }

    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
    if (parseInt(timestamp) < fiveMinutesAgo) {
      this.logger.warn('Slack request timestamp too old');
      throw new UnauthorizedException('Request timestamp too old');
    }

    const rawBody = (request as any).rawBody || JSON.stringify(request.body);
    const sigBasestring = `v0:${timestamp}:${rawBody}`;

    const mySignature =
      'v0=' +
      createHmac('sha256', signingSecret).update(sigBasestring).digest('hex');

    try {
      const sigBuffer = Buffer.from(signature);
      const myBuffer = Buffer.from(mySignature);

      if (sigBuffer.length !== myBuffer.length) {
        throw new UnauthorizedException('Invalid signature');
      }

      if (!timingSafeEqual(sigBuffer, myBuffer)) {
        throw new UnauthorizedException('Invalid signature');
      }
    } catch (error) {
      this.logger.warn('Slack signature verification failed');
      throw new UnauthorizedException('Invalid signature');
    }

    return true;
  }
}
