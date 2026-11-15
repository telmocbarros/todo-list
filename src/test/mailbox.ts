import type { IEmailMessage, IEmailSender } from '../email/email-sender.js';

/** An email sender for tests: records every message instead of sending it. */
export class TestMailbox implements IEmailSender {
  readonly sent: IEmailMessage[] = [];

  async send(message: IEmailMessage): Promise<void> {
    this.sent.push(message);
  }

  /** Messages sent to an address, oldest first. */
  to(address: string): IEmailMessage[] {
    return this.sent.filter((message) => message.to === address);
  }

  /** The token in the link of the latest message sent to an address. */
  lastToken(address: string): string {
    const token = this.to(address).at(-1)?.text.match(/token=([\w-]+)/)?.[1];
    if (!token) throw new Error(`No link with a token was sent to ${address}`);
    return token;
  }
}
