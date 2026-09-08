import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { ContactSubmission, ContactSubmissionSchema } from './contact.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ContactSubmission.name, schema: ContactSubmissionSchema }]),
  ],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
