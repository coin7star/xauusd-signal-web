// ============================================
// _worker.js — Cloudflare Worker
// File ini di-deploy bareng sama web di CF Pages
// ENV vars diset di Cloudflare Dashboard (bukan di sini)
// ============================================

export default {
  async fetch(request, env) {

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    const url = new URL(request.url);

    // ---- Route: /api/analyze ----
    // Terima prompt dari web, forward ke Claude API
    if (url.pathname === '/api/analyze' && request.method === 'POST') {
      const body = await request.json();
      const { prompt } = body;

      if (!prompt) {
        return new Response(JSON.stringify({ error: 'No prompt provided' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Panggil Claude API
      // API key diambil dari ENV (aman, tidak terekspos ke publik)
      const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.CLAUDE_API_KEY,       // dari ENV Cloudflare
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          messages: [
            { role: 'user', content: prompt }
          ]
        })
      });

      const data = await claudeResponse.json();

      return new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Route tidak dikenal
    return new Response('Not found', { status: 404 });
  }
};
