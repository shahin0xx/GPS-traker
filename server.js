const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const crypto = require('crypto');
const multer = require('multer');
const fs = require('fs');

// ============ کاوه نگار ============
const Kavenegar = require('kavenegar');

const KAVENEGAR_API_KEY = '7165777962736D56636E562F6E304E3061486B4E466E654C6B67443875694378492B5738546D34636153303D';
const KAVENEGAR_SENDER = '2000660110';

const api = Kavenegar.KavenegarApi({ apikey: KAVENEGAR_API_KEY });

// ============================================================
// تابع ارسال پیامک
// ============================================================
function sendSms(receptor, message) {
    if (!receptor || receptor.length < 11) {
        console.log('⚠️ شماره تلفن نامعتبر:', receptor);
        return;
    }
    receptor = receptor.replace(/\s/g, '');
    console.log(`📤 ارسال پیامک به ${receptor}:`, message);
    api.Send({
        message: message,
        sender: KAVENEGAR_SENDER,
        receptor: receptor
    }, function(response, status) {
        if (status === 200) {
            console.log('✅ پیامک با موفقیت ارسال شد به:', receptor);
        } else {
            console.log('❌ خطا در ارسال پیامک:');
            console.log('   وضعیت:', status);
            console.log('   پاسخ:', response);
        }
    });
}

app.post('/api/send-sms', express.json(), (req, res) => {
    const { phone, message } = req.body;
    if (!phone || !message) {
        return res.status(400).json({ error: 'شماره و پیام الزامی است' });
    }
    sendSms(phone, message);
    res.json({ success: true, message: 'پیامک در حال ارسال است' });
});

// ============ دیتابیس ============
const { Database } = require('./database');

// ============ تنظیمات سشن ============
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'gps-tracker-super-secret-key-2024',
    resave: true,
    saveUninitialized: true,
    cookie: {
        secure: false,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        path: '/'
    },
    name: 'gps_session',
    rolling: true
}));

// ============================================================
// تنظیمات آپلود فایل‌های فروشگاه
// ============================================================
const uploadDir = path.join(__dirname, 'public', 'shop-uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + '-' + file.originalname.replace(/\s/g, '_');
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('فرمت فایل مجاز نیست'), false);
    }
};

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: fileFilter
});

// ============ میدلورها ============
function isAdmin(req, res, next) {
    if (req.session && req.session.isAdmin) return next();
    res.redirect('/admin-login.html');
}

function isSuperAdmin(req, res, next) {
    if (req.session && req.session.isAdmin && req.session.isSuperAdmin) return next();
    res.status(403).json({ error: 'دسترسی محدود به سوپر ادمین' });
}

// ============ تغییر مسیر ریشه ============
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.use(express.static('public'));

app.get('/share/:token', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'share.html'));
});

app.get('/product/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'product-detail.html'));
});

// ============================================================
// توابع کمکی
// ============================================================
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function generateTripId() {
    return 'trip_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
}

function generateSlug(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\u0600-\u06FF\s]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

// ============================================================
// متغیرهای سراسری
// ============================================================
let deviceLastReceived = {};
let deviceAlertSent = {};
let deviceActivationSent = {};
let deviceGeofenceAlertSent = {};
let deviceSpeedAlertSent = {};
let geofenceDataStore = {};
let speedLimitDataStore = {};
let deviceLocations = {};
let tripRecorders = {};
let lastProcessedTime = {};
let deviceTotalDistance = {};
let port = null;
let parser = null;
let isSerialConnected = false;

// ============================================================
// بارگذاری داده‌های اولیه
// ============================================================
async function loadInitialData() {
    try {
        const devices = await Database.getAllDevices();
        for (const device of devices) {
            const geofence = await Database.getGeofence(device.device_id);
            if (geofence) {
                geofenceDataStore[device.device_id] = {
                    centerLat: geofence.center_lat,
                    centerLng: geofence.center_lng,
                    radius: geofence.radius
                };
            }
            if (device.total_distance) {
                deviceTotalDistance[device.device_id] = device.total_distance;
            }
        }
    } catch (err) {
        console.error('❌ خطا در بارگذاری داده‌های اولیه:', err);
    }
}

// ============================================================
// بررسی موقعیت دستگاه‌ها (هر 30 ثانیه)
// ============================================================
setInterval(async () => {
    const now = Date.now();
    try {
        const devices = await Database.getAllDevices();
        for (const device of devices) {
            const deviceId = device.device_id;
            const ownerPhone = device.owner_phone;
            if (!ownerPhone) continue;
            if (!deviceLastReceived[deviceId]) continue;
            const timeSinceLastUpdate = (now - deviceLastReceived[deviceId]) / 1000;
            if (timeSinceLastUpdate > 60 && !deviceAlertSent[deviceId]) {
                const message = `⚠️ هشدار GPS - دستگاه ${deviceId}\nموقعیت دستگاه شما بیش از ۱ دقیقه است که به‌روز نشده است.\nلطفاً دستگاه را بررسی کنید.`;
                sendSms(ownerPhone, message);
                deviceAlertSent[deviceId] = true;
                console.log(`🚨 هشدار توقف موقعیت برای دستگاه ${deviceId} ارسال شد`);
            }
            if (timeSinceLastUpdate <= 60 && deviceAlertSent[deviceId]) {
                const message = `✅ GPS فعال شد - دستگاه ${deviceId}\nموقعیت دستگاه شما مجدداً فعال شد و به‌روزرسانی می‌شود.`;
                sendSms(ownerPhone, message);
                deviceAlertSent[deviceId] = false;
                console.log(`✅ پیام فعال‌سازی مجدد برای دستگاه ${deviceId} ارسال شد`);
            }
        }
    } catch (err) {
        console.error('❌ خطا در بررسی دستگاه‌ها:', err);
    }
}, 30000);

// ============================================================
// بررسی محدوده جغرافیایی (هر 10 ثانیه)
// ============================================================
setInterval(async () => {
    try {
        const devices = await Database.getAllDevices();
        for (const device of devices) {
            const deviceId = device.device_id;
            const ownerPhone = device.owner_phone;
            if (!ownerPhone) continue;
            if (!deviceLocations[deviceId]) continue;
            const geofenceData = geofenceDataStore[deviceId];
            if (!geofenceData) continue;
            const { centerLat, centerLng, radius } = geofenceData;
            const currentLat = deviceLocations[deviceId].latitude;
            const currentLng = deviceLocations[deviceId].longitude;
            const distance = calculateDistance(centerLat, centerLng, currentLat, currentLng);
            const isInside = distance <= radius;
            if (!isInside && !deviceGeofenceAlertSent[deviceId]) {
                const message = `🚨 هشدار خروج از محدوده - دستگاه ${deviceId}\nخودرو شما از محدوده امن خارج شد.\nموقعیت: ${currentLat.toFixed(6)}, ${currentLng.toFixed(6)}\nفاصله از محدوده: ${distance.toFixed(2)} کیلومتر\nلطفاً بررسی کنید.`;
                sendSms(ownerPhone, message);
                deviceGeofenceAlertSent[deviceId] = true;
                console.log(`🚨 هشدار خروج از محدوده برای دستگاه ${deviceId} ارسال شد`);
                io.emit(`geofence_alert_${deviceId}`, {
                    deviceId,
                    message: 'خودرو شما از محدوده امن خارج شد',
                    latitude: currentLat,
                    longitude: currentLng,
                    distance: distance
                });
            }
            if (isInside && deviceGeofenceAlertSent[deviceId]) {
                deviceGeofenceAlertSent[deviceId] = false;
                console.log(`✅ دستگاه ${deviceId} دوباره وارد محدوده شد`);
            }
        }
    } catch (err) {
        console.error('❌ خطا در بررسی محدوده:', err);
    }
}, 10000);

// ============================================================
// بررسی سرعت (هر 5 ثانیه)
// ============================================================
setInterval(async () => {
    try {
        const devices = await Database.getAllDevices();
        for (const device of devices) {
            const deviceId = device.device_id;
            const ownerPhone = device.owner_phone;
            if (!ownerPhone) continue;
            if (!deviceLocations[deviceId]) continue;
            const currentSpeed = deviceLocations[deviceId].speed || 0;
            const speedLimitData = await Database.getSpeedLimit(deviceId);
            if (!speedLimitData) continue;
            const speedLimit = speedLimitData.speed_limit;
            if (currentSpeed > speedLimit && !deviceSpeedAlertSent[deviceId]) {
                const message = `🚨 هشدار سرعت - دستگاه ${deviceId}\nسرعت خودرو از حد تعیین شده بیشتر شد.\nسرعت فعلی: ${Math.round(currentSpeed)} کیلومتر بر ساعت\nحد مجاز: ${speedLimit} کیلومتر بر ساعت\nلطفاً بررسی کنید.`;
                sendSms(ownerPhone, message);
                deviceSpeedAlertSent[deviceId] = true;
                console.log(`🚨 هشدار سرعت برای دستگاه ${deviceId} ارسال شد (${Math.round(currentSpeed)} > ${speedLimit})`);
                io.emit(`speed_alert_${deviceId}`, {
                    deviceId,
                    currentSpeed: Math.round(currentSpeed),
                    speedLimit: speedLimit,
                    message: 'سرعت خودرو از حد مجاز بیشتر شد'
                });
            }
            if (currentSpeed <= speedLimit && deviceSpeedAlertSent[deviceId]) {
                deviceSpeedAlertSent[deviceId] = false;
                console.log(`✅ سرعت دستگاه ${deviceId} به حد مجاز برگشت`);
            }
        }
    } catch (err) {
        console.error('❌ خطا در بررسی سرعت:', err);
    }
}, 5000);

// ============================================================
// API های محدوده جغرافیایی
// ============================================================
app.post('/api/set-geofence', express.json(), async (req, res) => {
    const { deviceId, centerLat, centerLng, radius } = req.body;
    if (!deviceId || centerLat === undefined || centerLng === undefined || !radius) {
        return res.status(400).json({ error: 'اطلاعات کامل نیست' });
    }
    try {
        await Database.saveGeofence(deviceId, centerLat, centerLng, radius);
        geofenceDataStore[deviceId] = { centerLat, centerLng, radius };
        deviceGeofenceAlertSent[deviceId] = false;
        console.log(`✅ محدوده جغرافیایی برای دستگاه ${deviceId} تنظیم شد`);
        res.json({ success: true, message: 'محدوده جغرافیایی با موفقیت تنظیم شد' });
    } catch (err) {
        console.error('❌ خطا در ذخیره محدوده:', err);
        res.status(500).json({ error: 'خطا در ذخیره محدوده' });
    }
});

app.get('/api/get-geofence/:deviceId', async (req, res) => {
    const { deviceId } = req.params;
    try {
        const data = await Database.getGeofence(deviceId);
        if (data) {
            res.json({ hasGeofence: true, centerLat: data.center_lat, centerLng: data.center_lng, radius: data.radius });
        } else {
            res.json({ hasGeofence: false });
        }
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت محدوده' });
    }
});

app.post('/api/delete-geofence', express.json(), async (req, res) => {
    const { deviceId } = req.body;
    if (!deviceId) {
        return res.status(400).json({ error: 'شناسه دستگاه مشخص نیست' });
    }
    try {
        await Database.deleteGeofence(deviceId);
        delete geofenceDataStore[deviceId];
        deviceGeofenceAlertSent[deviceId] = false;
        console.log(`✅ محدوده جغرافیایی برای دستگاه ${deviceId} حذف شد`);
        res.json({ success: true, message: 'محدوده جغرافیایی با موفقیت حذف شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در حذف محدوده' });
    }
});

// ============================================================
// API های سرعت مجاز
// ============================================================
app.post('/api/set-speed-limit', express.json(), async (req, res) => {
    const { deviceId, speedLimit } = req.body;
    if (!deviceId || !speedLimit || speedLimit < 1) {
        return res.status(400).json({ error: 'اطلاعات کامل نیست' });
    }
    try {
        await Database.saveSpeedLimit(deviceId, speedLimit);
        console.log(`✅ سرعت مجاز برای دستگاه ${deviceId} تنظیم شد: ${speedLimit} km/h`);
        res.json({ success: true, message: `سرعت مجاز روی ${speedLimit} کیلومتر بر ساعت تنظیم شد` });
    } catch (err) {
        res.status(500).json({ error: 'خطا در تنظیم سرعت مجاز' });
    }
});

app.get('/api/get-speed-limit/:deviceId', async (req, res) => {
    const { deviceId } = req.params;
    try {
        const data = await Database.getSpeedLimit(deviceId);
        if (data) {
            res.json({ hasSpeedLimit: true, speedLimit: data.speed_limit });
        } else {
            res.json({ hasSpeedLimit: false });
        }
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت سرعت مجاز' });
    }
});

app.post('/api/delete-speed-limit', express.json(), async (req, res) => {
    const { deviceId } = req.body;
    if (!deviceId) {
        return res.status(400).json({ error: 'شناسه دستگاه مشخص نیست' });
    }
    try {
        await Database.deleteSpeedLimit(deviceId);
        console.log(`✅ سرعت مجاز برای دستگاه ${deviceId} حذف شد`);
        res.json({ success: true, message: 'سرعت مجاز با موفقیت حذف شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در حذف سرعت مجاز' });
    }
});

// ============================================================
// API های ادمین
// ============================================================
app.post('/api/admin-login', express.json(), async (req, res) => {
    const { username, password } = req.body;
    try {
        const admin = await Database.getAdminByUsername(username);
        if (admin && admin.password === password) {
            req.session.isAdmin = true;
            req.session.username = username;
            req.session.isSuperAdmin = admin.is_super_admin === 1;
            req.session.save();
            res.json({ success: true, message: 'ورود موفق', isSuperAdmin: admin.is_super_admin === 1, username });
        } else {
            res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
        }
    } catch (err) {
        res.status(500).json({ error: 'خطا در سرور' });
    }
});

app.post('/api/admin-logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/admin-check', (req, res) => {
    if (req.session && req.session.isAdmin) {
        res.json({ isLoggedIn: true, username: req.session.username, isSuperAdmin: req.session.isSuperAdmin || false });
    } else {
        res.json({ isLoggedIn: false });
    }
});

app.post('/api/admin-change-own-password', isAdmin, express.json(), async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const username = req.session.username;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'اطلاعات کامل نیست' });
    if (newPassword.length < 4) return res.status(400).json({ error: 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد' });
    try {
        const admin = await Database.getAdminByUsername(username);
        if (!admin) return res.status(404).json({ error: 'ادمین یافت نشد' });
        if (admin.password !== currentPassword) return res.status(401).json({ error: 'رمز عبور فعلی اشتباه است' });
        await Database.updateAdmin(username, { password: newPassword });
        res.json({ success: true, message: 'رمز عبور با موفقیت تغییر کرد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در سرور' });
    }
});

// ============================================================
// API های سوپر ادمین
// ============================================================
app.get('/api/admins', isSuperAdmin, async (req, res) => {
    try {
        const admins = await Database.getAllAdmins();
        res.json(admins);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت ادمین‌ها' });
    }
});

app.post('/api/admin-create', isSuperAdmin, express.json(), async (req, res) => {
    const { username, password, fullName, isSuperAdmin } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است' });
    if (password.length < 4) return res.status(400).json({ error: 'رمز عبور باید حداقل ۴ کاراکتر باشد' });
    try {
        const existing = await Database.getAdminByUsername(username);
        if (existing) return res.status(400).json({ error: 'این نام کاربری قبلاً استفاده شده است' });
        await Database.createAdmin(username, password, fullName, isSuperAdmin || false);
        res.json({ success: true, message: 'ادمین جدید با موفقیت ساخته شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در سرور' });
    }
});

app.post('/api/admin-delete', isSuperAdmin, express.json(), async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'نام کاربری مشخص نیست' });
    if (username === req.session.username) return res.status(400).json({ error: 'نمی‌توانید خودتان را حذف کنید' });
    try {
        const admin = await Database.getAdminByUsername(username);
        if (!admin) return res.status(404).json({ error: 'ادمین یافت نشد' });
        if (admin.is_super_admin === 1) return res.status(400).json({ error: 'نمی‌توانید سوپر ادمین را حذف کنید' });
        await Database.deleteAdmin(username);
        res.json({ success: true, message: 'ادمین با موفقیت حذف شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در سرور' });
    }
});

app.post('/api/admin-change-username', isSuperAdmin, express.json(), async (req, res) => {
    const { oldUsername, newUsername } = req.body;
    if (!oldUsername || !newUsername) return res.status(400).json({ error: 'اطلاعات کامل نیست' });
    if (newUsername.length < 3) return res.status(400).json({ error: 'نام کاربری جدید باید حداقل ۳ کاراکتر باشد' });
    try {
        const admin = await Database.getAdminByUsername(oldUsername);
        if (!admin) return res.status(404).json({ error: 'ادمین یافت نشد' });
        const existing = await Database.getAdminByUsername(newUsername);
        if (existing) return res.status(400).json({ error: 'این نام کاربری قبلاً استفاده شده است' });
        await Database.updateAdmin(oldUsername, { username: newUsername });
        res.json({ success: true, message: 'نام کاربری با موفقیت تغییر کرد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در سرور' });
    }
});

// ============================================================
// API های دستگاه
// ============================================================
app.post('/api/register-device', isAdmin, express.json(), async (req, res) => {
    const { deviceId, password, buyerName, buyerFamily, nationalCode, address, carType, carPlate, userId, ownerPhone } = req.body;
    if (!deviceId || !password || !buyerName) return res.status(400).json({ error: 'اطلاعات کامل نیست' });
    if (!ownerPhone) return res.status(400).json({ error: 'شماره تماس دارنده الزامی است' });
    try {
        const existing = await Database.getDeviceByDeviceId(deviceId);
        if (existing) return res.status(400).json({ error: 'این دستگاه قبلاً ثبت شده است' });
        await Database.createDevice(deviceId, password, userId || null, {
            buyerName, buyerFamily, nationalCode, address, carType, carPlate,
            ownerPhone: ownerPhone
        });
        res.json({ success: true, message: 'دستگاه با موفقیت ثبت شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در سرور' });
    }
});

app.get('/api/devices', isAdmin, async (req, res) => {
    try {
        const devices = await Database.getAllDevices();
        res.json(devices);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت دستگاه‌ها' });
    }
});

app.post('/api/admin-change-password', isAdmin, express.json(), async (req, res) => {
    const { deviceId, newPassword } = req.body;
    if (!deviceId || !newPassword) return res.status(400).json({ error: 'اطلاعات کامل نیست' });
    if (newPassword.length < 4) return res.status(400).json({ error: 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد' });
    try {
        const device = await Database.getDeviceByDeviceId(deviceId);
        if (!device) return res.status(404).json({ error: 'دستگاه یافت نشد' });
        await Database.updateDevice(deviceId, { password: newPassword });
        res.json({ success: true, message: 'رمز عبور با موفقیت تغییر کرد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در سرور' });
    }
});

app.post('/api/admin-delete-device', isAdmin, express.json(), async (req, res) => {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'شناسه دستگاه مشخص نیست' });
    try {
        await Database.deleteDevice(deviceId);
        res.json({ success: true, message: 'دستگاه با موفقیت حذف شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در سرور' });
    }
});

// ============================================================
// API های کاربر
// ============================================================
app.post('/api/login', express.json(), async (req, res) => {
    const { deviceId, password } = req.body;
    if (!deviceId || !password) return res.status(400).json({ error: 'لطفاً تمام فیلدها را پر کنید' });
    try {
        const device = await Database.getDeviceByDeviceId(deviceId);
        if (!device) return res.status(401).json({ error: 'دستگاه یافت نشد' });
        if (device.password !== password) return res.status(401).json({ error: 'رمز عبور اشتباه است' });
        req.session.userLoggedIn = true;
        req.session.userDeviceId = deviceId;
        req.session.userName = device.buyer_name;
        req.session.save();
        if (device.is_first_login === 1) await Database.updateDevice(deviceId, { is_first_login: 0 });
        res.json({ success: true, deviceId: device.device_id, buyerName: device.buyer_name, buyerFamily: device.buyer_family });
    } catch (err) {
        res.status(500).json({ error: 'خطا در سرور' });
    }
});

app.get('/api/user-check', (req, res) => {
    if (req.session && req.session.userLoggedIn) {
        res.json({ isLoggedIn: true, deviceId: req.session.userDeviceId, userName: req.session.userName });
    } else {
        res.json({ isLoggedIn: false });
    }
});

app.post('/api/user-logout', (req, res) => {
    req.session.userLoggedIn = false;
    req.session.userDeviceId = null;
    req.session.userName = null;
    req.session.save();
    res.json({ success: true });
});

app.post('/api/change-password', express.json(), async (req, res) => {
    const { deviceId, currentPassword, newPassword } = req.body;
    if (!deviceId || !currentPassword || !newPassword) return res.status(400).json({ error: 'اطلاعات کامل نیست' });
    if (newPassword.length < 4) return res.status(400).json({ error: 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد' });
    try {
        const device = await Database.getDeviceByDeviceId(deviceId);
        if (!device) return res.status(404).json({ error: 'دستگاه یافت نشد' });
        if (device.password !== currentPassword) return res.status(401).json({ error: 'رمز عبور فعلی اشتباه است' });
        await Database.updateDevice(deviceId, { password: newPassword });
        res.json({ success: true, message: 'رمز عبور با موفقیت تغییر کرد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در سرور' });
    }
});

// ============================================================
// API های لینک موقت
// ============================================================
app.post('/api/create-share-link', express.json(), async (req, res) => {
    const { deviceId, password, duration } = req.body;
    if (!deviceId || !password) return res.status(400).json({ error: 'اطلاعات کامل نیست' });
    try {
        const device = await Database.getDeviceByDeviceId(deviceId);
        if (!device) return res.status(404).json({ error: 'دستگاه یافت نشد' });
        if (device.password !== password) return res.status(401).json({ error: 'رمز عبور اشتباه است' });
        const token = crypto.randomBytes(16).toString('hex');
        const expiresIn = (duration || 30) * 60 * 1000;
        const expiresAt = Date.now() + expiresIn;
        await Database.createShareLink(token, deviceId, expiresAt);
        const baseUrl = req.protocol + '://' + req.get('host');
        res.json({ success: true, url: baseUrl + '/share/' + token, token, expiresIn: duration || 30, message: 'لینک با موفقیت ساخته شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در سرور' });
    }
});

app.get('/api/share-location/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const link = await Database.getShareLink(token);
        if (!link) return res.status(404).json({ error: 'لینک نامعتبر است' });
        if (Date.now() > link.expires_at) { await Database.deactivateShareLink(token); return res.status(410).json({ error: 'لینک منقضی شده است' }); }
        if (link.is_active === 0) return res.status(404).json({ error: 'لینک غیرفعال شده است' });
        await Database.updateShareLinkViews(token);
        const location = deviceLocations[link.device_id] || null;
        if (!location) return res.status(404).json({ error: 'موقعیت دستگاه در دسترس نیست' });
        res.json({ deviceId: link.device_id, latitude: location.latitude, longitude: location.longitude, speed: location.speed || 0, satellites: location.satellites || 0, expiresAt: link.expires_at, remainingTime: Math.max(0, Math.floor((link.expires_at - Date.now()) / 1000 / 60)) });
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت موقعیت' });
    }
});

app.post('/api/share/cancel', express.json(), async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'توکن مشخص نیست' });
    try {
        await Database.deactivateShareLink(token);
        res.json({ success: true, message: 'لینک با موفقیت لغو شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در سرور' });
    }
});

app.get('/api/shared-links/:deviceId', async (req, res) => {
    const { deviceId } = req.params;
    try {
        const links = await Database.getShareLinksByDevice(deviceId);
        const result = links.map(l => ({ ...l, url: req.protocol + '://' + req.get('host') + '/share/' + l.token, views: l.views || 0, isActive: l.is_active === 1 }));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت لینک‌ها' });
    }
});

// ============================================================
// API های ضبط حرکت
// ============================================================
app.post('/api/trip/start', express.json(), async (req, res) => {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'شناسه دستگاه مشخص نیست' });
    try {
        const activeTrip = await Database.getActiveTrip(deviceId);
        if (activeTrip) return res.status(400).json({ error: 'در حال حاضر یک سفر فعال وجود دارد' });
        const tripId = generateTripId();
        await Database.createTrip(tripId, deviceId);
        if (!tripRecorders[deviceId]) tripRecorders[deviceId] = { tripId, lastLocation: null, stopStart: null, isRecording: true };
        res.json({ success: true, tripId, message: 'ضبط حرکت شروع شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در سرور' });
    }
});

app.post('/api/trip/stop', express.json(), async (req, res) => {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'شناسه دستگاه مشخص نیست' });
    try {
        const trip = await Database.getActiveTrip(deviceId);
        if (!trip) return res.status(404).json({ error: 'سفر فعالی یافت نشد' });
        const locations = await Database.getTripLocations(trip.trip_id);
        if (locations.length > 1) {
            let totalDist = 0, maxSpd = 0, totalSpd = 0;
            for (let i = 1; i < locations.length; i++) {
                const prev = locations[i - 1], curr = locations[i];
                const dist = calculateDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
                totalDist += dist;
                if (curr.speed > maxSpd) maxSpd = curr.speed;
                totalSpd += curr.speed;
            }
            totalDist = parseFloat(totalDist.toFixed(2));
            maxSpd = parseFloat(maxSpd.toFixed(1));
            const avgSpd = parseFloat((totalSpd / locations.length).toFixed(1));
            await Database.updateTripStats(trip.trip_id, totalDist, maxSpd, avgSpd);
        }
        await Database.stopTrip(trip.trip_id);
        if (tripRecorders[deviceId]) { tripRecorders[deviceId].isRecording = false; tripRecorders[deviceId] = null; }
        res.json({ success: true, tripId: trip.trip_id, totalDistance: trip.total_distance || 0, message: 'ضبط حرکت متوقف شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در سرور' });
    }
});

app.get('/api/trips/:deviceId', async (req, res) => {
    const { deviceId } = req.params;
    try {
        const trips = await Database.getTripsByDevice(deviceId);
        res.json(trips);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت سفرها' });
    }
});

app.get('/api/trip/:tripId', async (req, res) => {
    const { tripId } = req.params;
    try {
        const trip = await Database.getTrip(tripId);
        if (!trip) return res.status(404).json({ error: 'سفر یافت نشد' });
        const locations = await Database.getTripLocations(tripId);
        const stops = await Database.getTripStops(tripId);
        trip.locations = locations;
        trip.stops = stops;
        res.json(trip);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت اطلاعات سفر' });
    }
});

app.delete('/api/trip/:tripId', async (req, res) => {
    const { tripId } = req.params;
    try {
        await Database.deleteTrip(tripId);
        res.json({ success: true, message: 'سفر با موفقیت حذف شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در حذف سفر' });
    }
});

// ============================================================
// API های هشدار مسافت
// ============================================================
app.post('/api/distance-alert/set', express.json(), async (req, res) => {
    const { deviceId, targetDistance, message } = req.body;
    if (!deviceId || !targetDistance || !message) return res.status(400).json({ error: 'اطلاعات کامل نیست' });
    if (targetDistance < 1) return res.status(400).json({ error: 'مسافت باید حداقل ۱ کیلومتر باشد' });
    if (message.length < 3) return res.status(400).json({ error: 'پیام باید حداقل ۳ کاراکتر باشد' });
    try {
        await Database.deleteDistanceAlert(deviceId);
        await Database.createDistanceAlert(deviceId, targetDistance, message);
        res.json({ success: true, message: 'هشدار مسافت با موفقیت تنظیم شد', data: { targetDistance, message } });
    } catch (err) {
        res.status(500).json({ error: 'خطا در سرور' });
    }
});

app.get('/api/distance-alert/status/:deviceId', async (req, res) => {
    const { deviceId } = req.params;
    try {
        const alert = await Database.getDistanceAlert(deviceId);
        if (!alert) return res.json({ hasAlert: false });
        res.json({ hasAlert: true, targetDistance: alert.target_distance, currentDistance: alert.current_distance || 0, message: alert.message, isTriggered: alert.is_triggered === 1, progress: Math.min(((alert.current_distance || 0) / alert.target_distance) * 100, 100) });
    } catch (err) {
        res.status(500).json({ error: 'خطا در سرور' });
    }
});

app.post('/api/distance-alert/cancel', express.json(), async (req, res) => {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'شناسه دستگاه مشخص نیست' });
    try {
        await Database.deleteDistanceAlert(deviceId);
        res.json({ success: true, message: 'هشدار مسافت لغو شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در سرور' });
    }
});

// ============================================================
// API های کاربر با سشن
// ============================================================
app.post('/api/register-user', express.json(), async (req, res) => {
    const { username, fullName, phone, email, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است' });
    if (password.length < 4) return res.status(400).json({ error: 'رمز عبور باید حداقل ۴ کاراکتر باشد' });
    try {
        const existing = await Database.getUserByUsername(username);
        if (existing) return res.status(400).json({ error: 'این نام کاربری قبلاً استفاده شده است' });
        await Database.createUser(username, fullName, phone, email, password, role || 'user');
        res.json({ success: true, message: 'حساب کاربری با موفقیت ساخته شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در سرور' });
    }
});

app.post('/api/user-login', express.json(), async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است' });
    try {
        const user = await Database.getUserByUsername(username);
        if (!user) return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
        if (user.password !== password) return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
        if (user.is_active === 0) return res.status(403).json({ error: 'حساب کاربری غیرفعال است' });
        await Database.updateUserLastLogin(user.id);
        const sessionToken = crypto.randomBytes(32).toString('hex');
        await Database.createUserSession(user.id, sessionToken);
        req.session.userLoggedIn = true;
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.sessionToken = sessionToken;
        req.session.save();
        res.json({ success: true, user: { id: user.id, username: user.username, full_name: user.full_name, phone: user.phone, email: user.email, role: user.role }, message: 'ورود موفق' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در سرور' });
    }
});

app.post('/api/user-logout-web', async (req, res) => {
    const sessionToken = req.session.sessionToken;
    if (sessionToken) await Database.deleteUserSession(sessionToken);
    req.session.userLoggedIn = false;
    req.session.userId = null;
    req.session.username = null;
    req.session.sessionToken = null;
    req.session.save();
    res.json({ success: true });
});

app.get('/api/user-session-check', async (req, res) => {
    if (!req.session.userLoggedIn || !req.session.userId) return res.json({ isLoggedIn: false });
    try {
        const session = await Database.getUserSession(req.session.sessionToken);
        if (!session) { req.session.userLoggedIn = false; return res.json({ isLoggedIn: false }); }
        await Database.updateUserSessionActivity(req.session.sessionToken);
        const user = await Database.getUserById(req.session.userId);
        const devices = await Database.getDevicesByUserId(req.session.userId);
        res.json({ isLoggedIn: true, user: { id: user.id, username: user.username, full_name: user.full_name, phone: user.phone, email: user.email, role: user.role }, devices });
    } catch (err) {
        res.json({ isLoggedIn: false });
    }
});

app.get('/api/my-devices', async (req, res) => {
    if (!req.session.userLoggedIn || !req.session.userId) return res.status(401).json({ error: 'لطفاً وارد شوید' });
    try {
        const devices = await Database.getDevicesByUserId(req.session.userId);
        res.json(devices);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت دستگاه‌ها' });
    }
});

// ============================================================
// API های مدیریت کاربر توسط ادمین
// ============================================================
app.get('/api/admin/users', isAdmin, async (req, res) => {
    try {
        const users = await Database.getUsers();
        for (let user of users) {
            const devices = await Database.getDevicesByUserId(user.id);
            user.device_count = devices.length;
        }
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت کاربران' });
    }
});

app.get('/api/admin/user-devices/:userId', isAdmin, async (req, res) => {
    const { userId } = req.params;
    try {
        const devices = await Database.getDevicesByUserId(userId);
        res.json(devices);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت دستگاه‌ها' });
    }
});

app.post('/api/admin/assign-device', isAdmin, express.json(), async (req, res) => {
    const { deviceId, userId } = req.body;
    if (!deviceId || !userId) return res.status(400).json({ error: 'شناسه دستگاه و کاربر الزامی است' });
    try {
        const device = await Database.getDeviceByDeviceId(deviceId);
        if (!device) return res.status(404).json({ error: 'دستگاه یافت نشد' });
        const user = await Database.getUserById(userId);
        if (!user) return res.status(404).json({ error: 'کاربر یافت نشد' });
        await Database.assignDeviceToUser(deviceId, userId);
        res.json({ success: true, message: 'دستگاه با موفقیت به کاربر اختصاص یافت' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در سرور' });
    }
});

app.get('/api/admin/unassigned-devices', isAdmin, async (req, res) => {
    try {
        const devices = await Database.getDevicesWithoutUser();
        res.json(devices);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت دستگاه‌ها' });
    }
});

app.post('/api/admin/toggle-user', isAdmin, express.json(), async (req, res) => {
    const { userId, isActive } = req.body;
    if (!userId) return res.status(400).json({ error: 'شناسه کاربر الزامی است' });
    try {
        await Database.updateUser(userId, { is_active: isActive ? 1 : 0 });
        res.json({ success: true, message: 'وضعیت کاربر با موفقیت تغییر کرد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در سرور' });
    }
});

app.delete('/api/admin/user/:userId', isAdmin, async (req, res) => {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: 'شناسه کاربر مشخص نیست' });
    try {
        await Database.deleteUser(userId);
        res.json({ success: true, message: 'کاربر با موفقیت حذف شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در حذف کاربر' });
    }
});

// ============================================================
// ============ API های فروشگاه ============
// ============================================================

// ------ فروشگاه‌ها ------

// دریافت تمام فروشگاه‌ها
app.get('/api/shop/shops', async (req, res) => {
    try {
        const shops = await Database.getAllShops(false);
        res.json(shops);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت فروشگاه‌ها' });
    }
});

// دریافت فروشگاه توسط شناسه
app.get('/api/shop/:id', async (req, res) => {
    try {
        const shop = await Database.getShopById(req.params.id);
        if (!shop) return res.status(404).json({ error: 'فروشگاه یافت نشد' });
        res.json(shop);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت فروشگاه' });
    }
});

// دریافت فروشگاه اصلی
app.get('/api/shop/main', async (req, res) => {
    try {
        const shop = await Database.getMainShop();
        if (!shop) return res.status(404).json({ error: 'فروشگاه اصلی یافت نشد' });
        res.json(shop);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت فروشگاه' });
    }
});

// ایجاد فروشگاه (فقط سوپر ادمین)
app.post('/api/shop', isSuperAdmin, upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'cover_image', maxCount: 1 }
]), async (req, res) => {
    try {
        const { name, slug, description, is_main } = req.body;
        if (!name || !slug) {
            return res.status(400).json({ error: 'نام و اسلاگ الزامی است' });
        }
        const existing = await Database.getShopBySlug(slug);
        if (existing) {
            return res.status(400).json({ error: 'این اسلاگ قبلاً استفاده شده است' });
        }
        const logo = req.files?.logo ? '/shop-uploads/' + req.files.logo[0].filename : null;
        const coverImage = req.files?.cover_image ? '/shop-uploads/' + req.files.cover_image[0].filename : null;
        const shopId = await Database.createShop(
            name, slug, description || '', logo, coverImage, 
            is_main === 'true' || is_main === true, 
            1
        );
        res.json({ success: true, shopId, message: 'فروشگاه با موفقیت ایجاد شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در ایجاد فروشگاه: ' + err.message });
    }
});

// ویرایش فروشگاه
app.put('/api/shop/:id', isSuperAdmin, upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'cover_image', maxCount: 1 }
]), async (req, res) => {
    try {
        const shopId = req.params.id;
        const { name, slug, description, is_active, is_main } = req.body;
        const data = {};
        if (name) data.name = name;
        if (slug) {
            const existing = await Database.getShopBySlug(slug);
            if (existing && existing.id != shopId) {
                return res.status(400).json({ error: 'این اسلاگ قبلاً استفاده شده است' });
            }
            data.slug = slug;
        }
        if (description !== undefined) data.description = description;
        if (is_active !== undefined) data.is_active = is_active === 'true' || is_active === true;
        if (is_main !== undefined) data.is_main = is_main === 'true' || is_main === true;
        if (req.files?.logo) data.logo = '/shop-uploads/' + req.files.logo[0].filename;
        if (req.files?.cover_image) data.cover_image = '/shop-uploads/' + req.files.cover_image[0].filename;
        await Database.updateShop(shopId, data);
        res.json({ success: true, message: 'فروشگاه با موفقیت ویرایش شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در ویرایش فروشگاه' });
    }
});

// حذف فروشگاه
app.delete('/api/shop/:id', isSuperAdmin, async (req, res) => {
    try {
        await Database.deleteShop(req.params.id);
        res.json({ success: true, message: 'فروشگاه با موفقیت حذف شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در حذف فروشگاه' });
    }
});

// ------ دسته‌بندی‌ها ------

// دریافت دسته‌بندی‌های یک فروشگاه
app.get('/api/shop/:shopId/categories', async (req, res) => {
    try {
        const categories = await Database.getCategoriesByShop(req.params.shopId);
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت دسته‌بندی‌ها' });
    }
});

// ایجاد دسته‌بندی
app.post('/api/category', isAdmin, express.json(), async (req, res) => {
    try {
        const { shop_id, name, slug, description, icon, parent_id } = req.body;
        if (!shop_id || !name || !slug) {
            return res.status(400).json({ error: 'اطلاعات کامل نیست' });
        }
        const categoryId = await Database.createCategory(shop_id, name, slug, description || '', icon || null, parent_id || null);
        res.json({ success: true, categoryId, message: 'دسته‌بندی با موفقیت ایجاد شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در ایجاد دسته‌بندی' });
    }
});

// ویرایش دسته‌بندی
app.put('/api/category/:id', isAdmin, express.json(), async (req, res) => {
    try {
        const { name, slug, description, icon, sort_order, is_active, parent_id } = req.body;
        const data = {};
        if (name) data.name = name;
        if (slug) data.slug = slug;
        if (description !== undefined) data.description = description;
        if (icon !== undefined) data.icon = icon;
        if (sort_order !== undefined) data.sort_order = sort_order;
        if (is_active !== undefined) data.is_active = is_active;
        if (parent_id !== undefined) data.parent_id = parent_id;
        await Database.updateCategory(req.params.id, data);
        res.json({ success: true, message: 'دسته‌بندی با موفقیت ویرایش شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در ویرایش دسته‌بندی' });
    }
});

// حذف دسته‌بندی
app.delete('/api/category/:id', isAdmin, async (req, res) => {
    try {
        await Database.deleteCategory(req.params.id);
        res.json({ success: true, message: 'دسته‌بندی با موفقیت حذف شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در حذف دسته‌بندی' });
    }
});

// ------ محصولات ------

// دریافت محصولات یک فروشگاه
app.get('/api/shop/:shopId/products', async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit) : null;
        const offset = req.query.offset ? parseInt(req.query.offset) : 0;
        const products = await Database.getProductsByShop(req.params.shopId, limit, offset);
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت محصولات' });
    }
});

// دریافت محصولات یک دسته‌بندی
app.get('/api/category/:categoryId/products', async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit) : null;
        const offset = req.query.offset ? parseInt(req.query.offset) : 0;
        const products = await Database.getProductsByCategory(req.params.categoryId, limit, offset);
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت محصولات' });
    }
});
// ایجاد محصول - اصلاح شده
app.post('/api/product', isAdmin, upload.fields([
    { name: 'cover_image', maxCount: 1 },
    { name: 'images', maxCount: 10 },
    { name: 'video', maxCount: 1 }
]), async (req, res) => {
    try {
        console.log('📦 دریافت درخواست ایجاد محصول');
        console.log('Body:', req.body);
        console.log('Files:', req.files ? Object.keys(req.files) : 'no files');
        
        const { 
            shop_id, category_id, name, slug, description, 
            price, discount_price, stock, 
            features, specifications 
        } = req.body;
        
        // بررسی کامل داده‌ها
        if (!shop_id) {
            return res.status(400).json({ error: 'شناسه فروشگاه الزامی است' });
        }
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'نام محصول الزامی است' });
        }
        if (!slug || slug.trim() === '') {
            return res.status(400).json({ error: 'اسلاگ محصول الزامی است' });
        }
        if (!price || parseInt(price) < 0) {
            return res.status(400).json({ error: 'قیمت محصول الزامی است' });
        }
        
        // بررسی اسلاگ تکراری
        const existing = await Database.getProductBySlug(slug);
        if (existing) {
            return res.status(400).json({ error: 'این اسلاگ قبلاً استفاده شده است' });
        }
        
        // بررسی تصویر شاخص
        const coverImage = req.files?.cover_image ? '/shop-uploads/' + req.files.cover_image[0].filename : null;
        if (!coverImage) {
            return res.status(400).json({ error: 'تصویر شاخص الزامی است' });
        }
        
        // ویدیو (اختیاری)
        const videoUrl = req.files?.video ? '/shop-uploads/' + req.files.video[0].filename : null;
        
        // ایجاد محصول
        const productId = await Database.createProduct(
            parseInt(shop_id),
            category_id ? parseInt(category_id) : null,
            name.trim(),
            slug.trim(),
            description || '',
            parseInt(price),
            parseInt(discount_price) || 0,
            parseInt(stock) || 0,
            coverImage,
            videoUrl
        );
        
        // ذخیره ویژگی‌ها
        if (features) {
            let featuresArray;
            try {
                featuresArray = typeof features === 'string' ? JSON.parse(features) : features;
            } catch (e) {
                featuresArray = features;
            }
            if (featuresArray && featuresArray.length > 0) {
                for (const feature of featuresArray) {
                    if (feature && feature.trim()) {
                        await Database.addProductFeature(productId, feature.trim());
                    }
                }
            }
        }
        
        // ذخیره مشخصات فنی
        if (specifications) {
            let specArray;
            try {
                specArray = typeof specifications === 'string' ? JSON.parse(specifications) : specifications;
            } catch (e) {
                specArray = specifications;
            }
            if (specArray && specArray.length > 0) {
                for (const spec of specArray) {
                    if (spec.key && spec.key.trim() && spec.value && spec.value.trim()) {
                        await Database.addProductSpecification(productId, spec.key.trim(), spec.value.trim());
                    }
                }
            }
        }
        
        // ذخیره تصاویر اضافی
        if (req.files?.images) {
            for (let i = 0; i < req.files.images.length; i++) {
                const file = req.files.images[i];
                const imageUrl = '/shop-uploads/' + file.filename;
                await Database.addProductImage(productId, imageUrl, i);
            }
        }
        
        console.log('✅ محصول با موفقیت ایجاد شد، ID:', productId);
        res.json({ success: true, productId, message: 'محصول با موفقیت ایجاد شد' });
        
    } catch (err) {
        console.error('❌ خطا در ایجاد محصول:', err);
        res.status(500).json({ error: 'خطا در ایجاد محصول: ' + err.message });
    }
});

// دریافت آخرین محصولات
app.get('/api/products/latest', async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit) : 10;
        const products = await Database.getLatestProducts(limit);
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت محصولات' });
    }
});

// دریافت محصول توسط شناسه با جزئیات کامل
app.get('/api/product/:id', async (req, res) => {
    try {
        const product = await Database.getProductWithDetails(req.params.id);
        if (!product) return res.status(404).json({ error: 'محصول یافت نشد' });
        res.json(product);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت محصول' });
    }
});

// دریافت محصول توسط اسلاگ با جزئیات کامل
app.get('/api/product/slug/:slug', async (req, res) => {
    try {
        const product = await Database.getProductWithDetailsBySlug(req.params.slug);
        if (!product) return res.status(404).json({ error: 'محصول یافت نشد' });
        await Database.incrementProductViews(product.id);
        res.json(product);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت محصول' });
    }
});

// ایجاد محصول
app.post('/api/product', isAdmin, upload.fields([
    { name: 'cover_image', maxCount: 1 },
    { name: 'images', maxCount: 10 },
    { name: 'video', maxCount: 1 }
]), async (req, res) => {
    try {
        const { 
            shop_id, category_id, name, slug, description, 
            price, discount_price, stock, 
            features, specifications 
        } = req.body;
        
        if (!shop_id || !name || !slug || !price) {
            return res.status(400).json({ error: 'اطلاعات کامل نیست' });
        }
        
        const existing = await Database.getProductBySlug(slug);
        if (existing) {
            return res.status(400).json({ error: 'این اسلاگ قبلاً استفاده شده است' });
        }
        
        const coverImage = req.files?.cover_image ? '/shop-uploads/' + req.files.cover_image[0].filename : null;
        const videoUrl = req.files?.video ? '/shop-uploads/' + req.files.video[0].filename : null;
        
        if (!coverImage) {
            return res.status(400).json({ error: 'تصویر شاخص الزامی است' });
        }
        
        const productId = await Database.createProduct(
            shop_id,
            category_id || null,
            name,
            slug,
            description || '',
            parseInt(price),
            parseInt(discount_price) || 0,
            parseInt(stock) || 0,
            coverImage,
            videoUrl
        );
        
        // ذخیره ویژگی‌ها
        if (features) {
            const featuresArray = typeof features === 'string' ? JSON.parse(features) : features;
            if (featuresArray && featuresArray.length > 0) {
                for (const feature of featuresArray) {
                    if (feature.trim()) await Database.addProductFeature(productId, feature.trim());
                }
            }
        }
        
        // ذخیره مشخصات فنی
        if (specifications) {
            const specArray = typeof specifications === 'string' ? JSON.parse(specifications) : specifications;
            if (specArray && specArray.length > 0) {
                for (const spec of specArray) {
                    if (spec.key && spec.key.trim() && spec.value && spec.value.trim()) {
                        await Database.addProductSpecification(productId, spec.key.trim(), spec.value.trim());
                    }
                }
            }
        }
        
        // ذخیره تصاویر اضافی
        if (req.files?.images) {
            for (let i = 0; i < req.files.images.length; i++) {
                const file = req.files.images[i];
                const imageUrl = '/shop-uploads/' + file.filename;
                await Database.addProductImage(productId, imageUrl, i);
            }
        }
        
        res.json({ success: true, productId, message: 'محصول با موفقیت ایجاد شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در ایجاد محصول: ' + err.message });
    }
});

// ویرایش محصول
app.put('/api/product/:id', isAdmin, upload.fields([
    { name: 'cover_image', maxCount: 1 },
    { name: 'images', maxCount: 10 },
    { name: 'video', maxCount: 1 }
]), async (req, res) => {
    try {
        const productId = req.params.id;
        const { 
            category_id, name, slug, description, 
            price, discount_price, stock, is_active,
            features, specifications 
        } = req.body;
        
        const data = {};
        if (name) data.name = name;
        if (slug) {
            const existing = await Database.getProductBySlug(slug);
            if (existing && existing.id != productId) {
                return res.status(400).json({ error: 'این اسلاگ قبلاً استفاده شده است' });
            }
            data.slug = slug;
        }
        if (category_id !== undefined) data.category_id = category_id;
        if (description !== undefined) data.description = description;
        if (price) data.price = parseInt(price);
        if (discount_price !== undefined) data.discount_price = parseInt(discount_price);
        if (stock !== undefined) data.stock = parseInt(stock);
        if (is_active !== undefined) data.is_active = is_active === 'true' || is_active === true;
        if (req.files?.cover_image) data.cover_image = '/shop-uploads/' + req.files.cover_image[0].filename;
        if (req.files?.video) data.video_url = '/shop-uploads/' + req.files.video[0].filename;
        
        await Database.updateProduct(productId, data);
        
        // بروزرسانی ویژگی‌ها
        if (features !== undefined) {
            await Database.deleteProductFeatures(productId);
            const featuresArray = typeof features === 'string' ? JSON.parse(features) : features;
            if (featuresArray && featuresArray.length > 0) {
                for (const feature of featuresArray) {
                    if (feature.trim()) await Database.addProductFeature(productId, feature.trim());
                }
            }
        }
        
        // بروزرسانی مشخصات فنی
        if (specifications !== undefined) {
            await Database.deleteProductSpecifications(productId);
            const specArray = typeof specifications === 'string' ? JSON.parse(specifications) : specifications;
            if (specArray && specArray.length > 0) {
                for (const spec of specArray) {
                    if (spec.key && spec.key.trim() && spec.value && spec.value.trim()) {
                        await Database.addProductSpecification(productId, spec.key.trim(), spec.value.trim());
                    }
                }
            }
        }
        
        // بروزرسانی تصاویر
        if (req.files?.images) {
            await Database.deleteProductImages(productId);
            for (let i = 0; i < req.files.images.length; i++) {
                const file = req.files.images[i];
                const imageUrl = '/shop-uploads/' + file.filename;
                await Database.addProductImage(productId, imageUrl, i);
            }
        }
        
        res.json({ success: true, message: 'محصول با موفقیت ویرایش شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در ویرایش محصول: ' + err.message });
    }
});

// حذف محصول
app.delete('/api/product/:id', isAdmin, async (req, res) => {
    try {
        await Database.deleteProduct(req.params.id);
        res.json({ success: true, message: 'محصول با موفقیت حذف شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در حذف محصول' });
    }
});

// حذف تصویر محصول
app.delete('/api/product-image/:id', isAdmin, async (req, res) => {
    try {
        await Database.deleteProductImage(req.params.id);
        res.json({ success: true, message: 'تصویر با موفقیت حذف شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در حذف تصویر' });
    }
});

// ------ اسلایدها ------

// دریافت اسلایدهای فروشگاه
app.get('/api/shop/:shopId/slides', async (req, res) => {
    try {
        const slides = await Database.getShopSlides(req.params.shopId);
        res.json(slides);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت اسلایدها' });
    }
});

// ایجاد اسلاید
app.post('/api/slide', isAdmin, upload.single('image'), async (req, res) => {
    try {
        const { shop_id, title, subtitle, link, sort_order } = req.body;
        if (!shop_id) {
            return res.status(400).json({ error: 'شناسه فروشگاه الزامی است' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'تصویر الزامی است' });
        }
        const imageUrl = '/shop-uploads/' + req.file.filename;
        const slideId = await Database.addShopSlide(
            shop_id,
            imageUrl,
            title || null,
            subtitle || null,
            link || null,
            parseInt(sort_order) || 0
        );
        res.json({ success: true, slideId, message: 'اسلاید با موفقیت ایجاد شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در ایجاد اسلاید: ' + err.message });
    }
});

// حذف اسلاید
app.delete('/api/slide/:id', isAdmin, async (req, res) => {
    try {
        await Database.deleteShopSlide(req.params.id);
        res.json({ success: true, message: 'اسلاید با موفقیت حذف شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در حذف اسلاید' });
    }
});

// ------ تنظیمات فروشگاه ------

// دریافت تنظیمات فروشگاه
app.get('/api/shop/:shopId/settings', async (req, res) => {
    try {
        const settings = await Database.getShopSettings(req.params.shopId);
        res.json(settings || {});
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت تنظیمات' });
    }
});

// ذخیره تنظیمات فروشگاه
app.post('/api/shop/:shopId/settings', isAdmin, express.json(), async (req, res) => {
    try {
        const { primary_color, secondary_color, font_family, custom_css } = req.body;
        await Database.saveShopSettings(
            req.params.shopId,
            primary_color || '#4facfe',
            secondary_color || '#7c3aed',
            font_family || 'Segoe UI',
            custom_css || ''
        );
        res.json({ success: true, message: 'تنظیمات با موفقیت ذخیره شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در ذخیره تنظیمات' });
    }
});

// ============================================================
// API آمار
// ============================================================
app.get('/api/stats', async (req, res) => {
    try {
        const users = await Database.getUsers();
        const devices = await Database.getAllDevices();
        const trips = await Database.getAllTrips();
        let totalDistance = 0;
        trips.forEach(t => { totalDistance += t.totalDistance || 0; });
        res.json({ users: users.length, devices: devices.length, trips: trips.length, distance: Math.round(totalDistance) });
    } catch (err) {
        res.json({ users: 0, devices: 0, trips: 0, distance: 0 });
    }
});

// ============================================================
// WebSocket - مدیریت پورت سریال
// ============================================================
function setupSerialPort() {
    if (isSerialConnected && port && port.isOpen) return;
    try {
        if (port) {
            try {
                if (port.isOpen) port.close();
            } catch (e) {}
            port = null;
        }
        port = new SerialPort({
            path: '/dev/ttyUSB0',
            baudRate: 9600,
            autoOpen: true
        });
        parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
        port.on('open', () => {
            console.log('✅ پورت سریال باز شد');
            isSerialConnected = true;
        });
        port.on('error', (err) => {
            if (isSerialConnected) {
                console.log('❌ پورت سریال قطع شد');
                isSerialConnected = false;
            }
            try {
                if (port && port.isOpen) port.close();
            } catch (e) {}
        });
        port.on('close', () => {
            if (isSerialConnected) {
                console.log('🔌 پورت سریال بسته شد');
                isSerialConnected = false;
            }
        });
        parser.on('data', async (data) => {
            await processSerialData(data);
        });
    } catch (err) {
        if (!isSerialConnected) {
            console.log('⚠️ پورت سریال در دسترس نیست');
            isSerialConnected = false;
        }
    }
}

setInterval(() => {
    if (!isSerialConnected) setupSerialPort();
}, 10000);

async function updateDistanceAlert(deviceId, lat, lng) {
    try {
        const alert = await Database.getDistanceAlert(deviceId);
        if (!alert || alert.is_triggered === 1) return;
        if (alert.last_latitude !== null && alert.last_longitude !== null) {
            const dist = calculateDistance(alert.last_latitude, alert.last_longitude, lat, lng);
            const currentDistance = (alert.current_distance || 0) + dist;
            const isTriggered = currentDistance >= alert.target_distance;
            await Database.updateDistanceAlertProgress(deviceId, currentDistance, lat, lng, isTriggered);
            if (isTriggered) {
                io.emit(`distance_alert_${deviceId}`, { 
                    deviceId, 
                    targetDistance: alert.target_distance, 
                    currentDistance, 
                    message: alert.message, 
                    triggered: true 
                });
                try {
                    const device = await Database.getDeviceByDeviceId(deviceId);
                    if (device && device.owner_phone) {
                        const smsMessage = `🚨 هشدار مسافت - دستگاه ${deviceId}\n${alert.message}\nمسافت طی شده: ${currentDistance.toFixed(1)} کیلومتر`;
                        sendSms(device.owner_phone, smsMessage);
                    }
                } catch (err) {
                    console.error('❌ خطا در ارسال پیامک هشدار مسافت:', err);
                }
            }
        } else {
            await Database.updateDistanceAlertProgress(deviceId, 0, lat, lng, 0);
        }
    } catch (err) {
        console.error('خطا در هشدار مسافت:', err);
    }
}

async function processSerialData(data) {
    try {
        const trimmedData = data.trim();
        if (!trimmedData.startsWith('{')) return;
        const jsonData = JSON.parse(trimmedData);
        if (!jsonData.latitude || !jsonData.longitude) return;
        const deviceId = jsonData.device_id || jsonData.deviceId;
        if (!deviceId) return;
        const now = Date.now();
        if (lastProcessedTime[deviceId] && (now - lastProcessedTime[deviceId]) < 2000) {
            deviceLocations[deviceId] = jsonData;
            io.emit(`location_${deviceId}`, jsonData);
            return;
        }
        lastProcessedTime[deviceId] = now;
        deviceLastReceived[deviceId] = now;
        if (!deviceActivationSent[deviceId]) {
            try {
                const device = await Database.getDeviceByDeviceId(deviceId);
                if (device && device.owner_phone) {
                    const message = `✅ دستگاه GPS ${deviceId} فعال شد و در حال ارسال موقعیت است\nخریدار: ${device.buyer_name || ''} ${device.buyer_family || ''}\nموقعیت: ${jsonData.latitude.toFixed(6)}, ${jsonData.longitude.toFixed(6)}`;
                    sendSms(device.owner_phone, message);
                    deviceActivationSent[deviceId] = true;
                    console.log(`📱 پیام فعال‌سازی برای دستگاه ${deviceId} ارسال شد`);
                }
            } catch (err) {
                console.error('❌ خطا در ارسال پیام فعال‌سازی:', err);
            }
        }
        let currentTotalDist = deviceTotalDistance[deviceId] || 0;
        const lastLat = deviceLocations[deviceId]?.latitude;
        const lastLng = deviceLocations[deviceId]?.longitude;
        if (lastLat !== undefined && lastLng !== undefined) {
            const dist = calculateDistance(lastLat, lastLng, jsonData.latitude, jsonData.longitude);
            if (dist > 0.001) {
                currentTotalDist += dist;
                deviceTotalDistance[deviceId] = currentTotalDist;
                await Database.updateDeviceTotalDistance(deviceId, currentTotalDist);
            }
        }
        deviceLocations[deviceId] = jsonData;
        await Database.updateDeviceLocation(deviceId, jsonData.latitude, jsonData.longitude, jsonData.speed || 0, jsonData.satellites || 0);
        io.emit(`location_${deviceId}`, jsonData);
        console.log(`📍 موقعیت دستگاه ${deviceId}: ${jsonData.latitude.toFixed(6)}, ${jsonData.longitude.toFixed(6)} | سرعت: ${jsonData.speed || 0} km/h | مسافت کل: ${currentTotalDist.toFixed(1)} km`);
        const recorder = tripRecorders[deviceId];
        if (recorder && recorder.isRecording) {
            const location = { 
                lat: jsonData.latitude, 
                lng: jsonData.longitude, 
                timestamp: new Date().toISOString(), 
                speed: jsonData.speed || 0 
            };
            await Database.addTripLocation(recorder.tripId, location.lat, location.lng, location.speed);
            if (location.speed < 1) {
                if (!recorder.stopStart) {
                    recorder.stopStart = { lat: location.lat, lng: location.lng, startTime: location.timestamp };
                }
            } else {
                if (recorder.stopStart) {
                    const stopDuration = (new Date(location.timestamp) - new Date(recorder.stopStart.startTime)) / 1000;
                    if (stopDuration > 30) {
                        await Database.addTripStop(
                            recorder.tripId, 
                            recorder.stopStart.lat, 
                            recorder.stopStart.lng, 
                            recorder.stopStart.startTime, 
                            location.timestamp, 
                            Math.round(stopDuration)
                        );
                    }
                    recorder.stopStart = null;
                }
            }
        }
        await updateDistanceAlert(deviceId, jsonData.latitude, jsonData.longitude);
    } catch (e) {
        console.error('خطا در پردازش داده:', e);
    }
}

// ============================================================
// ایجاد فروشگاه اصلی در صورت عدم وجود
// ============================================================
(async function ensureMainShop() {
    try {
        const shop = await Database.getMainShop();
        if (!shop) {
            const shopId = await Database.createShop(
                'G-electronic',
                'g-electronic',
                'فروشگاه اصلی محصولات GPS و الکترونیک',
                '/shop-logos/g-electronic.png',
                null,
                true,
                1
            );
            console.log('✅ فروشگاه اصلی G-electronic با موفقیت ایجاد شد (ID: ' + shopId + ')');
        } else {
            console.log('✅ فروشگاه اصلی موجود است:', shop.name);
        }
    } catch (err) {
        console.error('❌ خطا در ایجاد فروشگاه اصلی:', err);
    }
})();

// ============================================================
// راه‌اندازی
// ============================================================
loadInitialData();

setTimeout(() => {
    setupSerialPort();
}, 2000);

http.listen(3000, () => {
    console.log('✅ سرور روی پورت 3000 روشن شد!');
    console.log('🌐 صفحات:');
    console.log('   - /                 ← صفحه اصلی (home.html)');
    console.log('   - /home.html        ← صفحه اصلی');
    console.log('   - /login.html       ← ورود کاربر');
    console.log('   - /admin-login.html ← ورود ادمین');
    console.log('   - /admin.html       ← پنل ادمین');
    console.log('   - /panel.html       ← پنل کاربری');
    console.log('   - /index.html       ← مشاهده نقشه');
    console.log('   - /trips.html       ← سفرهای ضبط شده');
    console.log('   - /shared-links.html← لینک‌های اشتراک');
    console.log('   - /distance-alert.html ← تنظیم هشدار مسافت');
    console.log('   - /shop.html        ← فروشگاه');
    console.log('   - /product/:slug    ← جزئیات محصول');
    console.log('   - /admin-shop.html  ← مدیریت فروشگاه');
    console.log('   - /share/:token     ← لینک موقت اشتراک');
    console.log('💾 دیتابیس: SQLite3 (data/gps_tracker.db)');
    console.log('📱 سرویس پیامک کاوه‌نگار فعال است');
    console.log('📍 هشدار خروج از محدوده: فعال');
    console.log('🚗 هشدار سرعت: فعال');
    console.log('📏 هشدار مسافت: فعال');
    console.log('🛒 فروشگاه: فعال');
    console.log('📡 پورت سریال: در حال انتظار برای اتصال...');
});