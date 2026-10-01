import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    const maximumAttempts = 5;
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      try {
        await this.$connect();
        return;
      } catch (error) {
        const isRetryable =
          error instanceof Prisma.PrismaClientInitializationError &&
          (error.errorCode === 'P1001' ||
            error.message.includes("Can't reach database server"));

        if (!isRetryable || attempt === maximumAttempts) throw error;

        const delay = 1_000 * 2 ** (attempt - 1);
        this.logger.warn(
          `Database belum siap (percobaan ${attempt}/${maximumAttempts}); mencoba lagi dalam ${delay / 1000} detik`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
