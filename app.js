// ============================================
// APP.JS — Logika utama web XAUAI
// ============================================

// ---- STATE ----
let lastPrice = null;
let signalHistory = [];
const MAX_HISTORY = 20;

// ---- INISIALISASI ----
document.addEventListener('DOMContentLoaded', () => {
  listenToFirebase();
  loadHistory();
});

// ============================================
// LISTEN DATA REALTIME DARI FIREBASE
// ============================================
function listenToFirebase() {
  window.xauRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    updatePriceDisplay(data);
    updateIndicators(data);

    // Auto analisa AI tiap kali data baru masuk
    if (data.autoAnalyze) {
      runAiAnalysis();
    }
  }, (error) => {
    console.error('Firebase error:', error);
    setDisconnected();
  });
}

// ============================================
// UPDATE TAMPILAN HARGA
// ============================================
function updatePriceDisplay(data) {
  const priceEl = document.getElementById('currentPrice');
  const changeEl = document.getElementById('priceChange');
  const price = parseFloat(data.price);

  priceEl.textContent = price.toFixed(2);

  if (lastPrice !== null) {
    const diff = price - lastPrice;
    const pct = ((diff / lastPrice) * 100).toFixed(2);
    const sign = diff >= 0 ? '▲ +' : '▼ ';
    changeEl.textContent = `${sign}${diff.toFixed(2)} (${pct}%)`;
    changeEl.className = 'price-change ' + (diff >= 0 ? 'up' : 'down');
  }

  lastPrice = price;

  // Update last update time
  const now = new Date();
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('lastUpdate').textContent = timeStr;
}

// ============================================
// UPDATE INDIKATOR
// ============================================
function updateIndicators(data) {
  // MFI
  const mfi = parseFloat(data.mfi ?? 0);
  const mfiEl = document.getElementById('mfiValue');
  mfiEl.textContent = mfi.toFixed(1);
  mfiEl.className = 'sig-value ' + getMfiClass(mfi);

  // EMA 9
  const ema9 = parseFloat(data.ema9 ?? 0);
  document.getElementById('ema9Value').textContent = ema9.toFixed(2);

  // EMA 20
  const ema20 = parseFloat(data.ema20 ?? 0);
  document.getElementById('ema20Value').textContent = ema20.toFixed(2);

  // EMA cross logic untuk coloring
  const emaEl9 = document.getElementById('ema9Value');
  const emaEl20 = document.getElementById('ema20Value');
  if (ema9 > ema20) {
    emaEl9.className = 'sig-value buy';
    emaEl20.className = 'sig-value sell';
  } else {
    emaEl9.className = 'sig-value sell';
    emaEl20.className = 'sig-value buy';
  }

  // RSI
  const rsi = parseFloat(data.rsi ?? 50);
  document.getElementById('rsiValue').textContent = rsi.toFixed(1);
  document.getElementById('rsiLabel').textContent = getRsiLabel(rsi);

  // Trend
  const trend = data.trend ?? 'Sideways';
  document.getElementById('trendValue').textContent = trend;
  document.getElementById('trendValue').style.color = getTrendColor(trend);
  document.getElementById('trendSub').textContent = data.timeframe ?? 'H4';

  // MFI Signal
  document.getElementById('mfiSignal').textContent = getMfiSignal(mfi);
  document.getElementById('mfiSub').textContent = mfi > 80 ? 'Overbought' : mfi < 20 ? 'Oversold' : 'Normal range';
}

// ============================================
// AI ANALYSIS — Kirim ke Cloudflare Worker
// Cloudflare Worker yang akan forward ke Claude API
// ============================================
async function runAiAnalysis() {
  const btn = document.getElementById('analyzeBtn');
  const signalEl = document.getElementById('aiSignal');
  const reasonEl = document.getElementById('aiReason');
  const confFill = document.getElementById('confFill');
  const confVal = document.getElementById('confVal');

  // Disable tombol
  btn.disabled = true;
  btn.textContent = 'Menganalisa...';
  signalEl.textContent = '⏳ AI sedang berpikir...';
  signalEl.className = 'ai-signal';
  reasonEl.textContent = 'Mohon tunggu sebentar...';

  // Ambil data terkini dari Firebase
  const snapshot = await window.xauRef.once('value');
  const data = snapshot.val();
  if (!data) {
    reasonEl.textContent = 'Data tidak tersedia. Pastikan MT5 sedang mengirim data.';
    btn.disabled = false;
    btn.textContent = 'Analisa ↗';
    return;
  }

  // Buat prompt untuk Claude AI
  const prompt = `
Kamu adalah analis trading XAUUSD profesional.
Berikan sinyal trading berdasarkan data indikator berikut:

- Harga saat ini: ${data.price}
- MFI (Money Flow Index): ${data.mfi}
- EMA 9: ${data.ema9}
- EMA 20: ${data.ema20}
- RSI 14: ${data.rsi ?? 'N/A'}
- Trend: ${data.trend ?? 'N/A'}
- Timeframe: ${data.timeframe ?? 'H4'}

Aturan analisa:
- MFI > 80 = Overbought (potensi reversal turun)
- MFI < 20 = Oversold (potensi reversal naik)
- EMA 9 > EMA 20 = Golden cross (bullish)
- EMA 9 < EMA 20 = Death cross (bearish)

Berikan respons HANYA dalam format JSON berikut:
{
  "signal": "BUY" atau "SELL" atau "WAIT",
  "emoji": "⬆️" atau "⬇️" atau "⏸️",
  "reason": "alasan singkat dalam bahasa Indonesia, maksimal 2 kalimat",
  "confidence": angka 50-95 (persentase keyakinan)
}
`.trim();

  try {
    // Kirim ke Cloudflare Worker (bukan langsung ke Claude API)
    // Worker address didapat dari deployment Cloudflare Worker lo
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    if (!response.ok) throw new Error('Worker error: ' + response.status);

    const result = await response.json();
    const aiData = JSON.parse(result.content[0].text);

    // Tampilkan hasil
    const signalClass = aiData.signal === 'BUY' ? 'buy-signal'
                      : aiData.signal === 'SELL' ? 'sell-signal' : 'wait-signal';

    signalEl.textContent = `${aiData.emoji} ${aiData.signal}`;
    signalEl.className = 'ai-signal ' + signalClass;
    reasonEl.textContent = aiData.reason;
    confFill.style.width = aiData.confidence + '%';
    confVal.textContent = aiData.confidence + '%';

    // Simpan ke history
    addToHistory({
      signal: aiData.signal,
      emoji: aiData.emoji,
      reason: aiData.reason,
      confidence: aiData.confidence,
      price: data.price,
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    });

    // Kirim notifikasi browser
    if (aiData.signal !== 'WAIT') {
      sendNotification(aiData.signal, aiData.reason, data.price);
    }

    // Simpan sinyal ke Firebase untuk riwayat
    window.historyRef.push({
      signal: aiData.signal,
      price: data.price,
      confidence: aiData.confidence,
      timestamp: Date.now()
    });

  } catch (err) {
    console.error('AI Error:', err);
    signalEl.textContent = '⚠️ Error';
    signalEl.className = 'ai-signal';
    reasonEl.textContent = 'Gagal menghubungi AI. Cek koneksi atau API key lo di Cloudflare Worker.';
  }

  btn.disabled = false;
  btn.textContent = 'Analisa ↗';
}

// ============================================
// BROWSER NOTIFICATION
// ============================================
function requestNotification() {
  if (!('Notification' in window)) {
    alert('Browser lo tidak support notifikasi');
    return;
  }

  Notification.requestPermission().then(permission => {
    const alertText = document.getElementById('alertText');
    if (permission === 'granted') {
      alertText.textContent = '✅ Notifikasi aktif! Lo bakal dapet alert sinyal BUY/SELL.';
      document.querySelector('.notif-btn').textContent = 'Aktif ✓';
      document.querySelector('.notif-btn').disabled = true;
    } else {
      alertText.textContent = '❌ Notifikasi diblokir. Aktifkan manual di settings browser lo.';
    }
  });
}

function sendNotification(signal, reason, price) {
  if (Notification.permission !== 'granted') return;

  const icon = signal === 'BUY' ? '⬆️' : '⬇️';
  new Notification(`${icon} XAUUSD ${signal} @ ${price}`, {
    body: reason,
    icon: '/favicon.ico',
    badge: '/favicon.ico'
  });
}

// ============================================
// HISTORY MANAGEMENT
// ============================================
function addToHistory(item) {
  signalHistory.unshift(item);
  if (signalHistory.length > MAX_HISTORY) signalHistory.pop();
  renderHistory();
}

function loadHistory() {
  window.historyRef
    .orderByChild('timestamp')
    .limitToLast(10)
    .on('value', snapshot => {
      const items = [];
      snapshot.forEach(child => items.push(child.val()));
      items.reverse().forEach(item => {
        const time = new Date(item.timestamp).toLocaleTimeString('id-ID', {
          hour: '2-digit', minute: '2-digit'
        });
        addToHistory({
          signal: item.signal,
          emoji: item.signal === 'BUY' ? '⬆️' : item.signal === 'SELL' ? '⬇️' : '⏸️',
          price: item.price,
          confidence: item.confidence,
          time
        });
      });
    });
}

function renderHistory() {
  const container = document.getElementById('signalHistory');
  if (signalHistory.length === 0) {
    container.innerHTML = '<div class="history-empty">Belum ada riwayat sinyal</div>';
    return;
  }

  container.innerHTML = signalHistory.slice(0, 10).map(item => `
    <div class="history-item">
      <div class="history-dot ${item.signal.toLowerCase()}"></div>
      <div class="history-signal">${item.emoji} ${item.signal} @ ${item.price}</div>
      <div class="history-time">${item.time}</div>
    </div>
  `).join('');
}

// ============================================
// HELPER FUNCTIONS
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

function getRsiLabel(rsi) {
  if (rsi > 70) return 'Overbought';
  if (rsi < 30) return 'Oversold';
  return 'Neutral zone';
}

function getTrendColor(trend) {
  const t = trend.toLowerCase();
  if (t.includes('up') || t.includes('bull')) return '#2ecc71';
  if (t.includes('down') || t.includes('bear')) return '#e74c3c';
  return '#f39c12';
}

function setDisconnected() {
  document.getElementById('liveIndicator').className = 'dot disconnected';
  document.getElementById('liveText').textContent = 'OFFLINE';
}
