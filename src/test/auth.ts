import type { FastifyInstance, InjectOptions } from 'fastify';

/** Signs up and logs in through the real API, returning the session cookie to send with later requests. */
export const signUpAndLogIn = async (app: FastifyInstance, username = 'ada'): Promise<{ sid: string }> => {
  const email = `${username}@example.com`;
  const password = 'correct horse battery staple';
  await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { email, username, firstName: 'Test', lastName: 'User', password },
  });
  const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });
  const sid = res.cookies.find((cookie) => cookie.name === 'sid')?.value;
  if (!sid) throw new Error(`Could not log in as ${username}: ${res.statusCode} ${res.body}`);
  return { sid };
};

/** `app.inject` that always sends the given session cookie, i.e. requests made as that user. */
export const as =
  (app: FastifyInstance, session: { sid: string }) =>
  (options: InjectOptions) =>
    app.inject({ ...options, cookies: { ...session, ...options.cookies } });
