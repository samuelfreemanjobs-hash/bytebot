import {
  Controller,
  Post,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SlackService } from './slack.service';
import { SlackEventPayload, SlackUrlVerification } from './slack.types';

@Controller('slack')
export class SlackController {
  private readonly logger = new Logger(SlackController.name);

  constructor(private readonly slackService: SlackService) {}

  @Post('events')
  @HttpCode(HttpStatus.OK)
  async handleEvents(
    @Body() body: SlackEventPayload | SlackUrlVerification,
  ): Promise<any> {
    if (body.type === 'url_verification') {
      this.logger.log('Handling Slack URL verification challenge');
      return { challenge: (body as SlackUrlVerification).challenge };
    }

    const payload = body as SlackEventPayload;

    if (payload.event?.type === 'message' || payload.event?.type === 'app_mention') {
      this.logger.log(`Received Slack ${payload.event.type} event`);
      await this.slackService.handleMessage(payload.event);
    }

    return { ok: true };
  }
}
