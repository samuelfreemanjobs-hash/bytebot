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
  SlackFile,
  SlackClipRequest,
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
    let text = event.text || '';

    if (!threadTs || !channelId) {
      this.logger.warn('Missing required fields in Slack event');
      return;
    }

    // Handle file uploads
    let files: { name: string; type: string; size: number; base64: string }[] = [];
    if (event.files && event.files.length > 0) {
      files = await this.downloadFiles(event.files);
      if (!text && files.length > 0) {
        text = `Uploaded ${files.length} file(s): ${files.map(f => f.name).join(', ')}`;
      }
    }

    if (!text && files.length === 0) {
      return;
    }

    const mappingKey = `${channelId}:${threadTs}`;
    let mapping = this.threadMappings.get(mappingKey);

    if (!mapping) {
      const task = await this.tasksService.create({
        description: text,
        createdBy: Role.USER,
        files: files.length > 0 ? files : undefined,
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

  private async downloadFiles(
    slackFiles: SlackFile[],
  ): Promise<{ name: string; type: string; size: number; base64: string }[]> {
    const token = this.configService.get<string>('SLACK_BOT_TOKEN');
    if (!token) {
      this.logger.error('SLACK_BOT_TOKEN not configured');
      return [];
    }

    const downloadedFiles: { name: string; type: string; size: number; base64: string }[] = [];

    for (const file of slackFiles) {
      try {
        const response = await fetch(file.url_private_download, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          this.logger.error(`Failed to download file ${file.name}: ${response.statusText}`);
          continue;
        }

        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');

        downloadedFiles.push({
          name: file.name,
          type: file.mimetype,
          size: file.size,
          base64,
        });

        this.logger.log(`Downloaded file: ${file.name} (${file.size} bytes)`);
      } catch (error) {
        this.logger.error(`Error downloading file ${file.name}:`, error);
      }
    }

    return downloadedFiles;
  }

  async clipMessageToObsidian(request: SlackClipRequest): Promise<{ success: boolean; notePath?: string }> {
    const token = this.configService.get<string>('SLACK_BOT_TOKEN');
    if (!token) {
      return { success: false };
    }

    try {
      const response = await fetch(
        `https://slack.com/api/conversations.history?channel=${request.channelId}&latest=${request.messageTs}&limit=1&inclusive=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const data = await response.json();
      if (!data.ok || !data.messages || data.messages.length === 0) {
        return { success: false };
      }

      const message = data.messages[0];
      const clipData = {
        text: message.text,
        timestamp: new Date(parseFloat(message.ts) * 1000).toISOString(),
        channelId: request.channelId,
        tags: request.tags || [],
        notePath: request.notePath,
        vaultName: request.vaultName,
      };

      this.eventEmitter.emit('slack.clip', clipData);
      return { success: true, notePath: request.notePath };
    } catch (error) {
      this.logger.error('Failed to clip message:', error);
      return { success: false };
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
