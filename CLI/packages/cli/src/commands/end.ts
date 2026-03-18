import { Command } from 'commander';
import { agentPost } from '../agent-client.js';
import { spinner, success, warn, error, personality, isJson, jsonOut, g, w, r, white, box } from '../output.js';
import { endMessages, pickMessage } from '../messages.js';

interface EndResponse {
  summaryPath: string;
  contextPath: string;
  safetyWarnings: Array<{ severity: string; message: string; file?: string; line?: number }>;
  aiSummary: boolean;
}

export const endCommand = new Command('end')
  .description('End session and generate summary')
  .option('-n, --note <text>', 'Add a note to the session')
  .action(async (opts) => {
    const cwd = process.cwd();

    if (isJson()) {
      const data = await agentPost<EndResponse>('/session/end', { workspacePath: cwd, userNote: opts.note });
      jsonOut(data);
      return;
    }

    const s = spinner('intercepting file events...');
    const data = await agentPost<EndResponse>('/session/end', { workspacePath: cwd, userNote: opts.note });
    s.stop();

    success(`summary written to ${g(data.summaryPath)}`);
    success(`context written to ${g(data.contextPath)}`);

    if (data.aiSummary) success('AI-enhanced summary generated');

    if (data.safetyWarnings.length > 0) {
      console.log('');
      const warningLines = data.safetyWarnings.map(sw => {
        const sev = sw.severity === 'critical' ? r('CRITICAL') : sw.severity === 'warning' ? w('WARNING') : white('INFO');
        const loc = sw.file ? ` ${white(String(sw.file))}${sw.line ? ':' + sw.line : ''}` : '';
        return `  ${sev}  ${white(sw.message)}${loc}`;
      }).join('\n');
      box(warningLines, { title: 'ANOMALIES', borderColor: 'yellow' });
    }

    console.log('');
    await personality(pickMessage(endMessages));
  });
