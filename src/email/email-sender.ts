import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import type { ISmtpConfig } from '../config.js';

export interface IEmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface IEmailSender {
  send(message: IEmailMessage): Promise<void>;
}

/** The default in development: writes each message to the log, so nothing is sent by accident. */
export class ConsoleEmailSender implements IEmailSender {
  constructor(private readonly log: (line: string) => void = console.log) {}

  async send({ to, subject, text }: IEmailMessage): Promise<void> {
    this.log(`To: ${to}\nSubject: ${subject}\n\n${text}`);
  }
}

/** nodemailer settings for an SMTP server. Never sends unencrypted unless `requireTls` is turned off. */
export const smtpTransportOptions = ({ host, port, auth, requireTls }: ISmtpConfig): SMTPTransport.Options => {
  const implicitTls = port === 465;
  return {
    host,
    port,
    secure: implicitTls,
    // On other ports the connection starts in plain text and upgrades; without this a server
    // (or an attacker in between) that does not offer the upgrade would get the email unencrypted
    requireTLS: requireTls && !implicitTls,
    auth,
  };
};

/** Sends real email through an SMTP server, such as a free-tier provider's. */
export class SmtpEmailSender implements IEmailSender {
  constructor(
    private readonly transport: Transporter,
    private readonly from: string,
  ) {}

  static fromConfig(config: ISmtpConfig): SmtpEmailSender {
    return new SmtpEmailSender(nodemailer.createTransport(smtpTransportOptions(config)), config.from);
  }

  async send({ to, subject, text }: IEmailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, to, subject, text });
  }
}

/**
 * Wraps a sender so `send` returns as soon as the message is handed over, without waiting for delivery.
 * Responses then take the same time whether or not an email went out, which would otherwise reveal
 * whether an address has an account. Failures go to `onError`, since there is no caller left to throw at.
 */
export const sendInBackground = (
  sender: IEmailSender,
  onError: (error: unknown, message: IEmailMessage) => void,
): IEmailSender => ({
  async send(message) {
    sender.send(message).catch((error: unknown) => onError(error, message));
  },
});
