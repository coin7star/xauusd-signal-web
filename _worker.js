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

    // ============================================
    // ROUTE: /api/health
    // ============================================
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        worker: 'XAUAI Worker',
        model: 'llama-3.3-70b-versatile',
        groq_key_set: !!env.GROQ_API_KEY,
        telegram_set: !!env.TELEGRAM_BOT_TOKEN && !!env.TELEGRAM_CHAT_ID
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // ============================================
    // ROUTE: /api/analyze — Groq AI
    // ============================================
    if (url.pathname === '/api/analyze' && request.method === 'POST') {

      let body;
      try { body = await request.json(); }
      catch { return jsonError('Invalid JSON body', 400); }

      const { prompt } = body;
      if (!prompt || typeof prompt !== 'string') return jsonError('Field prompt wajib ada', 400);
      if (!env.GROQ_API_KEY) return jsonError('GROQ_API_KEY belum di-set di Cloudflare ENV', 500);

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
              { role: 'user', content: prompt }
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

    // ============================================
    // ROUTE: /api/notify — Telegram
    // ============================================
    if (url.pathname === '/api/notify' && request.method === 'POST') {

      let body;
      try { body = await request.json(); }
      catch { return jsonError('Invalid JSON body', 400); }

      if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
        return jsonError('TELEGRAM_BOT_TOKEN atau TELEGRAM_CHAT_ID belum di-set di ENV', 500);
      }

      const { signal, price, reason, confidence } = body;
      if (!signal) return jsonError('Field signal wajib ada', 400);

      const emoji = signal === 'BUY' ? '🟢' : signal === 'SELL' ? '🔴' : '🟡';
      const waktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

      const message = `${emoji} *XAUAI SIGNAL — ${signal}*

💰 *Harga:* \`${parseFloat(price).toFixed(2)}\`
🎯 *Confidence:* ${confidence}%
📊 *Analisa:* ${reason}

⏰ ${waktu} WIB
🔗 xauusd\\-signal\\-web\\.pages\\.dev`;

      let tgRes;
      try {
        tgRes = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: env.TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'MarkdownV2'
          })
        });
      } catch (e) {
        return jsonError('Gagal koneksi ke Telegram: ' + e.message, 502);
      }

      const tgData = await tgRes.json();
      if (!tgData.ok) {
        return jsonError('Telegram error: ' + tgData.description, 502);
      }

      return new Response(JSON.stringify({ success: true, message_id: tgData.result?.message_id }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // ============================================
    // Static files — serve index.html dll
    // ============================================
    return env.ASSETS.fetch(request);
  }
};

function jsonError(msg, status) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}