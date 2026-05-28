// ============================================
// app.js — Logika utama XAUAI
// ============================================

let lastPrice     = null;
let signalHistory = [];
const MAX_HISTORY = 10;
let isAnalyzing   = false;

document.addEventListener('DOMContentLoaded', () => {
  listenToFirebase();
  checkNotifStatus();
});

// ============================================
// FIREBASE REALTIME LISTENER
// ============================================
function listenToFirebase() {
  window.xauRef.on('value', (snapshot) => {
    hideError();
    const data = snapshot.val();
    if (!data) {
      showError('Firebase konek, tapi belum ada data dari MT5. Pastikan indikator MQ5 aktif di chart XAUUSD.');
      return;
    }
    updatePriceDisplay(data);
    updateIndicators(data);
    if (data.autoAnalyze && !isAnalyzing) {
      runAiAnalysis();
    }
  }, (error) => {
    setDisconnected();
    showError('Gagal konek Firebase: ' + error.message);
  });
}

// ============================================
// UPDATE HARGA
// ============================================
function updatePriceDisplay(data) {
  const price = parseFloat(data.price);
  if (isNaN(price)) return;

  document.getElementById('currentPrice').textContent = price.toFixed(2);

  const changeEl = document.getElementById('priceChange');
  if (lastPrice !== null) {
    const diff = price - lastPrice;
    const pct  = ((diff / lastPrice) * 100).toFixed(2);
    const sign = diff >= 0 ? '▲ +' : '▼ ';
    changeEl.textContent = `${sign}${diff.toFixed(2)} (${pct}%)`;
    changeEl.className   = 'price-change ' + (diff >= 0 ? 'up' : 'down');
  } else {
    changeEl.textContent = 'Data live dari MT5';
    changeEl.className   = 'price-change';
  }

  lastPrice = price;

  const now = new Date();
  document.getElementById('lastUpdate').textContent =
    now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ============================================
// UPDATE INDIKATOR
// ============================================
function updateIndicators(data) {
  const mfi  = parseFloat(data.mfi   ?? 0);
  const ema9 = parseFloat(data.ema9  ?? 0);
  const ema20= parseFloat(data.ema20 ?? 0);
  const rsi  = parseFloat(data.rsi   ?? 50);

  // MFI
  const mfiEl = document.getElementById('mfiValue');
  mfiEl.textContent = mfi.toFixed(1);
  mfiEl.className   = 'sig-value ' + getMfiClass(mfi);

  // EMA
  const ema9El  = document.getElementById('ema9Value');
  const ema20El = document.getElementById('ema20Value');
  ema9El.textContent  = ema9.toFixed(2);
  ema20El.textContent = ema20.toFixed(2);
  if (ema9 > ema20) {
    ema9El.className  = 'sig-value buy';
    ema20El.className = 'sig-value sell';
  } else {
    ema9El.className  = 'sig-value sell';
    ema20El.className = 'sig-value buy';
  }

  // RSI
  const rsiEl = document.getElementById('rsiValue');
  rsiEl.textContent  = rsi.toFixed(1);
  rsiEl.style.color  = getRsiColor(rsi);
  document.getElementById('rsiLabel').textContent = getRsiLabel(rsi);

  // Trend
  const trend   = data.trend ?? 'Sideways';
  const trendEl = document.getElementById('trendValue');
  trendEl.textContent = trend;
  trendEl.style.color = getTrendColor(trend);
  document.getElementById('trendSub').textContent = data.timeframe ?? 'H4';

  // MFI Signal
  const mfiSigEl = document.getElementById('mfiSignal');
  mfiSigEl.textContent = getMfiSignal(mfi);
  mfiSigEl.style.color = getMfiColor(mfi);
  document.getElementById('mfiSub').textContent = getMfiSub(mfi);
}

// ============================================
// AI ANALYSIS
// ============================================
async function runAiAnalysis() {
  if (isAnalyzing) return;
  isAnalyzing = true;

  const btn      = document.getElementById('analyzeBtn');
  const signalEl = document.getElementById('aiSignal');
  const reasonEl = document.getElementById('aiReason');
  const confFill = document.getElementById('confFill');
  const confVal  = document.getElementById('confVal');

  btn.disabled         = true;
  btn.textContent      = 'Menganalisa...';
  signalEl.textContent = '⏳ AI sedang berpikir...';
  signalEl.className   = 'ai-signal';
  reasonEl.textContent = 'Menghubungi Groq · Llama 3.3...';
  confFill.style.width = '0%';
  confVal.textContent  = '--%';

  let data;
  try {
    const snapshot = await window.xauRef.once('value');
    data = snapshot.val();
  } catch (e) {
    showAiError('Gagal baca Firebase: ' + e.message);
    resetBtn(btn);
    return;
  }

  if (!data) {
    showAiError('Data MT5 belum tersedia. Pastikan indikator MQ5 aktif.');
    resetBtn(btn);
    return;
  }

  const prompt = `
Data indikator XAUUSD saat ini:
- Harga: ${parseFloat(data.price).toFixed(2)}
- MFI (${data.mfi > 80 ? 'OVERBOUGHT' : data.mfi < 20 ? 'OVERSOLD' : 'NORMAL'}): ${parseFloat(data.mfi).toFixed(1)}
- EMA 9: ${parseFloat(data.ema9).toFixed(2)}
- EMA 20: ${parseFloat(data.ema20).toFixed(2)}
- EMA Cross: ${parseFloat(data.ema9) > parseFloat(data.ema20) ? 'Golden Cross (Bullish)' : 'Death Cross (Bearish)'}
- RSI 14: ${parseFloat(data.rsi ?? 50).toFixed(1)}
- Trend: ${data.trend ?? 'Sideways'}
- Timeframe: ${data.timeframe ?? 'H4'}

Aturan:
- MFI > 80 = overbought → potensi SELL
- MFI < 20 = oversold → potensi BUY
- EMA9 > EMA20 = bullish bias
- EMA9 < EMA20 = bearish bias

Berikan sinyal trading. Jawab HANYA dengan JSON ini (tanpa teks lain):
{"signal":"BUY","emoji":"⬆️","reason":"alasan singkat bahasa Indonesia max 2 kalimat","confidence":75}

Nilai signal hanya boleh: "BUY", "SELL", atau "WAIT"
Nilai confidence antara 50-95
`.trim();

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error ?? `HTTP ${response.status}`);
    }

    const result = await response.json();

    let aiData;
    try {
      const raw   = result.text ?? '{}';
      const clean = raw.replace(/```json|```/g, '').trim();
      const match = clean.match(/\{[\s\S]*\}/);
      aiData = JSON.parse(match ? match[0] : clean);
    } catch {
      throw new Error('AI return format bukan JSON. Raw: ' + (result.text ?? '').slice(0, 100));
    }

    if (!['BUY', 'SELL', 'WAIT'].includes(aiData.signal)) {
      throw new Error('Signal tidak valid: ' + aiData.signal);
    }

    // Tampilkan hasil
    const cls = aiData.signal === 'BUY'  ? 'buy-signal'
              : aiData.signal === 'SELL' ? 'sell-signal' : 'wait-signal';

    signalEl.textContent = `${aiData.emoji ?? ''} ${aiData.signal}`;
    signalEl.className   = 'ai-signal ' + cls;
    reasonEl.textContent = aiData.reason ?? '-';
    confFill.style.width = (aiData.confidence ?? 70) + '%';
    confVal.textContent  = (aiData.confidence ?? 70) + '%';

    hideError();

    // Tambah ke history
    addToHistory({
      signal:     aiData.signal,
      emoji:      aiData.emoji ?? '',
      price:      parseFloat(data.price).toFixed(2),
      confidence: aiData.confidence ?? 70,
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    });

    // Simpan ke Firebase history
    window.historyRef.push({
      signal:     aiData.signal,
      price:      data.price,
      confidence: aiData.confidence ?? 70,
      timestamp:  Date.now()
    }).catch(() => {});

    // Kirim notifikasi browser + Telegram
    if (aiData.signal !== 'WAIT') {
      sendNotification(aiData.signal, aiData.reason, data.price);
      sendTelegram(aiData.signal, data.price, aiData.reason, aiData.confidence ?? 70);
    }

  } catch (err) {
    showAiError('Error: ' + err.message);
    console.error('AI error:', err);
  }

  resetBtn(btn);
}

// ============================================
// BROWSER NOTIFICATION
// ============================================
function checkNotifStatus() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    document.getElementById('alertText').textContent = '✅ Notifikasi aktif! Lo bakal dapet alert sinyal BUY/SELL.';
    const btn = document.getElementById('notifBtn');
    btn.textContent = 'Aktif ✓';
    btn.disabled    = true;
  }
}

function requestNotification() {
  if (!('Notification' in window)) {
    alert('Browser lo tidak support notifikasi');
    return;
  }
  Notification.requestPermission().then(permission => {
    const alertText = document.getElementById('alertText');
    const btn       = document.getElementById('notifBtn');
    if (permission === 'granted') {
      alertText.textContent = '✅ Notifikasi aktif! Lo bakal dapet alert sinyal BUY/SELL.';
      btn.textContent = 'Aktif ✓';
      btn.disabled    = true;
    } else {
      alertText.textContent = '❌ Diblokir. Aktifkan manual di settings browser lo.';
    }
  });
}

function sendNotification(signal, reason, price) {
  if (Notification.permission !== 'granted') return;
  const icon = signal === 'BUY' ? '⬆️' : '⬇️';
  new Notification(`${icon} XAUUSD ${signal} @ ${parseFloat(price).toFixed(2)}`, {
    body:  reason,
    icon:  '/favicon.ico',
    badge: '/favicon.ico'
  });
}

// ============================================
// TELEGRAM NOTIFICATION
// ============================================
async function sendTelegram(signal, price, reason, confidence) {
  if (signal === 'WAIT') return;
  try {
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signal, price, reason, confidence })
    });
    const data = await res.json();
    if (data.success) {
      console.log('✅ Telegram notif terkirim, message_id:', data.message_id);
    } else {
      console.warn('⚠️ Telegram gagal:', data.error);
    }
  } catch (e) {
    console.warn('⚠️ Gagal kirim Telegram:', e.message);
  }
}

// ============================================
// HISTORY
// ============================================
function addToHistory(item) {
  signalHistory.unshift(item);
  if (signalHistory.length > MAX_HISTORY) signalHistory.pop();
  renderHistory();
}

function renderHistory() {
  const container = document.getElementById('signalHistory');
  if (signalHistory.length === 0) {
    container.innerHTML = '<div class="history-empty">Belum ada riwayat sinyal</div>';
    return;
  }
  container.innerHTML = signalHistory.map(item => `
    <div class="history-item">
      <div class="history-dot ${item.signal.toLowerCase()}"></div>
      <div class="history-signal">${item.emoji} ${item.signal} @ ${item.price}</div>
      <div class="history-conf">${item.confidence}%</div>
      <div class="history-time">${item.time}</div>
    </div>
  `).join('');
}

// ============================================
// HELPER UI
// ============================================
function showAiError(msg) {
  document.getElementById('aiSignal').textContent = '⚠️ Error';
  document.getElementById('aiSignal').className   = 'ai-signal';
  document.getElementById('aiReason').textContent = msg;
}

function showError(msg) {
  const strip = document.getElementById('errorStrip');
  document.getElementById('errorText').textContent = msg;
  strip.style.display = 'flex';
}

function hideError() {
  document.getElementById('errorStrip').style.display = 'none';
}

function setDisconnected() {
  document.getElementById('liveIndicator').className = 'dot disconnected';
  document.getElementById('liveText').textContent    = 'OFFLINE';
}

function resetBtn(btn) {
  btn.disabled    = false;
  btn.textContent = 'Analisa ↗';
  isAnalyzing     = false;
}

// ============================================
// HELPER INDIKATOR
// ============================================
function getMfiClass(mfi) {
  if (mfi > 70) return 'sell';
  if (mfi < 30) return 'buy';
  return 'neutral';
}

function getMfiSignal(mfi) {
  if (mfi > 80) return 'OVERBOUGHT';
  if (mfi > 60) return 'INFLOW';
  if (mfi < 20) return 'OVERSOLD';
  if (mfi < 40) return 'OUTFLOW';
  return 'NEUTRAL';
}

function getMfiSub(mfi) {
  if (mfi > 80) return 'Potensi reversal turun';
  if (mfi < 20) return 'Potensi reversal naik';
  return 'Normal range';
}

function getMfiColor(mfi) {
  if (mfi > 70) return '#e74c3c';
  if (mfi < 30) return '#2ecc71';
  return '#f39c12';
}

function getRsiLabel(rsi) {
  if (rsi > 70) return 'Overbought';
  if (rsi < 30) return 'Oversold';
  return 'Neutral zone';
}

function getRsiColor(rsi) {
  if (rsi > 70) return '#e74c3c';
  if (rsi < 30) return '#2ecc71';
  return '#d0d0ee';
}

function getTrendColor(trend) {
  const t = (trend ?? '').toLowerCase();
  if (t.includes('bull') || t.includes('up'))   return '#2ecc71';
  if (t.includes('bear') || t.includes('down')) return '#e74c3c';
  return '#f39c12';
}