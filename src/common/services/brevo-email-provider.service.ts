import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailProvider, EmailSendResult } from './email-provider.interface';

/**
 * Brevo REST API transport. Extracted verbatim from the old EmailService.send()
 * so behavior is unchanged — the only difference is the caller (EmailQueueProcessor)
 * now handles retry/logging instead of this class swallowing failures itself.
 */
@Injectable()
export class BrevoEmailProvider implements EmailProvider {
  private readonly logger = new Logger(BrevoEmailProvider.name);
  private readonly apiKey?: string;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('BREVO_API_KEY');
    this.fromEmail = this.configService.get<string>('SMTP_FROM_EMAIL') || 'noreply@swiftpos.io';
    this.fromName = this.configService.get<string>('SMTP_FROM_NAME') || 'SwiftPOS';
  }

  async send(to: string, subject: string, html: string): Promise<EmailSendResult> {
    if (!this.apiKey) {
      this.logger.log(`[Email-Dev] No API key. Would send to ${to}: ${subject}`);
      return { success: true, providerMessageId: 'dev-noop' };
    }

    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey,
        },
        body: JSON.stringify({
          sender: { email: this.fromEmail, name: this.fromName },
          to: [{ email: to }],
          subject,
          htmlContent: html,
        }),
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}) as any);
        return { success: true, providerMessageId: data?.messageId };
      }
      const error = await response.text();
      return { success: false, error: `Brevo API error ${response.status}: ${error}` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }
}
