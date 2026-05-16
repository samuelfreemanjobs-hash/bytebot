import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ScheduledTasksService } from './scheduled-tasks.service';

@Controller('scheduled-tasks')
export class ScheduledTasksController {
  constructor(private readonly scheduledTasksService: ScheduledTasksService) {}

  @Get()
  async list() {
    return this.scheduledTasksService.listScheduledTasks();
  }

  @Post()
  async create(
    @Body()
    body: {
      name: string;
      description: string;
      cronExpression: string;
      metadata?: Record<string, any>;
    },
  ) {
    return this.scheduledTasksService.createScheduledTask(body);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      name: string;
      description: string;
      cronExpression: string;
      enabled: boolean;
      metadata: Record<string, any>;
    }>,
  ) {
    return this.scheduledTasksService.updateScheduledTask(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.scheduledTasksService.deleteScheduledTask(id);
  }

  @Post('presets/daily-summary')
  async createDailySummary(
    @Body() body: { time?: string; vaultName?: string },
  ) {
    const hour = body.time ? parseInt(body.time.split(':')[0]) : 8;
    const minute = body.time ? parseInt(body.time.split(':')[1]) : 0;

    return this.scheduledTasksService.createScheduledTask({
      name: 'Daily Notes Summary',
      description: `Summarize today's notes and activities. Review what was accomplished and suggest tasks for tomorrow.`,
      cronExpression: `${minute} ${hour} * * *`,
      metadata: {
        type: 'daily_summary',
        vaultName: body.vaultName,
      },
    });
  }

  @Post('presets/weekly-review')
  async createWeeklyReview(@Body() body: { dayOfWeek?: number; time?: string }) {
    const day = body.dayOfWeek ?? 0; // Sunday
    const hour = body.time ? parseInt(body.time.split(':')[0]) : 18;
    const minute = body.time ? parseInt(body.time.split(':')[1]) : 0;

    return this.scheduledTasksService.createScheduledTask({
      name: 'Weekly Review',
      description: `Review the week's notes, identify patterns, suggest organization improvements, and plan for next week.`,
      cronExpression: `${minute} ${hour} * * ${day}`,
      metadata: {
        type: 'weekly_review',
      },
    });
  }
}
