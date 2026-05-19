import { Module } from '@nestjs/common';
import { ScheduledTasksController } from './scheduled-tasks.controller';
import { ScheduledTasksService } from './scheduled-tasks.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [PrismaModule, TasksModule],
  controllers: [ScheduledTasksController],
  providers: [ScheduledTasksService],
  exports: [ScheduledTasksService],
})
export class ScheduledTasksModule {}
