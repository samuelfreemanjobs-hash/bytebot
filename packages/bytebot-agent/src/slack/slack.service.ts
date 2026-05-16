import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { MessagesService } from '../messages/messages.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  SlackEvent,
  SlackMessagePayload,
  SlackThreadMapping,
} from './slack.types';
import { Role, TaskStatus } from '@prisma/client';

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);
  private readonly threadMappings = new Map<string, SlackThreadMapping>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly messagesService: MessagesService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.eventEmitter.on('message.created', async (payload: any) => {
      await this.handleAgentResponse(payload);
    });
  }

  async handleMessage(event: SlackEvent): Promise<void> {
    if (event.bot_id) {
      return;
    }

    const threadTs = event.thread_ts || event.ts;
    const channelId = event.channel;
    const text = event.text;

    if (!threadTs || !channelId || !text) {
      this.logger.warn('Missing required fields in Slack event');
      return;
    }

    const mappingKey = `${channelId}:${threadTs}`;
    let mapping = this.threadMappings.get(mappingKey);

    if (!mapping) {
      const task = await this.tasksService.create({
        description: text,
        createdBy: Role.USER,
      });

      mapping = {
        threadTs,
        channelId,
        taskId: task.id,
      };

      this.threadMappings.set(mappingKey, mapping);
      await this.saveThreadMapping(mapping);

      this.logger.log(
        `Created new task ${task.id} for Slack thread ${threadTs}`,
      );
    } else {
      await this.tasksService.addTaskMessage(mapping.taskId, {
        message: text,
      });

      this.logger.log(
        `Added message to existing task ${mapping.taskId} from Slack`,
      );
    }
  }

  private async handleAgentResponse(payload: {
    taskId: string;
    message: any;
  }): Promise<void> {
    const { taskId, message } = payload;

    if (message.role !== Role.ASSISTANT) {
      return;
    }

    const mapping = await this.findMappingByTaskId(taskId);
    if (!mapping) {
      return;
    }

    const content = message.content as any[];
    const textContent = content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('\n');

    if (textContent) {
      await this.sendSlackMessage({
        channel: mapping.channelId,
        text: textContent,
        thread_ts: mapping.threadTs,
      });
    }
  }

  async sendSlackMessage(payload: SlackMessagePayload): Promise<void> {
    const token = this.configService.get<string>('SLACK_BOT_TOKEN');

    if (!token) {
      this.logger.error('SLACK_BOT_TOKEN not configured');
      return;
    }

    try {
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!result.ok) {
        this.logger.error(`Slack API error: ${result.error}`);
      }
    } catch (error) {
      this.logger.error('Failed to send Slack message', error);
    }
  }

  private async saveThreadMapping(mapping: SlackThreadMapping): Promise<void> {
    await this.prisma.slackThread.create({
      data: {
        threadTs: mapping.threadTs,
        channelId: mapping.channelId,
        taskId: mapping.taskId,
      },
    });
  }

  private async findMappingByTaskId(
    taskId: string,
  ): Promise<SlackThreadMapping | null> {
    for (const mapping of this.threadMappings.values()) {
      if (mapping.taskId === taskId) {
        return mapping;
      }
    }

    const dbMapping = await this.prisma.slackThread.findFirst({
      where: { taskId },
    });

    if (dbMapping) {
      const mapping: SlackThreadMapping = {
        threadTs: dbMapping.threadTs,
        channelId: dbMapping.channelId,
        taskId: dbMapping.taskId,
      };
      this.threadMappings.set(`${mapping.channelId}:${mapping.threadTs}`, mapping);
      return mapping;
    }

    return null;
  }

  async loadExistingMappings(): Promise<void> {
    const mappings = await this.prisma.slackThread.findMany();

    for (const mapping of mappings) {
      this.threadMappings.set(`${mapping.channelId}:${mapping.threadTs}`, {
        threadTs: mapping.threadTs,
        channelId: mapping.channelId,
        taskId: mapping.taskId,
      });
    }

    this.logger.log(`Loaded ${mappings.length} existing Slack thread mappings`);
  }
}
