import nodemailer from 'nodemailer';
import { describe, expect, it, vi } from 'vitest';
import {
  ConsoleEmailSender,
  type IEmailSender,
  SmtpEmailSender,
  sendInBackground,
  smtpTransportOptions,
} from './email-sender.js';

const message = { to: 'ada@example.com', subject: 'Hello', text: 'Click https://app.test/x?token=abc' };

describe('ConsoleEmailSender', () => {
  it('writes the whole message to the log instead of sending it', async () => {
    const log = vi.fn();
    await new ConsoleEmailSender(log).send(message);
    expect(log).toHaveBeenCalledOnce();
    const [line] = log.mock.calls[0];
    expect(line).toContain('To: ada@example.com');
    expect(line).toContain('Subject: Hello');
    expect(line).toContain('https://app.test/x?token=abc');
  });
});

describe('SmtpEmailSender', () => {
  const config = {
    host: 'smtp.example.com',
    port: 587,
    from: 'Todo <no-reply@example.com>',
    auth: { user: 'apikey', pass: 'secret' },
    requireTls: true,
  };

  it('sends a plain-text message from the configured sender', async () => {
    // nodemailer's JSON transport renders the message instead of sending it
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const sendMail = vi.spyOn(transport, 'sendMail');

    await new SmtpEmailSender(transport, config.from).send(message);

    expect(sendMail).toHaveBeenCalledWith({ from: config.from, ...message });
    const { message: rendered } = (await sendMail.mock.results[0].value) as { message: string };
    expect(JSON.parse(rendered)).toMatchObject({ subject: 'Hello', text: message.text });
  });

  it('fails when the server refuses the message, so the failure can be logged', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    vi.spyOn(transport, 'sendMail').mockRejectedValue(new Error('550 mailbox unavailable'));
    await expect(new SmtpEmailSender(transport, config.from).send(message)).rejects.toThrow('550');
  });

  describe('smtpTransportOptions', () => {
    it('upgrades port 587 with STARTTLS, refusing to continue unencrypted', () => {
      expect(smtpTransportOptions(config)).toEqual({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user: 'apikey', pass: 'secret' },
      });
    });

    it('uses TLS from the first byte on port 465', () => {
      expect(smtpTransportOptions({ ...config, port: 465 })).toMatchObject({ secure: true, requireTLS: false });
    });

    it('allows an unencrypted connection only when told to, for a local mail catcher', () => {
      const local = { ...config, host: 'localhost', port: 1025, auth: undefined, requireTls: false };
      expect(smtpTransportOptions(local)).toEqual({
        host: 'localhost',
        port: 1025,
        secure: false,
        requireTLS: false,
        auth: undefined,
      });
    });
  });
});

describe('sendInBackground', () => {
  it('hands the message over at once and returns before delivery finishes', async () => {
    // A delivery that only completes when the test calls finishDelivery
    let finishDelivery = () => {};
    const slow: IEmailSender = { send: vi.fn(() => new Promise<void>((resolve) => (finishDelivery = resolve))) };

    // Would never resolve if the wrapper waited for delivery
    await sendInBackground(slow, vi.fn()).send(message);

    expect(slow.send).toHaveBeenCalledWith(message);
    finishDelivery();
  });

  it('reports a failed delivery instead of throwing it at the caller', async () => {
    const error = new Error('SMTP down');
    const onError = vi.fn();
    const failing: IEmailSender = { send: () => Promise.reject(error) };

    await expect(sendInBackground(failing, onError).send(message)).resolves.toBeUndefined();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error, message));
  });
});
