export default {
  async fetch(request, env) {

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        worker: 'XAUAI Worker',
        model: 'llama-3.3-70b-versatile',
        groq_key_set: !!env.GROQ_API_KEY
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    if (url.pathname === '/api/analyze' && request.method === 'POST') {

      let body;
      try {
        body = await request.json();
      } catch {
        return jsonError('Invalid JSON body', 400);
      }

      const { prompt } = body;
      if (!prompt || typeof prompt !== 'string') {
        return jsonError('Field "prompt" wajib ada', 400);
      }

      if (!env.GROQ_API_KEY) {
        return jsonError('GROQ_API_KEY belum di-set di Cloudflare ENV Variables', 500);
      }

      let groqRes;
      try {
        groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.GROQ_API_KEY}`
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            max_tokens: 300,
            temperature: 0.3,
            messages: [
              {
                role: 'system',
                content: 'Kamu adalah analis trading XAUUSD profesional. Jawab HANYA dengan JSON valid. Jangan tambahkan teks atau markdown apapun di luar JSON.'
              },
              {
                role: 'user',
                content: prompt
              }
            ]
          })
        });
      } catch (e) {
        return jsonError('Gagal koneksi ke Groq API: ' + e.message, 502);
      }

      if (!groqRes.ok) {
        const errText = await groqRes.text();
        return jsonError(`Groq error ${groqRes.status}: ${errText}`, 502);
      }

      const data = await groqRes.json();
      const text = data.choices?.[0]?.message?.content ?? '{}';

      return new Response(JSON.stringify({ text }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // ✅ FIXED: serve index.html dan static files
    return env.ASSETS.fetch(request);
  }
};

function jsonError(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}