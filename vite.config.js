import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';

// In local demo mode (VITE_DEMO=1) /api/chat is served from here using demo data.
// With ANTHROPIC_API_KEY set it calls Claude for real; otherwise a scripted stand-in exercises the same tools.
function demoChatApi(env) {
  return {
    name: 'demo-chat-api',
    configureServer(server) {
      server.middlewares.use('/demo-data.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(fs.readFileSync('demo/demo-data.json'));
      });
      server.middlewares.use('/api/chat', async (req, res) => {
        const { runChat } = await server.ssrLoadModule('/server/chat-core.js');
        let raw = '';
        for await (const c of req) raw += c;
        const { messages } = JSON.parse(raw || '{}');
        const data = JSON.parse(fs.readFileSync('demo/demo-data.json', 'utf8'));
        let anthropic;
        if (env.ANTHROPIC_API_KEY) {
          const { default: Anthropic } = await import('@anthropic-ai/sdk');
          anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
        } else {
          const { scriptedClaude } = await server.ssrLoadModule('/tests/scripted-claude.js');
          anthropic = scriptedClaude();
        }
        try {
          const out = await runChat({ messages, entries: data.entries, projectItems: data.project_items, anthropic, model: env.CLAUDE_MODEL || 'claude-sonnet-5-5', today: new Date().toISOString().slice(0, 10) });
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(out));
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(e.message || e) }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), ...(env.VITE_DEMO === '1' ? [demoChatApi(env)] : [])],
    build: {
      chunkSizeWarningLimit: 700,
      rollupOptions: { output: { manualChunks: { charts: ['recharts'], supabase: ['@supabase/supabase-js'], react: ['react', 'react-dom'] } } },
    },
  };
});
