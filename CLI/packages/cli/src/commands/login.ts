import { Command } from 'commander';
import { agentPost } from '../agent-client.js';
import { spinner, success, personality, isJson, jsonOut } from '../output.js';
import { loginMessages, pickMessage } from '../messages.js';

export const loginCommand = new Command('login')
  .description('Sign in with Google')
  .action(async () => {
    if (isJson()) {
      const data = await agentPost<{ email: string; userId: string }>('/auth/login');
      jsonOut(data);
      return;
    }

    const s = spinner('opening secure channel...');
    s.text = 'browser launched -- complete sign-in to authenticate.';

    const data = await agentPost<{ email: string; userId: string }>('/auth/login');
    s.stop();

    success('identity confirmed.');
    const name = data.email.split('@')[0];
    const pool = loginMessages(name);
    await personality(pickMessage(pool));
  });
