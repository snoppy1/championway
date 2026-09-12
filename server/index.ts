import { serve } from '@hono/node-server';
import { app } from './app';
import { env } from './lib/env';

serve({ fetch: app.fetch, port: env.port, hostname: '127.0.0.1' }, (info) => {
  console.log(`api ready on http://127.0.0.1:${info.port}/api`);
});
