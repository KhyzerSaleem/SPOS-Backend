/**
 * Abstraction over the actual email-sending transport. EmailService renders
 * templates and queues jobs; providers only know how to hand a rendered email
 * to a delivery API. Swapping providers (e.g. Brevo -> Resend) means adding a
 * new class here and changing which one EmailModule binds to — nothing in
 * EmailService, the queue processor, or any of the 16 template call sites
 * needs to change.
 */
export interface EmailSendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface EmailProvider {
  send(to: string, subject: string, html: string): Promise<EmailSendResult>;
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');
