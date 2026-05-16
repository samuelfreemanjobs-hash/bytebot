import { Module, OnModuleInit } from '@nestjs/common';
import { SlackController } from './slack.controller';
import { SlackService } from './slack.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TasksModule } from '../tasks/tasks.module';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [PrismaModule, TasksModule, MessagesModule],
  controllers: [SlackController],
  providers: [SlackService],
  exports: [SlackService],
})
export class SlackModule implements OnModuleInit {
  constructor(private readonly slackService: SlackService) {}

  async onModuleInit() {
    await this.slackService.loadExistingMappings();
  }
}
