// server.js (UPGRADE: Validasi, Notifikasi, dan Halaman 404)

const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const validator = require('validator'); // Paket baru untuk validasi
const axios = require('axios'); // Paket baru untuk notifikasi Telegram
const app = express();
const port = 3000;

// ====================================================================
// KONFIGURASI MONGODB
const MONGODB_URI = 'mongodb+srv://Vercel-Admin-aforchixy:XFxHtog17ZM413xO@aforchixy.1xg3co5.mongodb.net/?retryWrites=true&w=majority';
// ====================================================================

// ====================================================================
// KONFIGURASI TELEGRAM
const TELEGRAM_BOT_TOKEN = '8421721090:AAH5JIPrCm7JNTRv2WWAszZFCKx7oI_PHKU'; 
const TELEGRAM_CHAT_ID = '8243394905';
// ====================================================================

// Fungsi untuk mengirim notifikasi ke Telegram
async function sendTelegramNotification(message) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        await axios.post(url, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
        });
    } catch (error) {
        console.error('Gagal mengirim notifikasi Telegram:', error.message);
    }
}


// (Kode koneksi Mongoose, Skema, dan Fungsi generateShortId tetap sama)
// ...
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Terhubung ke MongoDB!'))
    .catch(err => {
        console.error('❌ Koneksi MongoDB gagal. Pastikan MongoDB berjalan.');
        console.error(err);
    });

// --- DEFINISI SKEMA URL (Tetap Sama) ---
const urlSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    fullUrl: { type: String, required: true },
    shortId: { type: String, required: true, unique: true, index: true }, 
    clicks: { type: Number, required: true, default: 0 },
    createdAt: { type: Date, default: Date.now }
});
const UrlModel = mongoose.model('ShortUrl', urlSchema);

// --- SIMULASI AUTENTIKASI PENGGUNA (Tetap Sama) ---
const CURRENT_USER_ID = 'userA'; 

// --- FUNGSI GENERATOR ID KRIPTOGRAFIS (Tetap Sama) ---
function generateShortId(url) {
    const hash = crypto.createHash('sha256');
    hash.update(url + Date.now().toString() + Math.random()); 
    let shortId = hash.digest('base64').substring(0, 8); 
    return shortId.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''); 
}
// ...

// Middleware untuk menangani notifikasi (menggunakan session)
const session = require('express-session');
app.use(session({
    secret: 'secret-key-yang-kuat', // Ganti dengan key yang kuat
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Atur ke true jika menggunakan HTTPS
}));

app.use(express.urlencoded({ extended: true })); // Middleware untuk parsing body POST
app.use(express.static('public')); // Middleware untuk file statis
app.set('view engine', 'ejs'); // <<< BARIS KRITIS YANG HILANG/TERLALU JAUH

// --- ROUTE UTAMA: Menampilkan Form dan Daftar URL ---
app.get('/', async (req, res) => {
    try {
        const userUrls = await UrlModel.find({ userId: CURRENT_USER_ID }).sort({ createdAt: -1 });
        
        // Ambil notifikasi dari session dan hapus setelah digunakan
        const notification = req.session.notification;
        req.session.notification = null; 

        res.render('index', { 
            urlDatabase: userUrls,
            currentUser: CURRENT_USER_ID,
            notification: notification // Kirim notifikasi ke EJS
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Terjadi kesalahan saat memuat data.");
    }
});

// --- ROUTE: Membuat URL Pendek (Dengan Validasi) ---
app.post('/shortUrls', async (req, res) => {
    const fullUrl = req.body.fullUrl;
    
    // 1. Validasi URL yang Lebih Baik
    if (!validator.isURL(fullUrl, { require_protocol: true })) {
        req.session.notification = { type: 'danger', message: '❌ URL tidak valid. Pastikan menggunakan http:// atau https://.' };
        return res.redirect('/');
    }

    let shortIdValue;
    let isUnique = false;
    
    // Loop untuk memastikan ID unik
    while (!isUnique) {
        shortIdValue = generateShortId(fullUrl);
        const existingUrl = await UrlModel.findOne({ shortId: shortIdValue });
        if (!existingUrl) {
            isUnique = true;
        }
    }
    
    try {
        await UrlModel.create({
            userId: CURRENT_USER_ID,
            fullUrl: fullUrl, 
            shortId: shortIdValue, 
        });

        const shortLink = `http://localhost:${port}/${shortIdValue}`;
        
        // Notifikasi Telegram
        await sendTelegramNotification(
            `*🎉 URL Baru Dibuat!* \n` +
            `Oleh: \`${CURRENT_USER_ID}\`\n` +
            `Link Pendek: ${shortLink}`
        );

        // Notifikasi Toast untuk pengguna
        req.session.notification = { type: 'success', message: `✅ Link dipendekkan! ID: /${shortIdValue}` };
        res.redirect('/');
        
    } catch (error) {
        console.error(error);
        req.session.notification = { type: 'danger', message: 'Terjadi kesalahan server saat menyimpan URL.' };
        res.redirect('/');
    }
});

// --- ROUTE REDIRECTION dan Halaman 404 Kustom ---
app.get('/:shortId', async (req, res) => {
    const shortId = req.params.shortId;
    
    try {
        const urlEntry = await UrlModel.findOneAndUpdate(
            { shortId: shortId },
            { $inc: { clicks: 1 } },
            { new: true }
        );

        if (urlEntry == null) {
            // Halaman 404 Kustom
            return res.status(404).render('404', { shortId: shortId }); 
        }
        
        res.redirect(urlEntry.fullUrl);
    } catch (error) {
        console.error(error);
        res.status(500).send("Terjadi kesalahan saat mengarahkan.");
    }
});

// Jalankan server
app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
});