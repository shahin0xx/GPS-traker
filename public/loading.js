// ============================================================
// LOADING MANAGER - برای همه صفحات
// ============================================================

(function() {
    'use strict';

    // ============================================================
    // تنظیمات
    // ============================================================
    const CONFIG = {
        // مدت زمان حداقل نمایش لودینگ (میلی‌ثانیه)
        minLoadingTime: 800,
        
        // حداکثر زمان انتظار برای لود شدن صفحه (میلی‌ثانیه)
        maxLoadingTime: 5000,
        
        // صفحه لودینگ
        loadingPage: '/loading.html',
        
        // اگر true باشه، همیشه لودینگ رو نشون میده (برای تست)
        forceShow: false
    };

    // ============================================================
    // متغیرها
    // ============================================================
    let loadingStartTime = Date.now();
    let isLoaded = false;
    let loadingWindow = null;
    let timeoutId = null;

    // ============================================================
    // نمایش لودینگ
    // ============================================================
    function showLoading() {
        // اگر قبلاً لودینگ باز شده، نادیده بگیر
        if (loadingWindow) return;

        // باز کردن صفحه لودینگ به صورت popup
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        // باز کردن لودینگ در همان صفحه (بهتر)
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'gps-loading-overlay';
        loadingDiv.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: #0c0e1a;
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: opacity 0.5s ease;
        `;
        
        // استفاده از iframe برای نمایش صفحه لودینگ
        loadingDiv.innerHTML = `
            <iframe src="${CONFIG.loadingPage}" 
                    style="width:100%;height:100%;border:none;background:#0c0e1a;"
                    allowfullscreen>
            </iframe>
        `;
        
        document.body.appendChild(loadingDiv);
        loadingWindow = loadingDiv;
        
        // ذخیره زمان شروع
        loadingStartTime = Date.now();
        
        // حداکثر زمان
        timeoutId = setTimeout(() => {
            hideLoading();
        }, CONFIG.maxLoadingTime);
    }

    // ============================================================
    // مخفی کردن لودینگ
    // ============================================================
    function hideLoading() {
        if (!loadingWindow) return;
        
        const elapsed = Date.now() - loadingStartTime;
        const remaining = Math.max(0, CONFIG.minLoadingTime - elapsed);
        
        setTimeout(() => {
            if (loadingWindow) {
                loadingWindow.style.opacity = '0';
                setTimeout(() => {
                    if (loadingWindow && loadingWindow.parentNode) {
                        loadingWindow.parentNode.removeChild(loadingWindow);
                        loadingWindow = null;
                    }
                }, 500);
            }
        }, remaining);
    }

    // ============================================================
    // علامت‌گذاری لود شده
    // ============================================================
    function markAsLoaded() {
        isLoaded = true;
        hideLoading();
    }

    // ============================================================
    // تابع اصلی - برای استفاده در صفحات
    // ============================================================
    window.showPageLoading = function() {
        showLoading();
        return markAsLoaded;
    };

    // ============================================================
    // اتوماتیک - برای صفحاتی که می‌خواهند خودکار کار کنه
    // ============================================================
    window.autoLoading = function() {
        const markLoaded = showPageLoading();
        
        // وقتی صفحه کامل لود شد
        if (document.readyState === 'complete') {
            setTimeout(markLoaded, 300);
        } else {
            window.addEventListener('load', function() {
                setTimeout(markLoaded, 300);
            });
        }
        
        // اگر توی ۳ ثانیه لود نشد، بازم ببند
        setTimeout(markLoaded, 3000);
    };

    console.log('🔄 سیستم لودینگ آماده است');
})();