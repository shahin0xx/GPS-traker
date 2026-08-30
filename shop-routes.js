// shop-routes.js
// مسیرهای API فروشگاه - کاملاً مجزا از سرور اصلی

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Database } = require('./database');

// ============================================================
// تنظیمات آپلود
// ============================================================
const uploadDir = path.join(__dirname, 'public', 'shop-uploads');

// اطمینان از وجود پوشه آپلود
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
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: fileFilter
});

// ============================================================
// میدلور ادمین
// ============================================================
function isAdmin(req, res, next) {
    if (req.session && req.session.isAdmin) {
        return next();
    }
    res.status(401).json({ error: 'لطفاً وارد شوید' });
}

function isSuperAdmin(req, res, next) {
    if (req.session && req.session.isAdmin && req.session.isSuperAdmin) {
        return next();
    }
    res.status(403).json({ error: 'دسترسی محدود به سوپر ادمین' });
}

// ============================================================
// ====== API های فروشگاه ======
// ============================================================

// ------ فروشگاه‌ها ------

// دریافت تمام فروشگاه‌ها
router.get('/shops', async (req, res) => {
    try {
        const shops = await Database.getAllShops(false);
        res.json(shops);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت فروشگاه‌ها' });
    }
});

// دریافت فروشگاه توسط شناسه
router.get('/shop/:id', async (req, res) => {
    try {
        const shop = await Database.getShopById(req.params.id);
        if (!shop) return res.status(404).json({ error: 'فروشگاه یافت نشد' });
        res.json(shop);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت فروشگاه' });
    }
});

// دریافت فروشگاه توسط اسلاگ
router.get('/shop/slug/:slug', async (req, res) => {
    try {
        const shop = await Database.getShopBySlug(req.params.slug);
        if (!shop) return res.status(404).json({ error: 'فروشگاه یافت نشد' });
        res.json(shop);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت فروشگاه' });
    }
});

// ایجاد فروشگاه (فقط سوپر ادمین)
router.post('/shop', isSuperAdmin, upload.fields([
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
            req.session.userId || 1
        );
        
        res.json({ success: true, shopId, message: 'فروشگاه با موفقیت ایجاد شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در ایجاد فروشگاه' });
    }
});

// ویرایش فروشگاه
router.put('/shop/:id', isSuperAdmin, upload.fields([
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
router.delete('/shop/:id', isSuperAdmin, async (req, res) => {
    try {
        await Database.deleteShop(req.params.id);
        res.json({ success: true, message: 'فروشگاه با موفقیت حذف شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در حذف فروشگاه' });
    }
});

// ------ دسته‌بندی‌ها ------

// دریافت دسته‌بندی‌های یک فروشگاه
router.get('/shop/:shopId/categories', async (req, res) => {
    try {
        const categories = await Database.getCategoriesByShop(req.params.shopId);
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت دسته‌بندی‌ها' });
    }
});

// ایجاد دسته‌بندی
router.post('/category', isAdmin, express.json(), async (req, res) => {
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
router.put('/category/:id', isAdmin, express.json(), async (req, res) => {
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
router.delete('/category/:id', isAdmin, async (req, res) => {
    try {
        await Database.deleteCategory(req.params.id);
        res.json({ success: true, message: 'دسته‌بندی با موفقیت حذف شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در حذف دسته‌بندی' });
    }
});

// ------ محصولات ------

// دریافت محصولات یک فروشگاه
router.get('/shop/:shopId/products', async (req, res) => {
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
router.get('/category/:categoryId/products', async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit) : null;
        const offset = req.query.offset ? parseInt(req.query.offset) : 0;
        const products = await Database.getProductsByCategory(req.params.categoryId, limit, offset);
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت محصولات' });
    }
});

// دریافت آخرین محصولات
router.get('/products/latest', async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit) : 10;
        const products = await Database.getLatestProducts(limit);
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت محصولات' });
    }
});

// دریافت محصول توسط شناسه
router.get('/product/:id', async (req, res) => {
    try {
        const product = await Database.getProductById(req.params.id);
        if (!product) return res.status(404).json({ error: 'محصول یافت نشد' });
        
        const images = await Database.getProductImages(req.params.id);
        product.images = images;
        
        res.json(product);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت محصول' });
    }
});

// دریافت محصول توسط اسلاگ
router.get('/product/slug/:slug', async (req, res) => {
    try {
        const product = await Database.getProductBySlug(req.params.slug);
        if (!product) return res.status(404).json({ error: 'محصول یافت نشد' });
        
        const images = await Database.getProductImages(product.id);
        product.images = images;
        
        await Database.incrementProductViews(product.id);
        
        res.json(product);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت محصول' });
    }
});

// ایجاد محصول
router.post('/product', isAdmin, upload.fields([
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
        
        // ذخیره ویژگی‌ها (اگر وجود داشته باشد)
        if (features) {
            const featuresArray = typeof features === 'string' ? JSON.parse(features) : features;
            if (featuresArray && featuresArray.length > 0) {
                for (const feature of featuresArray) {
                    await Database.addProductFeature(productId, feature);
                }
            }
        }
        
        // ذخیره مشخصات فنی (اگر وجود داشته باشد)
        if (specifications) {
            const specArray = typeof specifications === 'string' ? JSON.parse(specifications) : specifications;
            if (specArray && specArray.length > 0) {
                for (const spec of specArray) {
                    await Database.addProductSpecification(productId, spec.key, spec.value);
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
router.put('/product/:id', isAdmin, upload.fields([
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
        if (features) {
            await Database.deleteProductFeatures(productId);
            const featuresArray = typeof features === 'string' ? JSON.parse(features) : features;
            if (featuresArray && featuresArray.length > 0) {
                for (const feature of featuresArray) {
                    await Database.addProductFeature(productId, feature);
                }
            }
        }
        
        // بروزرسانی مشخصات فنی
        if (specifications) {
            await Database.deleteProductSpecifications(productId);
            const specArray = typeof specifications === 'string' ? JSON.parse(specifications) : specifications;
            if (specArray && specArray.length > 0) {
                for (const spec of specArray) {
                    await Database.addProductSpecification(productId, spec.key, spec.value);
                }
            }
        }
        
        // بروزرسانی تصاویر (حذف تصاویر قبلی و اضافه کردن جدید)
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
router.delete('/product/:id', isAdmin, async (req, res) => {
    try {
        await Database.deleteProduct(req.params.id);
        res.json({ success: true, message: 'محصول با موفقیت حذف شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در حذف محصول' });
    }
});

// حذف تصویر محصول
router.delete('/product-image/:id', isAdmin, async (req, res) => {
    try {
        await Database.deleteProductImage(req.params.id);
        res.json({ success: true, message: 'تصویر با موفقیت حذف شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در حذف تصویر' });
    }
});

// ------ اسلایدها ------

// دریافت اسلایدهای فروشگاه
router.get('/shop/:shopId/slides', async (req, res) => {
    try {
        const slides = await Database.getShopSlides(req.params.shopId);
        res.json(slides);
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت اسلایدها' });
    }
});

// ایجاد اسلاید
router.post('/slide', isAdmin, upload.single('image'), async (req, res) => {
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
router.delete('/slide/:id', isAdmin, async (req, res) => {
    try {
        await Database.deleteShopSlide(req.params.id);
        res.json({ success: true, message: 'اسلاید با موفقیت حذف شد' });
    } catch (err) {
        res.status(500).json({ error: 'خطا در حذف اسلاید' });
    }
});

// ------ تنظیمات فروشگاه ------

// دریافت تنظیمات فروشگاه
router.get('/shop/:shopId/settings', async (req, res) => {
    try {
        const settings = await Database.getShopSettings(req.params.shopId);
        res.json(settings || {});
    } catch (err) {
        res.status(500).json({ error: 'خطا در دریافت تنظیمات' });
    }
});

// ذخیره تنظیمات فروشگاه
router.post('/shop/:shopId/settings', isAdmin, express.json(), async (req, res) => {
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

module.exports = router;