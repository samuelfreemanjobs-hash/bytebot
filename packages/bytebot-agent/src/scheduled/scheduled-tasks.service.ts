import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CronJob } from 'cron';
import { Role } from '@prisma/client';

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  cronExpression: string;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  metadata?: Record<string, any>;
}

@Injectable()
export class ScheduledTasksService implements OnModuleInit {
  private readonly logger = new Logger(ScheduledTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    await this.loadScheduledTasks();
  }

  private async loadScheduledTasks(): Promise<void> {
    const tasks = await this.prisma.scheduledTask.findMany({
      where: { enabled: true },
    });

    for (const task of tasks) {
      this.registerCronJob(task);
    }

    this.logger.log(`Loaded ${tasks.length} scheduled tasks`);
  }

  private registerCronJob(task: ScheduledTask): void {
    const job = new CronJob(task.cronExpression, async () => {
      await this.executeScheduledTask(task);
    });

    try {
      this.schedulerRegistry.addCronJob(task.id, job);
      job.start();
      this.logger.log(`Registered cron job: ${task.name} (${task.cronExpression})`);
    } catch (error) {
      this.logger.error(`Failed to register cron job ${task.name}:`, error);
    }
  }

  private async executeScheduledTask(scheduledTask: ScheduledTask): Promise<void> {
    this.logger.log(`Executing scheduled task: ${scheduledTask.name}`);

    try {
      const task = await this.tasksService.create({
        description: scheduledTask.description,
        createdBy: Role.ASSISTANT,
      });

      await this.prisma.scheduledTask.update({
        where: { id: scheduledTask.id },
        data: { lastRun: new Date() },
      });

      this.eventEmitter.emit('scheduled.task.executed', {
        scheduledTaskId: scheduledTask.id,
        taskId: task.id,
      });
    } catch (error) {
      this.logger.error(`Failed to execute scheduled task ${scheduledTask.name}:`, error);
    }
  }

  async createScheduledTask(data: {
    name: string;
    description: string;
    cronExpression: string;
    metadata?: Record<string, any>;
  }): Promise<ScheduledTask> {
    const task = await this.prisma.scheduledTask.create({
      data: {
        name: data.name,
        description: data.description,
        cronExpression: data.cronExpression,
        enabled: true,
        metadata: data.metadata || {},
      },
    });

    this.registerCronJob(task);
    return task;
  }

  async updateScheduledTask(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      cronExpression: string;
      enabled: boolean;
      metadata: Record<string, any>;
    }>,
  ): Promise<ScheduledTask> {
    try {
      const existingJob = this.schedulerRegistry.getCronJob(id);
      if (existingJob) {
        existingJob.stop();
        this.schedulerRegistry.deleteCronJob(id);
      }
    } catch (error) {
      // Job might not exist (disabled or failed to register)
    }

    const task = await this.prisma.scheduledTask.update({
      where: { id },
      data,
    });

    if (task.enabled) {
      this.registerCronJob(task);
    }

    return task;
  }

  async deleteScheduledTask(id: string): Promise<void> {
    try {
      const job = this.schedulerRegistry.getCronJob(id);
      if (job) {
        job.stop();
        this.schedulerRegistry.deleteCronJob(id);
      }
    } catch (error) {
      // Job might not exist
    }

    await this.prisma.scheduledTask.delete({ where: { id } });
  }

  async listScheduledTasks(): Promise<ScheduledTask[]> {
    return this.prisma.scheduledTask.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}
