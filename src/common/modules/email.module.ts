import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailService } from '../services/email.service';
import { BrevoEmailProvider } from '../services/brevo-email-provider.service';
import { EmailQueueProcessor } from '../services/email-queue.processor';
import {
  EmailDeliveryLog,
  EmailDeliveryLogSchema,
} from '../../database/schemas/email-delivery-log.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: EmailDeliveryLog.name, schema: EmailDeliveryLogSchema }]),
  ],
  providers: [EmailService, BrevoEmailProvider, EmailQueueProcessor],
  exports: [EmailService],
})
export class EmailModule {}
