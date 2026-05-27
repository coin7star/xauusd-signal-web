// ============================================
// _worker.js — Cloudflare Worker
// Proxy API key Groq biar gak keekspos di frontend
// Deploy otomatis bareng CF Pages
// ============================================

export default {
  async fetch(request, env) {

    // ---- CORS Preflight ----
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

    // ============================================
    // ROUTE: POST /api/analyze
    // Terima prompt dari web → kirim ke Groq API
    // ============================================
    if (url.pathname === '/api/analyze' && request.method === 'POST') {

      // Validasi request body
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const { prompt } = body;

      if (!prompt || typeof prompt !== 'string') {
        return new Response(JSON.stringify({ error: 'Field "prompt" wajib ada dan harus string' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      // Validasi ENV
      if (!env.GROQ_API_KEY) {
        return new Response(JSON.stringify({ error: 'GROQ_API_KEY belum di-set di Cloudflare ENV' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      // ---- Kirim ke Groq API ----
      let groqResponse;
      try {
        groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
                content: 'Kamu adalah analis trading XAUUSD profesional. Jawab HANYA dengan JSON valid. Jangan tambahkan teks, penjelasan, atau markdown apapun di luar JSON.'
              },
              {
                role: 'user',
                content: prompt
              }
            ]
          })
        });
      } catch (fetchErr) {
        return new Response(JSON.stringify({ error: 'Gagal koneksi ke Groq API', detail: fetchErr.message }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      // Cek response Groq
      if (!groqResponse.ok) {
        const errText = await groqResponse.text();
        return new Response(JSON.stringify({
          error: 'Groq API error',
          status: groqResponse.status,
          detail: errText
        }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const data = await groqResponse.json();

      // Ambil teks dari format OpenAI-compatible Groq
      const text = data.choices?.[0]?.message?.content ?? '{}';

      return new Response(JSON.stringify({ text }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // ============================================
    // ROUTE: GET /api/health — cek worker hidup
    // ============================================
    if (url.pathname === '/api/health' && request.method === 'GET') {
      return new Response(JSON.stringify({
        status: 'ok',
        worker: 'XAUAI Worker',
        groq_key_set: !!env.GROQ_API_KEY
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // ---- 404 untuk route lain ----
    return new Response(JSON.stringify({ error: 'Route tidak ditemukan' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
};
