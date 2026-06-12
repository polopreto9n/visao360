import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { envValidation } from "./config/env.validation";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { EmailModule } from "./email/email.module";
import { PushModule } from "./push/push.module";
import { AuthModule } from "./auth/auth.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { AlertsModule } from "./alerts/alerts.module";
import { CompaniesModule } from "./companies/companies.module";
import { UsersModule } from "./users/users.module";
import { UnitsModule } from "./units/units.module";
import { AssetsModule } from "./assets/assets.module";
import { ChecklistsModule } from "./checklists/checklists.module";
import { ExecutionsModule } from "./executions/executions.module";
import { WorkOrdersModule } from "./work-orders/work-orders.module";
import { IncidentsModule } from "./incidents/incidents.module";
import { UploadModule } from "./upload/upload.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { ScheduleModule } from "@nestjs/schedule";
import { SchedulerModule } from "./scheduler/scheduler.module";
import { ChecklistSchedulesModule } from "./checklist-schedules/checklist-schedules.module";
import { MetricsModule } from "./metrics/metrics.module";
import { SubscriptionsModule } from "./subscriptions/subscriptions.module";
import { HealthController } from "./health/health.controller";
import { TenantMiddleware } from "./common/middleware/tenant.middleware";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: envValidation, cache: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { colorize: true, singleLine: true } }
          : undefined,
        level: process.env.LOG_LEVEL ?? "info",
        redact: { paths: ["req.headers.authorization", "req.headers.cookie"], censor: "[REDACTED]" },
      },
    }),
    ThrottlerModule.forRoot([
      { name: "short", ttl: 1000, limit: 10 },
      { name: "medium", ttl: 60000, limit: 100 },
    ]),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    EmailModule,
    PushModule,
    NotificationsModule,
    AlertsModule,
    AuthModule,
    CompaniesModule,
    UsersModule,
    UnitsModule,
    AssetsModule,
    ChecklistsModule,
    ExecutionsModule,
    WorkOrdersModule,
    IncidentsModule,
    UploadModule,
    DashboardModule,
    ChecklistSchedulesModule,
    SchedulerModule,
    MetricsModule,
    SubscriptionsModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .exclude("api/v1/auth/(.*)", "api/v1/health")
      .forRoutes("*");
  }
}
