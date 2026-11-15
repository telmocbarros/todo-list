import { describe, expect, it, vi } from 'vitest';
import { ConsoleEmailSender, type IEmailSender, sendInBackground } from './email-sender.js';

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
