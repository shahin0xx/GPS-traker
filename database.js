// ============================================================
// DATABASE - gps_tracker.db
// ============================================================
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'gps_tracker.db');

if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'));
}

const db = new sqlite3.Database(DB_PATH);

// ============================================================
// ایجاد جداول
// ============================================================
db.serialize(() => {
    // ---- جداول اصلی ----
    db.run(`
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            full_name TEXT,
            is_super_admin INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            full_name TEXT,
            phone TEXT,
            email TEXT,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            is_active INTEGER DEFAULT 1,
            last_login DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS devices (
            device_id TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            user_id INTEGER,
            buyer_name TEXT,
            buyer_family TEXT,
            national_code TEXT,
            address TEXT,
            car_type TEXT,
            car_plate TEXT,
            owner_phone TEXT,
            total_distance REAL DEFAULT 0,
            last_latitude REAL,
            last_longitude REAL,
            last_speed REAL DEFAULT 0,
            last_satellites INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            is_first_login INTEGER DEFAULT 1,
            last_update DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS geofences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL UNIQUE,
            center_lat REAL NOT NULL,
            center_lng REAL NOT NULL,
            radius REAL NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (device_id) REFERENCES devices(device_id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS speed_limits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL UNIQUE,
            speed_limit REAL NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (device_id) REFERENCES devices(device_id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS distance_milestones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            target_distance REAL NOT NULL,
            message TEXT NOT NULL,
            is_triggered INTEGER DEFAULT 0,
            triggered_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (device_id) REFERENCES devices(device_id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            session_token TEXT UNIQUE NOT NULL,
            last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS trips (
            trip_id TEXT PRIMARY KEY,
            device_id TEXT NOT NULL,
            start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            end_time DATETIME,
            total_distance REAL DEFAULT 0,
            max_speed REAL DEFAULT 0,
            avg_speed REAL DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            FOREIGN KEY (device_id) REFERENCES devices(device_id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS trip_locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            speed REAL DEFAULT 0,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (trip_id) REFERENCES trips(trip_id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS trip_stops (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_id TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            start_time DATETIME NOT NULL,
            end_time DATETIME NOT NULL,
            duration INTEGER DEFAULT 0,
            FOREIGN KEY (trip_id) REFERENCES trips(trip_id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS share_links (
            token TEXT PRIMARY KEY,
            device_id TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            views INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (device_id) REFERENCES devices(device_id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS distance_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL UNIQUE,
            target_distance REAL NOT NULL,
            current_distance REAL DEFAULT 0,
            last_latitude REAL,
            last_longitude REAL,
            message TEXT NOT NULL,
            is_triggered INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (device_id) REFERENCES devices(device_id)
        )
    `);

    // ============================================================
    // جداول فروشگاه
    // ============================================================

    db.run(`
        CREATE TABLE IF NOT EXISTS shops (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            description TEXT,
            logo TEXT,
            cover_image TEXT,
            is_main INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES admins(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shop_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            slug TEXT NOT NULL,
            description TEXT,
            icon TEXT,
            parent_id INTEGER,
            sort_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (shop_id) REFERENCES shops(id),
            FOREIGN KEY (parent_id) REFERENCES categories(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shop_id INTEGER NOT NULL,
            category_id INTEGER,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            description TEXT,
            price INTEGER NOT NULL,
            discount_price INTEGER DEFAULT 0,
            stock INTEGER DEFAULT 0,
            cover_image TEXT NOT NULL,
            video_url TEXT,
            is_active INTEGER DEFAULT 1,
            views INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (shop_id) REFERENCES shops(id),
            FOREIGN KEY (category_id) REFERENCES categories(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS product_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            image_url TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS product_features (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            feature TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS product_specifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            spec_key TEXT NOT NULL,
            spec_value TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS shop_slides (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            shop_id INTEGER NOT NULL,
            image_url TEXT NOT NULL,
            title TEXT,
            subtitle TEXT,
            link TEXT,
            sort_order INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (shop_id) REFERENCES shops(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS shop_settings (
            shop_id INTEGER PRIMARY KEY,
            primary_color TEXT DEFAULT '#4facfe',
            secondary_color TEXT DEFAULT '#7c3aed',
            font_family TEXT DEFAULT 'Segoe UI',
            custom_css TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (shop_id) REFERENCES shops(id)
        )
    `);

    // ---- ایجاد کاربر ادمین پیش‌فرض ----
    db.get('SELECT * FROM admins WHERE username = ?', ['admin'], (err, row) => {
        if (err) return;
        if (!row) {
            db.run(
                'INSERT INTO admins (username, password, full_name, is_super_admin) VALUES (?, ?, ?, ?)',
                ['admin', '123456', 'مدیر سیستم', 1]
            );
            console.log('👤 ادمین پیش‌فرض ایجاد شد: admin / 123456');
        }
    });

    // ---- ایجاد فروشگاه اصلی ----
    db.get('SELECT * FROM shops WHERE is_main = 1', (err, row) => {
        if (err) return;
        if (!row) {
            db.run(
                `INSERT INTO shops (name, slug, description, logo, is_main, is_active, created_by) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['G-electronic', 'g-electronic', 'فروشگاه اصلی محصولات GPS و الکترونیک', '/shop-logos/g-electronic.png', 1, 1, 1]
            );
            console.log('🏪 فروشگاه اصلی G-electronic ایجاد شد');
        }
    });
});

// ============================================================
// کلاس Database
// ============================================================
class Database {
    // ====== ادمین ======
    static getAdminByUsername(username) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM admins WHERE username = ?', [username], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static getAllAdmins() {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM admins ORDER BY created_at DESC', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static createAdmin(username, password, fullName, isSuperAdmin = false) {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO admins (username, password, full_name, is_super_admin) VALUES (?, ?, ?, ?)',
                [username, password, fullName, isSuperAdmin ? 1 : 0],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static updateAdmin(oldUsername, data) {
        return new Promise((resolve, reject) => {
            const fields = [];
            const values = [];
            if (data.username) { fields.push('username = ?'); values.push(data.username); }
            if (data.password) { fields.push('password = ?'); values.push(data.password); }
            if (data.full_name) { fields.push('full_name = ?'); values.push(data.full_name); }
            if (data.is_super_admin !== undefined) { fields.push('is_super_admin = ?'); values.push(data.is_super_admin ? 1 : 0); }
            if (fields.length === 0) return resolve();
            values.push(oldUsername);
            db.run(
                `UPDATE admins SET ${fields.join(', ')} WHERE username = ?`,
                values,
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    static deleteAdmin(username) {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM admins WHERE username = ?', [username], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    // ====== کاربران ======
    static getUserByUsername(username) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static getUserById(id) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static getUsers() {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM users ORDER BY created_at DESC', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static createUser(username, fullName, phone, email, password, role = 'user') {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO users (username, full_name, phone, email, password, role) VALUES (?, ?, ?, ?, ?, ?)',
                [username, fullName, phone, email, password, role],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static updateUser(id, data) {
        return new Promise((resolve, reject) => {
            const fields = [];
            const values = [];
            if (data.full_name !== undefined) { fields.push('full_name = ?'); values.push(data.full_name); }
            if (data.phone !== undefined) { fields.push('phone = ?'); values.push(data.phone); }
            if (data.email !== undefined) { fields.push('email = ?'); values.push(data.email); }
            if (data.password !== undefined) { fields.push('password = ?'); values.push(data.password); }
            if (data.is_active !== undefined) { fields.push('is_active = ?'); values.push(data.is_active); }
            if (data.role !== undefined) { fields.push('role = ?'); values.push(data.role); }
            if (fields.length === 0) return resolve();
            values.push(id);
            db.run(
                `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
                values,
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    static updateUserLastLogin(id) {
        return new Promise((resolve, reject) => {
            db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [id], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    static deleteUser(id) {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    // ====== جلسات کاربر ======
    static createUserSession(userId, sessionToken) {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO user_sessions (user_id, session_token) VALUES (?, ?)',
                [userId, sessionToken],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static getUserSession(sessionToken) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM user_sessions WHERE session_token = ?', [sessionToken], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static updateUserSessionActivity(sessionToken) {
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE user_sessions SET last_activity = CURRENT_TIMESTAMP WHERE session_token = ?',
                [sessionToken],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    static deleteUserSession(sessionToken) {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM user_sessions WHERE session_token = ?', [sessionToken], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    // ====== دستگاه‌ها ======
    static getDeviceByDeviceId(deviceId) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM devices WHERE device_id = ?', [deviceId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static getAllDevices() {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT d.*, u.username as user_username 
                FROM devices d
                LEFT JOIN users u ON d.user_id = u.id
                ORDER BY d.created_at DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static getDevicesByUserId(userId) {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM devices WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static getDevicesWithoutUser() {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM devices WHERE user_id IS NULL ORDER BY created_at DESC', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static createDevice(deviceId, password, userId, data) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO devices (
                    device_id, password, user_id, buyer_name, buyer_family, 
                    national_code, address, car_type, car_plate, owner_phone,
                    total_distance
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    deviceId, password, userId || null,
                    data.buyerName || null,
                    data.buyerFamily || null,
                    data.nationalCode || null,
                    data.address || null,
                    data.carType || null,
                    data.carPlate || null,
                    data.ownerPhone || null,
                    0
                ],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static updateDevice(deviceId, data) {
        return new Promise((resolve, reject) => {
            const fields = [];
            const values = [];
            if (data.password !== undefined) { fields.push('password = ?'); values.push(data.password); }
            if (data.user_id !== undefined) { fields.push('user_id = ?'); values.push(data.user_id); }
            if (data.buyer_name !== undefined) { fields.push('buyer_name = ?'); values.push(data.buyer_name); }
            if (data.buyer_family !== undefined) { fields.push('buyer_family = ?'); values.push(data.buyer_family); }
            if (data.national_code !== undefined) { fields.push('national_code = ?'); values.push(data.national_code); }
            if (data.address !== undefined) { fields.push('address = ?'); values.push(data.address); }
            if (data.car_type !== undefined) { fields.push('car_type = ?'); values.push(data.car_type); }
            if (data.car_plate !== undefined) { fields.push('car_plate = ?'); values.push(data.car_plate); }
            if (data.owner_phone !== undefined) { fields.push('owner_phone = ?'); values.push(data.owner_phone); }
            if (data.total_distance !== undefined) { fields.push('total_distance = ?'); values.push(data.total_distance); }
            if (data.is_active !== undefined) { fields.push('is_active = ?'); values.push(data.is_active); }
            if (data.is_first_login !== undefined) { fields.push('is_first_login = ?'); values.push(data.is_first_login); }
            if (fields.length === 0) return resolve();
            values.push(deviceId);
            db.run(
                `UPDATE devices SET ${fields.join(', ')} WHERE device_id = ?`,
                values,
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    static updateDeviceLocation(deviceId, lat, lng, speed, satellites) {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE devices SET 
                    last_latitude = ?, last_longitude = ?, last_speed = ?, 
                    last_satellites = ?, last_update = CURRENT_TIMESTAMP 
                WHERE device_id = ?`,
                [lat, lng, speed || 0, satellites || 0, deviceId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    static updateDeviceTotalDistance(deviceId, totalDistance) {
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE devices SET total_distance = ? WHERE device_id = ?',
                [totalDistance, deviceId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    static assignDeviceToUser(deviceId, userId) {
        return new Promise((resolve, reject) => {
            db.run('UPDATE devices SET user_id = ? WHERE device_id = ?', [userId, deviceId], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    static deleteDevice(deviceId) {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM devices WHERE device_id = ?', [deviceId], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    // ====== محدوده جغرافیایی ======
    static saveGeofence(deviceId, centerLat, centerLng, radius) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT OR REPLACE INTO geofences (device_id, center_lat, center_lng, radius) 
                 VALUES (?, ?, ?, ?)`,
                [deviceId, centerLat, centerLng, radius],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static getGeofence(deviceId) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM geofences WHERE device_id = ?', [deviceId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static deleteGeofence(deviceId) {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM geofences WHERE device_id = ?', [deviceId], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    // ====== سرعت مجاز ======
    static saveSpeedLimit(deviceId, speedLimit) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT OR REPLACE INTO speed_limits (device_id, speed_limit) 
                 VALUES (?, ?)`,
                [deviceId, speedLimit],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static getSpeedLimit(deviceId) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM speed_limits WHERE device_id = ?', [deviceId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static deleteSpeedLimit(deviceId) {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM speed_limits WHERE device_id = ?', [deviceId], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    // ====== هشدارهای مسافت ======
    static saveDistanceMilestone(deviceId, targetDistance, message) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT OR REPLACE INTO distance_milestones (device_id, target_distance, message, is_triggered) 
                 VALUES (?, ?, ?, 0)`,
                [deviceId, targetDistance, message],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static getDistanceMilestone(deviceId) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM distance_milestones WHERE device_id = ?', [deviceId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static updateDistanceMilestoneTriggered(deviceId) {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE distance_milestones SET is_triggered = 1, triggered_at = CURRENT_TIMESTAMP 
                 WHERE device_id = ?`,
                [deviceId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    static deleteDistanceMilestone(deviceId) {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM distance_milestones WHERE device_id = ?', [deviceId], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    // ====== سفرها ======
    static createTrip(tripId, deviceId) {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO trips (trip_id, device_id) VALUES (?, ?)',
                [tripId, deviceId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static getActiveTrip(deviceId) {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM trips WHERE device_id = ? AND is_active = 1 ORDER BY start_time DESC LIMIT 1',
                [deviceId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    static getTrip(tripId) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM trips WHERE trip_id = ?', [tripId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static getTripsByDevice(deviceId) {
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM trips WHERE device_id = ? ORDER BY start_time DESC',
                [deviceId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    static getAllTrips() {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM trips ORDER BY start_time DESC', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static addTripLocation(tripId, lat, lng, speed) {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO trip_locations (trip_id, latitude, longitude, speed) VALUES (?, ?, ?, ?)',
                [tripId, lat, lng, speed || 0],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static getTripLocations(tripId) {
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM trip_locations WHERE trip_id = ? ORDER BY timestamp ASC',
                [tripId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    static addTripStop(tripId, lat, lng, startTime, endTime, duration) {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO trip_stops (trip_id, lat, lng, start_time, end_time, duration) VALUES (?, ?, ?, ?, ?, ?)',
                [tripId, lat, lng, startTime, endTime, duration],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static getTripStops(tripId) {
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM trip_stops WHERE trip_id = ? ORDER BY start_time ASC',
                [tripId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    static updateTripStats(tripId, distance, maxSpeed, avgSpeed) {
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE trips SET total_distance = ?, max_speed = ?, avg_speed = ? WHERE trip_id = ?',
                [distance, maxSpeed, avgSpeed, tripId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    static stopTrip(tripId) {
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE trips SET end_time = CURRENT_TIMESTAMP, is_active = 0 WHERE trip_id = ?',
                [tripId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    static deleteTrip(tripId) {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM trip_locations WHERE trip_id = ?', [tripId], () => {
                db.run('DELETE FROM trip_stops WHERE trip_id = ?', [tripId], () => {
                    db.run('DELETE FROM trips WHERE trip_id = ?', [tripId], function(err) {
                        if (err) reject(err);
                        else resolve(this.changes);
                    });
                });
            });
        });
    }

    // ====== لینک‌های اشتراک ======
    static createShareLink(token, deviceId, expiresAt) {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO share_links (token, device_id, expires_at) VALUES (?, ?, ?)',
                [token, deviceId, expiresAt],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static getShareLink(token) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM share_links WHERE token = ?', [token], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static getShareLinksByDevice(deviceId) {
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM share_links WHERE device_id = ? ORDER BY created_at DESC',
                [deviceId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    static updateShareLinkViews(token) {
        return new Promise((resolve, reject) => {
            db.run('UPDATE share_links SET views = views + 1 WHERE token = ?', [token], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    static deactivateShareLink(token) {
        return new Promise((resolve, reject) => {
            db.run('UPDATE share_links SET is_active = 0 WHERE token = ?', [token], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    // ====== هشدار مسافت (موقت) ======
    static createDistanceAlert(deviceId, targetDistance, message) {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO distance_alerts (device_id, target_distance, message) VALUES (?, ?, ?)',
                [deviceId, targetDistance, message],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static getDistanceAlert(deviceId) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM distance_alerts WHERE device_id = ?', [deviceId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static updateDistanceAlertProgress(deviceId, currentDistance, lat, lng, isTriggered) {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE distance_alerts SET 
                    current_distance = ?, last_latitude = ?, last_longitude = ?, is_triggered = ? 
                WHERE device_id = ?`,
                [currentDistance, lat, lng, isTriggered ? 1 : 0, deviceId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    static deleteDistanceAlert(deviceId) {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM distance_alerts WHERE device_id = ?', [deviceId], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    // ============================================================
    // ====== متدهای فروشگاه ======
    // ============================================================

    // --- فروشگاه‌ها ---
    static createShop(name, slug, description, logo, coverImage, isMain, createdBy) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO shops (name, slug, description, logo, cover_image, is_main, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [name, slug, description, logo, coverImage, isMain ? 1 : 0, createdBy],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static getShopById(id) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM shops WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static getShopBySlug(slug) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM shops WHERE slug = ?', [slug], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static getMainShop() {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM shops WHERE is_main = 1 AND is_active = 1', (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static getAllShops(includeInactive = false) {
        return new Promise((resolve, reject) => {
            const sql = includeInactive 
                ? 'SELECT * FROM shops ORDER BY is_main DESC, created_at DESC'
                : 'SELECT * FROM shops WHERE is_active = 1 ORDER BY is_main DESC, created_at DESC';
            db.all(sql, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static updateShop(id, data) {
        return new Promise((resolve, reject) => {
            const fields = [];
            const values = [];
            if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
            if (data.slug !== undefined) { fields.push('slug = ?'); values.push(data.slug); }
            if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
            if (data.logo !== undefined) { fields.push('logo = ?'); values.push(data.logo); }
            if (data.cover_image !== undefined) { fields.push('cover_image = ?'); values.push(data.cover_image); }
            if (data.is_active !== undefined) { fields.push('is_active = ?'); values.push(data.is_active); }
            if (data.is_main !== undefined) { fields.push('is_main = ?'); values.push(data.is_main); }
            if (fields.length === 0) return resolve();
            values.push(id);
            db.run(
                `UPDATE shops SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                values,
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    static deleteShop(id) {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM shops WHERE id = ?', [id], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    // --- دسته‌بندی ---
    static createCategory(shopId, name, slug, description, icon, parentId = null) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO categories (shop_id, name, slug, description, icon, parent_id)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [shopId, name, slug, description, icon, parentId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static getCategoriesByShop(shopId) {
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM categories WHERE shop_id = ? AND is_active = 1 ORDER BY sort_order ASC, name ASC',
                [shopId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    static getCategoryById(id) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM categories WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static updateCategory(id, data) {
        return new Promise((resolve, reject) => {
            const fields = [];
            const values = [];
            if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
            if (data.slug !== undefined) { fields.push('slug = ?'); values.push(data.slug); }
            if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
            if (data.icon !== undefined) { fields.push('icon = ?'); values.push(data.icon); }
            if (data.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(data.sort_order); }
            if (data.is_active !== undefined) { fields.push('is_active = ?'); values.push(data.is_active); }
            if (data.parent_id !== undefined) { fields.push('parent_id = ?'); values.push(data.parent_id); }
            if (fields.length === 0) return resolve();
            values.push(id);
            db.run(
                `UPDATE categories SET ${fields.join(', ')} WHERE id = ?`,
                values,
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    static deleteCategory(id) {
        return new Promise((resolve, reject) => {
            db.run('UPDATE categories SET is_active = 0 WHERE id = ?', [id], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    // --- محصولات ---
    static createProduct(shopId, categoryId, name, slug, description, price, discountPrice, stock, coverImage, videoUrl) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO products 
                 (shop_id, category_id, name, slug, description, price, discount_price, stock, cover_image, video_url)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [shopId, categoryId, name, slug, description, price, discountPrice || 0, stock || 0, coverImage, videoUrl || null],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static getProductById(id) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT p.*, c.name as category_name, s.name as shop_name, s.slug as shop_slug
                 FROM products p
                 LEFT JOIN categories c ON p.category_id = c.id
                 LEFT JOIN shops s ON p.shop_id = s.id
                 WHERE p.id = ? AND p.is_active = 1`,
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    static getProductBySlug(slug) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT p.*, c.name as category_name, s.name as shop_name, s.slug as shop_slug
                 FROM products p
                 LEFT JOIN categories c ON p.category_id = c.id
                 LEFT JOIN shops s ON p.shop_id = s.id
                 WHERE p.slug = ? AND p.is_active = 1`,
                [slug],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    static getProductsByShop(shopId, limit = null, offset = 0) {
        return new Promise((resolve, reject) => {
            let sql = `SELECT p.*, c.name as category_name 
                        FROM products p
                        LEFT JOIN categories c ON p.category_id = c.id
                        WHERE p.shop_id = ? AND p.is_active = 1
                        ORDER BY p.created_at DESC`;
            const params = [shopId];
            if (limit) {
                sql += ' LIMIT ? OFFSET ?';
                params.push(limit, offset);
            }
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static getProductsByCategory(categoryId, limit = null, offset = 0) {
        return new Promise((resolve, reject) => {
            let sql = `SELECT p.*, c.name as category_name 
                        FROM products p
                        LEFT JOIN categories c ON p.category_id = c.id
                        WHERE p.category_id = ? AND p.is_active = 1
                        ORDER BY p.created_at DESC`;
            const params = [categoryId];
            if (limit) {
                sql += ' LIMIT ? OFFSET ?';
                params.push(limit, offset);
            }
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static getLatestProducts(limit = 10) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT p.*, c.name as category_name, s.name as shop_name, s.slug as shop_slug
                 FROM products p
                 LEFT JOIN categories c ON p.category_id = c.id
                 LEFT JOIN shops s ON p.shop_id = s.id
                 WHERE p.is_active = 1 AND s.is_active = 1
                 ORDER BY p.created_at DESC
                 LIMIT ?`,
                [limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    static updateProduct(id, data) {
        return new Promise((resolve, reject) => {
            const fields = [];
            const values = [];
            if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
            if (data.slug !== undefined) { fields.push('slug = ?'); values.push(data.slug); }
            if (data.category_id !== undefined) { fields.push('category_id = ?'); values.push(data.category_id); }
            if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
            if (data.price !== undefined) { fields.push('price = ?'); values.push(data.price); }
            if (data.discount_price !== undefined) { fields.push('discount_price = ?'); values.push(data.discount_price); }
            if (data.stock !== undefined) { fields.push('stock = ?'); values.push(data.stock); }
            if (data.cover_image !== undefined) { fields.push('cover_image = ?'); values.push(data.cover_image); }
            if (data.video_url !== undefined) { fields.push('video_url = ?'); values.push(data.video_url); }
            if (data.is_active !== undefined) { fields.push('is_active = ?'); values.push(data.is_active); }
            if (fields.length === 0) return resolve();
            values.push(id);
            db.run(
                `UPDATE products SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                values,
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    static deleteProduct(id) {
        return new Promise((resolve, reject) => {
            db.run('UPDATE products SET is_active = 0 WHERE id = ?', [id], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    static incrementProductViews(id) {
        return new Promise((resolve, reject) => {
            db.run('UPDATE products SET views = views + 1 WHERE id = ?', [id], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    static getProductWithDetails(id) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT p.*, c.name as category_name, s.name as shop_name, s.slug as shop_slug
                 FROM products p
                 LEFT JOIN categories c ON p.category_id = c.id
                 LEFT JOIN shops s ON p.shop_id = s.id
                 WHERE p.id = ? AND p.is_active = 1`,
                [id],
                async (err, row) => {
                    if (err) reject(err);
                    if (!row) resolve(null);
                    try {
                        const features = await Database.getProductFeatures(id);
                        const specs = await Database.getProductSpecifications(id);
                        const images = await Database.getProductImages(id);
                        row.features = features;
                        row.specifications = specs;
                        row.images = images;
                        resolve(row);
                    } catch (e) {
                        reject(e);
                    }
                }
            );
        });
    }

    static getProductWithDetailsBySlug(slug) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT p.*, c.name as category_name, s.name as shop_name, s.slug as shop_slug
                 FROM products p
                 LEFT JOIN categories c ON p.category_id = c.id
                 LEFT JOIN shops s ON p.shop_id = s.id
                 WHERE p.slug = ? AND p.is_active = 1`,
                [slug],
                async (err, row) => {
                    if (err) reject(err);
                    if (!row) resolve(null);
                    try {
                        const features = await Database.getProductFeatures(row.id);
                        const specs = await Database.getProductSpecifications(row.id);
                        const images = await Database.getProductImages(row.id);
                        row.features = features;
                        row.specifications = specs;
                        row.images = images;
                        resolve(row);
                    } catch (e) {
                        reject(e);
                    }
                }
            );
        });
    }

    // --- تصاویر محصول ---
    static addProductImage(productId, imageUrl, sortOrder = 0) {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)',
                [productId, imageUrl, sortOrder],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static getProductImages(productId) {
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, created_at ASC',
                [productId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    static deleteProductImage(imageId) {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM product_images WHERE id = ?', [imageId], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    static deleteProductImages(productId) {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM product_images WHERE product_id = ?', [productId], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    // --- ویژگی‌های محصول ---
    static addProductFeature(productId, feature) {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO product_features (product_id, feature) VALUES (?, ?)',
                [productId, feature],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static getProductFeatures(productId) {
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM product_features WHERE product_id = ? ORDER BY id ASC',
                [productId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows.map(r => r.feature));
                }
            );
        });
    }

    static deleteProductFeatures(productId) {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM product_features WHERE product_id = ?', [productId], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    // --- مشخصات فنی محصول ---
    static addProductSpecification(productId, key, value) {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO product_specifications (product_id, spec_key, spec_value) VALUES (?, ?, ?)',
                [productId, key, value],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static getProductSpecifications(productId) {
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM product_specifications WHERE product_id = ? ORDER BY id ASC',
                [productId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    static deleteProductSpecifications(productId) {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM product_specifications WHERE product_id = ?', [productId], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    // --- اسلایدهای فروشگاه ---
    static addShopSlide(shopId, imageUrl, title, subtitle, link, sortOrder = 0) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO shop_slides (shop_id, image_url, title, subtitle, link, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [shopId, imageUrl, title || null, subtitle || null, link || null, sortOrder],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static getShopSlides(shopId) {
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT * FROM shop_slides WHERE shop_id = ? AND is_active = 1 ORDER BY sort_order ASC, created_at ASC',
                [shopId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    static deleteShopSlide(id) {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM shop_slides WHERE id = ?', [id], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    // --- تنظیمات فروشگاه ---
    static saveShopSettings(shopId, primaryColor, secondaryColor, fontFamily, customCss) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT OR REPLACE INTO shop_settings (shop_id, primary_color, secondary_color, font_family, custom_css)
                 VALUES (?, ?, ?, ?, ?)`,
                [shopId, primaryColor, secondaryColor, fontFamily, customCss],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static getShopSettings(shopId) {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM shop_settings WHERE shop_id = ?',
                [shopId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }
}

module.exports = { Database };