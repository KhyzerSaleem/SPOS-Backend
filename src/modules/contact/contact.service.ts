import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ContactSubmission, ContactSubmissionDocument } from './contact.schema';
import { EmailService } from '../../common/services/email.service';

@Injectable()
export class ContactService {
  constructor(
    @InjectModel(ContactSubmission.name) private contactModel: Model<ContactSubmissionDocument>,
    private emailService: EmailService,
  ) {}

  async create(data: Partial<ContactSubmission>) {
    const submission = await this.contactModel.create(data);
    return {
      success: true,
      id: submission._id,
      message: 'Thank you! We will get back to you soon.',
    };
  }

  async findAll() {
    return this.contactModel.find().sort({ createdAt: -1 }).lean();
  }

  async findById(id: string) {
    const doc = await this.contactModel.findById(id).lean();
    if (!doc) throw new NotFoundException('Support ticket not found');
    return doc;
  }

  async updateStatus(id: string, status: string) {
    const updated = await this.contactModel.findByIdAndUpdate(id, { status }, { new: true }).lean();
    if (!updated) throw new NotFoundException('Support ticket not found');
    return updated;
  }

  async replyToTicket(id: string, message: string, sentBy?: string) {
    const trimmed = (message || '').trim();
    if (!trimmed) throw new BadRequestException('Reply message is required');

    const ticket = await this.contactModel.findById(id);
    if (!ticket) throw new NotFoundException('Support ticket not found');

    await this.emailService.sendSupportReply(ticket.email, {
      customerName: ticket.name,
      originalSubject: ticket.subject,
      originalMessage: ticket.message,
      replyMessage: trimmed,
    });

    ticket.status = 'replied';
    ticket.repliedAt = new Date();
    ticket.replies = ticket.replies || [];
    ticket.replies.push({
      message: trimmed,
      sentAt: new Date(),
      sentBy: sentBy || 'support',
    });
    await ticket.save();

    return {
      message: 'Reply sent',
      email: ticket.email,
      ticket: ticket.toObject(),
    };
  }
}
