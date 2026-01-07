const { app, BrowserWindow, ipcMain, dialog, Menu, net } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

// 激活码验证模块
const license = require('./main/license');

let mainWindow;
let activationWindow;

// 获取应用根目录（项目目录）
function getAppRootPath() {
    // 开发环境下使用当前工作目录，打包后使用 app 路径
    if (app.isPackaged) {
        return path.dirname(app.getPath('exe'));
    }
    return process.cwd();
}

function ensureDirExists(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    } catch (e) {
        // ignore
    }
}

function initAppDataPaths() {
    const root = getAppRootPath();
    const dataRoot = path.join(root, 'data');
    ensureDirExists(dataRoot);

    // Electron 默认会把 userData/cache 等放到 C 盘 AppData，这里强制重定向到安装目录
    const userDataDir = path.join(dataRoot, 'userData');
    const sessionDataDir = path.join(dataRoot, 'sessionData');
    const cacheDir = path.join(dataRoot, 'cache');
    const logsDir = path.join(dataRoot, 'logs');
    const tempDir = path.join(dataRoot, 'temp');

    [userDataDir, sessionDataDir, cacheDir, logsDir, tempDir].forEach(ensureDirExists);

    app.setPath('userData', userDataDir);
    app.setPath('sessionData', sessionDataDir);
    app.setPath('cache', cacheDir);
    app.setPath('logs', logsDir);
    app.setPath('temp', tempDir);

    // 让 license/配置等统一落在安装目录 data 下
    license.setDataPath(userDataDir);
}

function createMutex() {
    let locked = false;
    const waiters = [];

    return {
        async lock() {
            if (!locked) {
                locked = true;
                return;
            }
            await new Promise(resolve => waiters.push(resolve));
            locked = true;
        },
        unlock() {
            locked = false;
            const next = waiters.shift();
            if (next) next();
        },
        async runExclusive(fn) {
            await this.lock();
            try {
                return await fn();
            } finally {
                this.unlock();
            }
        }
    };
}

const licenseVerifyMutex = createMutex();
let lastVerifyOkAt = 0;
let lastVerifyInfo = null;

async function verifyLicenseOnlineCached(maxAgeMs = 60 * 1000) {
    const now = Date.now();
    if (lastVerifyInfo && (now - lastVerifyOkAt) <= maxAgeMs) {
        return { success: true, data: lastVerifyInfo };
    }

    return licenseVerifyMutex.runExclusive(async () => {
        const now2 = Date.now();
        if (lastVerifyInfo && (now2 - lastVerifyOkAt) <= maxAgeMs) {
            return { success: true, data: lastVerifyInfo };
        }

        const result = await license.verify();
        if (result.success) {
            lastVerifyOkAt = Date.now();
            lastVerifyInfo = license.getLicenseInfo();
            return { success: true, data: lastVerifyInfo };
        }
        lastVerifyOkAt = 0;
        lastVerifyInfo = null;
        return {
            success: false,
            code: result.code || 'LICENSE_REQUIRED',
            message: result.message || '未激活或授权已失效'
        };
    });
}

function withLicenseGuard(handler) {
    return async (event, ...args) => {
        const check = await verifyLicenseOnlineCached();
        if (!check.success) {
            return {
                success: false,
                code: check.code || 'LICENSE_REQUIRED',
                message: check.message || '未激活或授权已失效'
            };
        }
        return handler(event, ...args);
    };
}

function withSVIPGuard(handler) {
    return withLicenseGuard(async (event, ...args) => {
        const info = license.getLicenseInfo && license.getLicenseInfo();
        if (!info || info.member_level !== 'SVIP') {
            return {
                success: false,
                code: 'SVIP_REQUIRED',
                message: '该功能需要SVIP权限'
            };
        }
        return handler(event, ...args);
    });
}

function createWindow() {
    // 移除菜单栏
    Menu.setApplicationMenu(null);
    
    // 获取屏幕尺寸，窗口占70%
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    
    const windowWidth = Math.floor(width * 0.7);
    const windowHeight = Math.floor(height * 0.8);

    mainWindow = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        minWidth: 1000,
        minHeight: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        titleBarStyle: 'default',
        show: false,
        autoHideMenuBar: true
    });

    mainWindow.loadFile('index.html');
    
    // 窗口准备好后显示
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // 开发时打开调试工具
    // mainWindow.webContents.openDevTools();
}

// 创建激活窗口
function createActivationWindow() {
    Menu.setApplicationMenu(null);
    
    activationWindow = new BrowserWindow({
        width: 520,
        height: 700,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        titleBarStyle: 'default',
        show: false,
        autoHideMenuBar: true
    });

    activationWindow.loadFile('activation.html');
    
    activationWindow.once('ready-to-show', () => {
        activationWindow.show();
    });
    
    activationWindow.on('closed', () => {
        activationWindow = null;
        // 如果激活窗口关闭且主窗口未创建，则退出应用
        if (!mainWindow) {
            app.quit();
        }
    });
}

// 应用启动流程
app.whenReady().then(async () => {
    // 初始化路径：确保所有缓存/数据都写入安装目录下的 data
    initAppDataPaths();
    
    // 检查激活状态 - 必须连接服务器验证
    const verifyResult = await license.verify();
    
    if (verifyResult.success) {
        // 已激活，启动心跳检测并显示主窗口
        license.startHeartbeat((result) => {
            // 激活过期或被禁用时的处理
            if (mainWindow && !mainWindow.isDestroyed()) {
                dialog.showMessageBox(mainWindow, {
                    type: 'warning',
                    title: '授权提醒',
                    message: result.message || '您的授权已失效，请重新激活',
                    buttons: ['确定']
                }).then(() => {
                    license.stopHeartbeat();
                    mainWindow.close();
                    createActivationWindow();
                });
            }
        });
        createWindow();
    } else if (verifyResult.code === 'NETWORK_ERROR') {
        // 无法连接鉴权服务器
        const choice = await dialog.showMessageBox({
            type: 'error',
            title: '连接失败',
            message: '无法连接鉴权服务器',
            detail: '请检查网络连接或联系管理员确认服务器是否正常运行。',
            buttons: ['重试', '退出']
        });
        
        if (choice.response === 0) {
            // 重试
            app.relaunch();
            app.exit(0);
        } else {
            app.quit();
        }
    } else {
        // 未激活或验证失败，显示激活窗口
        createActivationWindow();
    }
});

app.on('window-all-closed', () => {
    license.stopHeartbeat();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// 关闭应用
ipcMain.handle('quit-app', () => {
    app.quit();
});

// IPC handlers for file operations
ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    return result.filePaths[0] || null;
});

ipcMain.handle('select-file', async (event, filters) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: filters
    });
    return result.filePaths[0] || null;
});

ipcMain.handle('select-save-path', async (event, options) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: options.title || '保存文件',
        defaultPath: options.defaultPath,
        filters: options.filters || [{ name: 'All Files', extensions: ['*'] }]
    });
    return result.filePath || null;
});

let xhsLoginWindow = null;
let xhsLoginSessionCounter = 0;

ipcMain.handle('open-xhs-login', withLicenseGuard(async () => {
    if (xhsLoginWindow && !xhsLoginWindow.isDestroyed()) {
        xhsLoginWindow.focus();
        return { success: true, message: '窗口已打开' };
    }

    xhsLoginSessionCounter++;
    const partition = `memory-xhs-login-${Date.now()}-${xhsLoginSessionCounter}`;
    const { session } = require('electron');
    const xhsSession = session.fromPartition(partition, { cache: false });

    xhsSession.clearStorageData();
    xhsSession.clearCache();

    xhsLoginWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            partition: partition
        },
        parent: mainWindow,
        title: '小红书登录'
    });

    let cookiesCaptured = false;
    let pollTimer = null;
    let pollTimeout = null;

    const buildCookieHeaderFromSession = async () => {
        const all = await xhsSession.cookies.get({ domain: '.xiaohongshu.com' });
        return all
            .filter(c => c && c.name)
            .map(c => `${c.name}=${c.value || ''}`)
            .join('; ');
    };

    const captureAndClose = async () => {
        if (cookiesCaptured) return;
        cookiesCaptured = true;

        try {
            const cookies = await buildCookieHeaderFromSession();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('xhs-login-cookies-captured', cookies);
            }
        } catch (e) {
            // ignore
        }

        try {
            if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
            if (pollTimeout) {
                clearTimeout(pollTimeout);
                pollTimeout = null;
            }
        } catch (e) {
            // ignore
        }

        setTimeout(() => {
            if (xhsLoginWindow && !xhsLoginWindow.isDestroyed()) {
                xhsLoginWindow.close();
                xhsLoginWindow = null;
            }
        }, 300);
    };

    const checkLoginByFetch = async () => {
        if (cookiesCaptured) return;
        if (!xhsLoginWindow || xhsLoginWindow.isDestroyed()) return;

        try {
            const json = await xhsLoginWindow.webContents.executeJavaScript(`
                (async () => {
                    try {
                        const res = await fetch('https://edith.xiaohongshu.com/api/sns/web/v2/user/me', {
                            credentials: 'include'
                        });
                        return await res.json();
                    } catch (e) {
                        return null;
                    }
                })();
            `, true);

            const ok = json && json.success === true && json.code === 0 && json.data && json.data.red_id;
            if (ok) {
                await captureAndClose();
            }
        } catch (e) {
            // ignore
        }
    };

    pollTimer = setInterval(checkLoginByFetch, 1200);
    pollTimeout = setTimeout(() => {
        try {
            if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
        } catch (e) {
            // ignore
        }
    }, 2 * 60 * 1000);

    xhsLoginWindow.on('closed', () => {
        try {
            if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
            if (pollTimeout) {
                clearTimeout(pollTimeout);
                pollTimeout = null;
            }
        } catch (e) {
            // ignore
        }
        xhsSession.clearStorageData();
        xhsSession.clearCache();
        xhsLoginWindow = null;
    });

    xhsLoginWindow.loadURL('https://www.xiaohongshu.com/login');
    return { success: true, message: '登录窗口已打开，请在浏览器中登录' };
}));

// 解析短链接：通过隐藏窗口跟随重定向，拿到最终长链接
ipcMain.handle('resolve-shortlink', withLicenseGuard(async (event, shortUrl, xhsCookies) => {
    return new Promise(async (resolve) => {
        if (!shortUrl || typeof shortUrl !== 'string') {
            resolve({ success: false, message: '短链接不能为空' });
            return;
        }

        linkConvertSessionCounter++;
        const partition = `memory-link-convert-${Date.now()}-${linkConvertSessionCounter}`;
        const { session } = require('electron');
        const s = session.fromPartition(partition, { cache: false });

        let win = null;
        let finalUrl = '';
        let settled = false;
        let retryCount = 0;
        const maxRetry = 2;

        const isLoginRedirect = (url) => {
            if (!url || typeof url !== 'string') return false;
            return url.startsWith('https://www.xiaohongshu.com/login') && url.includes('redirectPath=');
        };

        const finish = (payload) => {
            if (settled) return;
            settled = true;
            try {
                if (win && !win.isDestroyed()) {
                    win.close();
                }
            } catch (e) {
                // ignore
            }
            try {
                s.clearStorageData();
                s.clearCache();
            } catch (e) {
                // ignore
            }
            resolve(payload);
        };

        let timeout = null;

        const injectXhsCookies = async () => {
            if (!xhsCookies || typeof xhsCookies !== 'string') return;
            const pairs = xhsCookies.split(';').map(c => c.trim()).filter(c => c);
            for (const pair of pairs) {
                const [name, ...valueParts] = pair.split('=');
                const value = valueParts.join('=');
                if (name && value) {
                    try {
                        await s.cookies.set({
                            url: 'https://www.xiaohongshu.com',
                            name: name.trim(),
                            value: value.trim(),
                            domain: '.xiaohongshu.com'
                        });
                        await s.cookies.set({
                            url: 'https://edith.xiaohongshu.com',
                            name: name.trim(),
                            value: value.trim(),
                            domain: '.xiaohongshu.com'
                        });
                    } catch (e) {
                        // ignore
                    }
                }
            }
        };

        const attachHandlers = (targetWin) => {
            const markUrl = (url) => {
                if (url && typeof url === 'string') {
                    finalUrl = url;
                }
            };

            targetWin.webContents.on('will-redirect', (e, url) => {
                markUrl(url);
            });
            targetWin.webContents.on('did-redirect-navigation', (e, url) => {
                markUrl(url);
            });
            targetWin.webContents.on('did-navigate', (e, url) => {
                markUrl(url);
            });
            targetWin.webContents.on('did-navigate-in-page', (e, url) => {
                markUrl(url);
            });

            targetWin.webContents.on('did-finish-load', async () => {
                const current = finalUrl || (targetWin && !targetWin.isDestroyed() ? targetWin.webContents.getURL() : '');
                if (isLoginRedirect(current) && retryCount < maxRetry) {
                    retryCount++;
                    try {
                        if (timeout) clearTimeout(timeout);
                        const oldWin = win;
                        win = new BrowserWindow({
                            width: 900,
                            height: 700,
                            show: false,
                            webPreferences: {
                                nodeIntegration: false,
                                contextIsolation: true,
                                partition: partition
                            }
                        });
                        attachHandlers(win);
                        timeout = setTimeout(() => {
                            const last = finalUrl || (win && !win.isDestroyed() ? win.webContents.getURL() : '');
                            finish({ success: false, message: '解析超时', finalUrl: last });
                        }, 15000);

                        try {
                            if (oldWin && !oldWin.isDestroyed()) oldWin.close();
                        } catch (e) {
                            // ignore
                        }

                        await injectXhsCookies();
                        await win.loadURL(shortUrl.trim());
                        return;
                    } catch (e) {
                        // fall through
                    }
                }

                if (timeout) clearTimeout(timeout);
                finish({ success: true, finalUrl: current });
            });

            targetWin.webContents.on('did-fail-load', (e, errorCode, errorDescription, validatedURL) => {
                if (timeout) clearTimeout(timeout);
                const url = finalUrl || validatedURL || (targetWin && !targetWin.isDestroyed() ? targetWin.webContents.getURL() : '');
                finish({ success: false, message: errorDescription || '加载失败', errorCode, finalUrl: url });
            });

            targetWin.on('closed', () => {
                if (timeout) clearTimeout(timeout);
                if (!settled) {
                    finish({ success: false, message: '窗口已关闭', finalUrl: finalUrl });
                }
            });
        };

        try {
            win = new BrowserWindow({
                width: 900,
                height: 700,
                show: false,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    partition: partition
                }
            });

            attachHandlers(win);
            timeout = setTimeout(() => {
                const last = finalUrl || (win && !win.isDestroyed() ? win.webContents.getURL() : '');
                finish({ success: false, message: '解析超时', finalUrl: last });
            }, 15000);

            await injectXhsCookies();
            await win.loadURL(shortUrl.trim());
        } catch (e) {
            finish({ success: false, message: e.message || '解析失败' });
        }
    });
}));

ipcMain.handle('read-file', async (event, filePath) => {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return { success: true, content };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, content, 'utf-8');
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('file-exists', async (event, filePath) => {
    return fs.existsSync(filePath);
});

ipcMain.handle('get-user-data-path', () => {
    return app.getPath('userData');
});

ipcMain.handle('get-documents-path', () => {
    return app.getPath('documents');
});

// 获取应用根目录（项目目录）
ipcMain.handle('get-app-path', () => {
    return getAppRootPath();
});

// ==================== 采集 API ====================
const bloggerApi = require('./main/api');
const performanceApi = require('./main/performanceApi');

// 采集博主信息
ipcMain.handle('collect-blogger-info', withLicenseGuard(async (event, userId, cookies) => {
    return await bloggerApi.getBloggerInfo(userId, cookies);
}));

// 采集数据概览
ipcMain.handle('collect-data-summary', withLicenseGuard(async (event, userId, cookies) => {
    return await bloggerApi.getDataSummary(userId, cookies);
}));

// 采集数据表现
ipcMain.handle('collect-performance-data', withLicenseGuard(async (event, userId, selectedFields, cookies) => {
    return await performanceApi.getPerformanceData(userId, selectedFields, cookies);
}));

// 采集粉丝指标
ipcMain.handle('collect-fans-summary', withLicenseGuard(async (event, userId, cookies) => {
    return await bloggerApi.getFansSummary(userId, cookies);
}));

// 采集粉丝画像
ipcMain.handle('collect-fans-profile', withLicenseGuard(async (event, userId, cookies) => {
    return await bloggerApi.getFansProfile(userId, cookies);
}));

// HTTP 请求处理 - 用于验证账号
ipcMain.handle('check-account', withLicenseGuard(async (event, cookies) => {
    return new Promise((resolve) => {
        const options = {
            hostname: 'pgy.xiaohongshu.com',
            port: 443,
            path: '/api/solar/user/info',
            method: 'GET',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'zh-CN,zh;q=0.9',
                'referer': 'https://pgy.xiaohongshu.com/solar/pre-trade/home',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
                'Cookie': cookies,
                'Host': 'pgy.xiaohongshu.com',
                'Connection': 'keep-alive'
            },
            timeout: 10000
        };

        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    
                    if (jsonData.success && jsonData.code === 0) {
                        let nickName = '';
                        const roleInfoList = jsonData.data?.roleInfoList || [];
                        if (roleInfoList.length > 0) {
                            nickName = roleInfoList[0].nickName || '';
                        }
                        
                        resolve({
                            success: true,
                            message: '账号有效',
                            nickName: nickName,
                            data: jsonData.data
                        });
                    } else {
                        resolve({
                            success: false,
                            message: jsonData.msg || '账号验证失败'
                        });
                    }
                } catch (e) {
                    resolve({
                        success: false,
                        message: `解析响应失败: ${e.message}`
                    });
                }
            });
        });

        req.on('error', (e) => {
            resolve({
                success: false,
                message: `请求失败: ${e.message}`
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({
                success: false,
                message: '请求超时'
            });
        });

        req.end();
    });
}));

// ==================== 达人列表功能 ====================

let bloggerWindow = null;
let capturedRequest = null;
let bloggerSessionCounter = 0;

// ==================== 链接转换功能 ====================
let linkConvertSessionCounter = 0;

// ==================== 达人邀约功能 ====================

let inviteWindow = null;
let capturedInviteRequest = null;
let inviteSessionCounter = 0;

// 打开博主广场浏览器窗口
ipcMain.handle('open-blogger-browser', withLicenseGuard(async (event, cookies) => {
    if (bloggerWindow && !bloggerWindow.isDestroyed()) {
        bloggerWindow.focus();
        return { success: true, message: '窗口已打开' };
    }
    
    // 每次创建全新的内存会话，不保存缓存
    bloggerSessionCounter++;
    const partition = `memory-blogger-${Date.now()}-${bloggerSessionCounter}`;
    const { session } = require('electron');
    const bloggerSession = session.fromPartition(partition, { cache: false });
    
    bloggerWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            partition: partition
        },
        parent: mainWindow,
        title: '博主广场 - 蒲公英平台'
    });
    
    // 设置 cookies
    const sessionObj = bloggerSession;
    const cookiePairs = cookies.split(';').map(c => c.trim()).filter(c => c);
    
    for (const pair of cookiePairs) {
        const [name, ...valueParts] = pair.split('=');
        const value = valueParts.join('=');
        if (name && value) {
            try {
                await sessionObj.cookies.set({
                    url: 'https://pgy.xiaohongshu.com',
                    name: name.trim(),
                    value: value.trim(),
                    domain: '.xiaohongshu.com'
                });
            } catch (e) {
                console.log('设置cookie失败:', name, e.message);
            }
        }
    }
    
    // 监听网络请求
    capturedRequest = null;
    
    // onBeforeRequest 先执行，捕获请求体
    bloggerSession.webRequest.onBeforeRequest(
        { urls: ['https://pgy.xiaohongshu.com/api/solar/cooperator/blogger/v2*'] },
        (details, callback) => {
            if (details.method === 'POST' && details.uploadData) {
                try {
                    const rawData = details.uploadData[0].bytes;
                    const bodyStr = rawData.toString('utf8');
                    // 初始化 capturedRequest 并设置 body
                    capturedRequest = {
                        url: details.url,
                        body: JSON.parse(bodyStr)
                    };
                } catch (e) {
                    console.log('解析请求体失败:', e.message);
                }
            }
            callback({});
        }
    );
    
    // onBeforeSendHeaders 后执行，捕获请求头并通知
    bloggerSession.webRequest.onBeforeSendHeaders(
        { urls: ['https://pgy.xiaohongshu.com/api/solar/cooperator/blogger/v2*'] },
        (details, callback) => {
            if (details.method === 'POST' && capturedRequest) {
                capturedRequest.headers = details.requestHeaders;
                // 通知渲染进程
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('blogger-request-captured', true);
                }
            }
            callback({ requestHeaders: details.requestHeaders });
        }
    );
    
    // 加载博主广场页面
    bloggerWindow.loadURL('https://pgy.xiaohongshu.com/solar/pre-trade/note/kol');
    
    bloggerWindow.on('closed', () => {
        bloggerSession.clearStorageData();
        bloggerSession.clearCache();
        bloggerWindow = null;
    });
    
    return { success: true, message: '浏览器窗口已打开' };
}));

// 打开邀约浏览器窗口（博主主页），并捕获首次邀约请求
ipcMain.handle('open-invite-browser', withSVIPGuard(async (event, url, cookies) => {
    // 每次创建全新的内存会话，不保存缓存
    inviteSessionCounter++;
    const partition = `memory-invite-${Date.now()}-${inviteSessionCounter}`;
    const { session } = require('electron');
    const inviteSession = session.fromPartition(partition, { cache: false });

    inviteWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            partition: partition
        },
        parent: mainWindow,
        title: '达人邀约'
    });

    // 关键：处理页面内 window.open 弹窗，确保新窗口复用同一个 partition/session
    // 否则邀约请求发生在新窗口里时，webRequest 可能无法捕获。
    inviteWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
        return {
            action: 'allow',
            overrideBrowserWindowOptions: {
                width: 1100,
                height: 800,
                parent: inviteWindow,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    partition: partition
                }
            }
        };
    });

    // 设置 cookies
    const cookiePairs = (cookies || '').split(';').map(c => c.trim()).filter(c => c);
    for (const pair of cookiePairs) {
        const [name, ...valueParts] = pair.split('=');
        const value = valueParts.join('=');
        if (name && value) {
            try {
                await inviteSession.cookies.set({
                    url: 'https://pgy.xiaohongshu.com',
                    name: name.trim(),
                    value: value.trim(),
                    domain: '.xiaohongshu.com'
                });
            } catch (e) {
                console.log('设置cookie失败:', name, e.message);
            }
        }
    }

    capturedInviteRequest = null;

    // 捕获请求体
    inviteSession.webRequest.onBeforeRequest(
        { urls: ['https://pgy.xiaohongshu.com/api/solar/invite/initiate_invite*'] },
        (details, callback) => {
            if (details.method === 'POST' && details.uploadData) {
                try {
                    const rawData = details.uploadData[0].bytes;
                    const bodyStr = rawData.toString('utf8');
                    capturedInviteRequest = {
                        url: details.url,
                        body: JSON.parse(bodyStr)
                    };
                } catch (e) {
                    console.log('解析邀约请求体失败:', e.message);
                }
            }
            callback({});
        }
    );

    // 捕获请求头并通知渲染进程
    inviteSession.webRequest.onBeforeSendHeaders(
        { urls: ['https://pgy.xiaohongshu.com/api/solar/invite/initiate_invite*'] },
        (details, callback) => {
            if (details.method === 'POST' && capturedInviteRequest) {
                capturedInviteRequest.headers = details.requestHeaders;
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('invite-request-captured', true);
                }
            }
            callback({ requestHeaders: details.requestHeaders });
        }
    );

    inviteWindow.on('closed', () => {
        inviteSession.clearStorageData();
        inviteSession.clearCache();
        inviteWindow = null;
    });

    inviteWindow.loadURL(url);
    return { success: true, message: '邀约窗口已打开' };
}));

ipcMain.handle('get-captured-invite-request', withSVIPGuard(async () => {
    return capturedInviteRequest;
}));

ipcMain.handle('send-invite-request', withSVIPGuard(async (event, inviteReq) => {
    return new Promise((resolve) => {
        try {
            if (!inviteReq || !inviteReq.url || !inviteReq.body || !inviteReq.headers) {
                resolve({ success: false, message: '缺少邀约请求参数' });
                return;
            }

            const bodyStr = JSON.stringify(inviteReq.body);
            const headers = { ...inviteReq.headers };

            delete headers['content-length'];
            delete headers['Content-Length'];
            delete headers['accept-encoding'];
            delete headers['Accept-Encoding'];
            delete headers['host'];
            delete headers['Host'];

            const options = {
                hostname: 'pgy.xiaohongshu.com',
                path: '/api/solar/invite/initiate_invite',
                method: 'POST',
                headers: {
                    ...headers,
                    'Host': 'pgy.xiaohongshu.com',
                    'Content-Type': headers['Content-Type'] || headers['content-type'] || 'application/json;charset=UTF-8',
                    'Content-Length': Buffer.byteLength(bodyStr)
                },
                timeout: 15000
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const jsonData = JSON.parse(data);
                        
                        // 检查是否是频次限制错误 (code: 300013)
                        if (jsonData?.code === 300013) {
                            resolve({
                                success: false,
                                message: jsonData?.msg || '访问频次异常，请勿频繁操作或重启试试',
                                data: jsonData
                            });
                            return;
                        }
                        
                        const inviteSucceed = jsonData?.data?.inviteSucceed === true;
                        if (jsonData?.success === true && jsonData?.code === 0 && inviteSucceed) {
                            resolve({ success: true, data: jsonData });
                        } else {
                            resolve({
                                success: false,
                                message: jsonData?.msg || jsonData?.data?.hint || '邀约失败',
                                data: jsonData
                            });
                        }
                    } catch (e) {
                        resolve({ success: false, message: `解析响应失败: ${e.message}`, raw: data });
                    }
                });
            });

            req.on('error', (e) => resolve({ success: false, message: `请求失败: ${e.message}` }));
            req.on('timeout', () => {
                req.destroy();
                resolve({ success: false, message: '请求超时' });
            });

            req.write(bodyStr);
            req.end();
        } catch (e) {
            resolve({ success: false, message: `请求异常: ${e.message}` });
        }
    });
}));

// 使用捕获的请求参数获取达人列表
ipcMain.handle('fetch-blogger-list', async (event, pageNum, capturedReq) => {
    return new Promise((resolve) => {
        try {
            const body = { ...capturedReq.body, pageNum: pageNum };
            const bodyStr = JSON.stringify(body);
            
            const headers = { ...capturedReq.headers };
            
            // 移除可能导致问题的头
            delete headers['content-length'];
            delete headers['Content-Length'];
            // 移除压缩相关头，避免返回压缩数据
            delete headers['accept-encoding'];
            delete headers['Accept-Encoding'];
            
            const options = {
                hostname: 'pgy.xiaohongshu.com',
                path: '/api/solar/cooperator/blogger/v2',
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Length': Buffer.byteLength(bodyStr)
                },
                timeout: 15000
            };
            
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const jsonData = JSON.parse(data);
                        if (jsonData.success && jsonData.code === 0) {
                            resolve({
                                success: true,
                                data: jsonData.data?.kols || [],
                                total: jsonData.data?.total || 0
                            });
                        } else {
                            resolve({
                                success: false,
                                message: jsonData.msg || '获取失败'
                            });
                        }
                    } catch (e) {
                        resolve({
                            success: false,
                            message: `解析响应失败: ${e.message}`
                        });
                    }
                });
            });
            
            req.on('error', (e) => {
                resolve({
                    success: false,
                    message: `请求失败: ${e.message}`
                });
            });
            
            req.on('timeout', () => {
                req.destroy();
                resolve({
                    success: false,
                    message: '请求超时'
                });
            });
            
            req.write(bodyStr);
            req.end();
        } catch (e) {
            resolve({
                success: false,
                message: `请求异常: ${e.message}`
            });
        }
    });
});

// 获取捕获的请求
ipcMain.handle('get-captured-request', () => {
    return capturedRequest;
});

// 关闭博主广场窗口
ipcMain.handle('close-blogger-browser', () => {
    if (bloggerWindow && !bloggerWindow.isDestroyed()) {
        bloggerWindow.close();
        bloggerWindow = null;
    }
    capturedRequest = null;
    return { success: true };
});

// ==================== 直接登录功能 ====================

let loginWindow = null;
let loginSessionCounter = 0;

// 直接登录 - 打开浏览器并监听Cookies
ipcMain.handle('open-direct-login', withLicenseGuard(async () => {
    // 如果已有登录窗口，先关闭
    if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.close();
        loginWindow = null;
    }
    
    // 每次创建一个全新的内存会话，不保存任何缓存
    loginSessionCounter++;
    const partition = `memory-login-${Date.now()}-${loginSessionCounter}`;
    const { session } = require('electron');
    const loginSession = session.fromPartition(partition, { cache: false });
    
    // 确保不缓存任何数据
    loginSession.clearStorageData();
    loginSession.clearCache();
    
    loginWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            partition: partition  // 使用独立的内存分区
        },
        parent: mainWindow,
        title: '蒲公英平台 - 登录获取Cookies'
    });
    
    let cookiesCaptured = false;
    let pendingCookies = null;
    
    // 验证Cookies是否有效的函数
    const verifyCookies = (cookies) => {
        return new Promise((resolve) => {
            const options = {
                hostname: 'pgy.xiaohongshu.com',
                port: 443,
                path: '/api/solar/user/info',
                method: 'GET',
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'accept-language': 'zh-CN,zh;q=0.9',
                    'referer': 'https://pgy.xiaohongshu.com/solar/pre-trade/home',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
                    'Cookie': cookies,
                    'Host': 'pgy.xiaohongshu.com',
                    'Connection': 'keep-alive'
                },
                timeout: 10000
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const jsonData = JSON.parse(data);
                        // 只有code为0才是有效的登录
                        resolve(jsonData.success && jsonData.code === 0);
                    } catch (e) {
                        resolve(false);
                    }
                });
            });

            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
            req.end();
        });
    };
    
    // 监听目标请求，捕获Cookie头
    loginSession.webRequest.onBeforeSendHeaders(
        { urls: ['https://pgy.xiaohongshu.com/api/solar/user/info*'] },
        (details, callback) => {
            if (!cookiesCaptured && details.requestHeaders) {
                const cookieHeader = details.requestHeaders['Cookie'] || details.requestHeaders['cookie'];
                if (cookieHeader) {
                    // 先保存cookies，等待验证
                    pendingCookies = cookieHeader;
                }
            }
            callback({ requestHeaders: details.requestHeaders });
        }
    );
    
    // 监听响应完成，验证响应是否有效
    loginSession.webRequest.onCompleted(
        { urls: ['https://pgy.xiaohongshu.com/api/solar/user/info*'] },
        async (details) => {
            if (!cookiesCaptured && pendingCookies && details.statusCode === 200) {
                // 验证cookies是否有效
                const isValid = await verifyCookies(pendingCookies);
                
                if (isValid) {
                    cookiesCaptured = true;
                    // 发送捕获到的Cookies到渲染进程
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('login-cookies-captured', pendingCookies);
                    }
                    // 关闭登录窗口
                    setTimeout(() => {
                        if (loginWindow && !loginWindow.isDestroyed()) {
                            loginWindow.close();
                            loginWindow = null;
                        }
                    }, 500);
                } else {
                    // 响应无效(如code=-100)，重置等待下次请求
                    pendingCookies = null;
                }
            }
        }
    );
    
    // 窗口关闭时清理会话数据
    loginWindow.on('closed', () => {
        loginSession.clearStorageData();
        loginSession.clearCache();
        loginWindow = null;
    });
    
    // 加载蒲公英首页
    loginWindow.loadURL('https://pgy.xiaohongshu.com/');
    
    return { success: true, message: '登录窗口已打开，请在浏览器中登录' };
}));

// 关闭登录窗口
ipcMain.handle('close-login-window', () => {
    if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.close();
        loginWindow = null;
    }
    return { success: true };
});

// 打开博主详情页
let detailSessionCounter = 0;
ipcMain.handle('open-blogger-detail', withLicenseGuard(async (event, url, cookies) => {
    // 每次创建全新的内存会话，不保存缓存
    detailSessionCounter++;
    const partition = `memory-detail-${Date.now()}-${detailSessionCounter}`;
    const { session } = require('electron');
    const detailSession = session.fromPartition(partition, { cache: false });
    
    const detailWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            partition: partition
        },
        parent: mainWindow,
        title: '博主详情'
    });
    
    // 设置 cookies
    const cookiePairs = cookies.split(';').map(c => c.trim()).filter(c => c);
    
    for (const pair of cookiePairs) {
        const [name, ...valueParts] = pair.split('=');
        const value = valueParts.join('=');
        if (name && value) {
            try {
                await detailSession.cookies.set({
                    url: 'https://pgy.xiaohongshu.com',
                    name: name.trim(),
                    value: value.trim(),
                    domain: '.xiaohongshu.com'
                });
            } catch (e) {
                console.log('设置cookie失败:', name, e.message);
            }
        }
    }
    
    // 窗口关闭时清理会话
    detailWindow.on('closed', () => {
        detailSession.clearStorageData();
        detailSession.clearCache();
    });
    
    detailWindow.loadURL(url);
    return { success: true };
}));

// ==================== 密码登录功能 ====================

let passwordLoginSessionCounter = 0;

// 密码登录 - 后台自动登录蒲公英平台
ipcMain.handle('password-login-pgy', withLicenseGuard(async (event, email, password) => {
    return new Promise(async (resolve) => {
        if (!email || !password) {
            resolve({ success: false, message: '邮箱或密码不能为空' });
            return;
        }

        passwordLoginSessionCounter++;
        const partition = `memory-pwd-login-${Date.now()}-${passwordLoginSessionCounter}`;
        const { session } = require('electron');
        const loginSession = session.fromPartition(partition, { cache: false });

        loginSession.clearStorageData();
        loginSession.clearCache();

        let loginWin = null;
        let settled = false;
        let timeout = null;

        const finish = (payload) => {
            if (settled) return;
            settled = true;
            try {
                if (timeout) clearTimeout(timeout);
            } catch (e) {}
            try {
                if (loginWin && !loginWin.isDestroyed()) {
                    loginWin.close();
                }
            } catch (e) {}
            try {
                loginSession.clearStorageData();
                loginSession.clearCache();
            } catch (e) {}
            resolve(payload);
        };

        // 从session获取cookies
        const buildCookieHeader = async () => {
            const all = await loginSession.cookies.get({ domain: '.xiaohongshu.com' });
            return all
                .filter(c => c && c.name)
                .map(c => `${c.name}=${c.value || ''}`)
                .join('; ');
        };

        // 验证cookies是否有效
        const verifyCookies = (cookies) => {
            return new Promise((resolveVerify) => {
                const options = {
                    hostname: 'pgy.xiaohongshu.com',
                    port: 443,
                    path: '/api/solar/user/info',
                    method: 'GET',
                    headers: {
                        'accept': 'application/json, text/plain, */*',
                        'accept-language': 'zh-CN,zh;q=0.9',
                        'referer': 'https://pgy.xiaohongshu.com/solar/pre-trade/home',
                        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
                        'Cookie': cookies,
                        'Host': 'pgy.xiaohongshu.com',
                        'Connection': 'keep-alive'
                    },
                    timeout: 10000
                };

                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => {
                        try {
                            const jsonData = JSON.parse(data);
                            resolveVerify(jsonData.success && jsonData.code === 0);
                        } catch (e) {
                            resolveVerify(false);
                        }
                    });
                });

                req.on('error', () => resolveVerify(false));
                req.on('timeout', () => { req.destroy(); resolveVerify(false); });
                req.end();
            });
        };

        try {
            loginWin = new BrowserWindow({
                width: 1200,
                height: 800,
                show: false, // 隐藏窗口
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    partition: partition
                }
            });

            // 设置超时
            timeout = setTimeout(() => {
                finish({ success: false, message: '登录超时，请重试' });
            }, 60000);

            // 加载蒲公英首页
            await loginWin.loadURL('https://pgy.xiaohongshu.com/');

            // 等待页面加载完成后执行自动登录流程
            await new Promise(r => setTimeout(r, 2000));

            // 步骤1: 点击登录按钮
            await loginWin.webContents.executeJavaScript(`
                (function() {
                    const loginBtn = document.querySelector('button.login-btn');
                    if (loginBtn) {
                        loginBtn.click();
                        return true;
                    }
                    return false;
                })();
            `);

            await new Promise(r => setTimeout(r, 1500));

            // 步骤2: 点击"账号登录"
            await loginWin.webContents.executeJavaScript(`
                (function() {
                    const tabs = document.querySelectorAll('.css-1r2f04i');
                    for (const tab of tabs) {
                        if (tab.textContent.includes('账号登录')) {
                            tab.click();
                            return true;
                        }
                    }
                    return false;
                })();
            `);

            await new Promise(r => setTimeout(r, 1000));

            // 步骤3: 输入邮箱和密码
            const emailEscaped = email.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const passwordEscaped = password.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

            await loginWin.webContents.executeJavaScript(`
                (function() {
                    const emailInput = document.querySelector('input[name="email"]');
                    const passwordInput = document.querySelector('input[name="password"]');
                    
                    if (emailInput) {
                        emailInput.focus();
                        emailInput.value = '${emailEscaped}';
                        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    
                    if (passwordInput) {
                        passwordInput.focus();
                        passwordInput.value = '${passwordEscaped}';
                        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    
                    return !!(emailInput && passwordInput);
                })();
            `);

            await new Promise(r => setTimeout(r, 500));

            // 步骤4: 点击登录按钮
            await loginWin.webContents.executeJavaScript(`
                (function() {
                    const submitBtn = document.querySelector('.beer-login-btn');
                    if (submitBtn) {
                        submitBtn.click();
                        return true;
                    }
                    return false;
                })();
            `);

            // 等待登录完成，轮询检查cookies
            let attempts = 0;
            const maxAttempts = 30;
            
            const checkLogin = async () => {
                if (settled) return;
                attempts++;
                
                if (attempts > maxAttempts) {
                    finish({ success: false, message: '登录超时，请检查账号密码是否正确' });
                    return;
                }

                try {
                    const cookies = await buildCookieHeader();
                    if (cookies && cookies.length > 50) {
                        const isValid = await verifyCookies(cookies);
                        if (isValid) {
                            finish({ success: true, cookies: cookies });
                            return;
                        }
                    }
                } catch (e) {}

                // 继续轮询
                setTimeout(checkLogin, 1000);
            };

            // 开始轮询检查
            setTimeout(checkLogin, 2000);

        } catch (e) {
            finish({ success: false, message: `登录异常: ${e.message}` });
        }
    });
}));

// 更新账号cookies - 使用保存的账号密码重新登录
ipcMain.handle('refresh-account-cookies', withLicenseGuard(async (event, email, password, accountIndex) => {
    return new Promise(async (resolve) => {
        if (!email || !password) {
            resolve({ success: false, message: '该账号没有保存账号密码，无法自动更新' });
            return;
        }

        passwordLoginSessionCounter++;
        const partition = `memory-pwd-refresh-${Date.now()}-${passwordLoginSessionCounter}`;
        const { session } = require('electron');
        const loginSession = session.fromPartition(partition, { cache: false });

        loginSession.clearStorageData();
        loginSession.clearCache();

        let loginWin = null;
        let settled = false;
        let timeout = null;

        const finish = (payload) => {
            if (settled) return;
            settled = true;
            try {
                if (timeout) clearTimeout(timeout);
            } catch (e) {}
            try {
                if (loginWin && !loginWin.isDestroyed()) {
                    loginWin.close();
                }
            } catch (e) {}
            try {
                loginSession.clearStorageData();
                loginSession.clearCache();
            } catch (e) {}
            resolve(payload);
        };

        const buildCookieHeader = async () => {
            const all = await loginSession.cookies.get({ domain: '.xiaohongshu.com' });
            return all
                .filter(c => c && c.name)
                .map(c => `${c.name}=${c.value || ''}`)
                .join('; ');
        };

        const verifyCookies = (cookies) => {
            return new Promise((resolveVerify) => {
                const options = {
                    hostname: 'pgy.xiaohongshu.com',
                    port: 443,
                    path: '/api/solar/user/info',
                    method: 'GET',
                    headers: {
                        'accept': 'application/json, text/plain, */*',
                        'Cookie': cookies,
                        'Host': 'pgy.xiaohongshu.com'
                    },
                    timeout: 10000
                };

                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => {
                        try {
                            const jsonData = JSON.parse(data);
                            resolveVerify(jsonData.success && jsonData.code === 0);
                        } catch (e) {
                            resolveVerify(false);
                        }
                    });
                });

                req.on('error', () => resolveVerify(false));
                req.on('timeout', () => { req.destroy(); resolveVerify(false); });
                req.end();
            });
        };

        try {
            loginWin = new BrowserWindow({
                width: 1200,
                height: 800,
                show: false,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    partition: partition
                }
            });

            timeout = setTimeout(() => {
                finish({ success: false, message: '更新超时，请重试' });
            }, 60000);

            await loginWin.loadURL('https://pgy.xiaohongshu.com/');
            await new Promise(r => setTimeout(r, 2000));

            // 点击登录按钮
            await loginWin.webContents.executeJavaScript(`
                (function() {
                    const loginBtn = document.querySelector('button.login-btn');
                    if (loginBtn) { loginBtn.click(); return true; }
                    return false;
                })();
            `);

            await new Promise(r => setTimeout(r, 1500));

            // 点击"账号登录"
            await loginWin.webContents.executeJavaScript(`
                (function() {
                    const tabs = document.querySelectorAll('.css-1r2f04i');
                    for (const tab of tabs) {
                        if (tab.textContent.includes('账号登录')) {
                            tab.click();
                            return true;
                        }
                    }
                    return false;
                })();
            `);

            await new Promise(r => setTimeout(r, 1000));

            // 输入邮箱和密码
            const emailEscaped = email.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const passwordEscaped = password.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

            await loginWin.webContents.executeJavaScript(`
                (function() {
                    const emailInput = document.querySelector('input[name="email"]');
                    const passwordInput = document.querySelector('input[name="password"]');
                    
                    if (emailInput) {
                        emailInput.focus();
                        emailInput.value = '${emailEscaped}';
                        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    
                    if (passwordInput) {
                        passwordInput.focus();
                        passwordInput.value = '${passwordEscaped}';
                        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    
                    return !!(emailInput && passwordInput);
                })();
            `);

            await new Promise(r => setTimeout(r, 500));

            // 点击登录按钮
            await loginWin.webContents.executeJavaScript(`
                (function() {
                    const submitBtn = document.querySelector('.beer-login-btn');
                    if (submitBtn) { submitBtn.click(); return true; }
                    return false;
                })();
            `);

            // 轮询检查登录状态
            let attempts = 0;
            const maxAttempts = 30;
            
            const checkLogin = async () => {
                if (settled) return;
                attempts++;
                
                if (attempts > maxAttempts) {
                    finish({ success: false, message: '更新超时，请检查账号密码是否正确' });
                    return;
                }

                try {
                    const cookies = await buildCookieHeader();
                    if (cookies && cookies.length > 50) {
                        const isValid = await verifyCookies(cookies);
                        if (isValid) {
                            finish({ success: true, cookies: cookies, accountIndex: accountIndex });
                            return;
                        }
                    }
                } catch (e) {}

                setTimeout(checkLogin, 1000);
            };

            setTimeout(checkLogin, 2000);

        } catch (e) {
            finish({ success: false, message: `更新异常: ${e.message}` });
        }
    });
}));

// ==================== 激活码验证 API ====================

// 获取机器码
ipcMain.handle('get-machine-code', () => {
    return license.generateMachineCode();
});

// 检查激活状态
ipcMain.handle('check-license', async () => {
    const info = license.getLicenseInfo();
    if (info && info.days_remaining > 0) {
        return { success: true, data: info };
    }
    return { success: false };
});

// 激活激活码 (force=true 时强制解绑原设备)
ipcMain.handle('activate-license', async (event, licenseKey, force = false) => {
    return await license.activate(licenseKey, force);
});

// 显示确认对话框
ipcMain.handle('show-confirm-dialog', async (event, options) => {
    const result = await dialog.showMessageBox({
        type: 'question',
        title: options.title || '确认',
        message: options.message || '',
        buttons: options.buttons || ['取消', '确定'],
        defaultId: 1,
        cancelId: 0
    });
    return result.response === 1;
});

// 解绑授权码
ipcMain.handle('unbind-license', async () => {
    return await license.unbindLocal();
});

// 验证激活状态
ipcMain.handle('verify-license', async () => {
    return await license.verify();
});

// 获取激活信息
ipcMain.handle('get-license-info', () => {
    return license.getLicenseInfo();
});

// 检查是否为SVIP
ipcMain.handle('is-svip', () => {
    return license.isSVIP();
});

// 进入主程序 (从激活窗口)
ipcMain.handle('enter-main-app', async () => {
    // 先验证一次
    const result = await license.verify();
    if (result.success) {
        // 启动心跳
        license.startHeartbeat((expiredResult) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                dialog.showMessageBox(mainWindow, {
                    type: 'warning',
                    title: '授权提醒',
                    message: expiredResult.message || '您的授权已失效',
                    buttons: ['确定']
                }).then(() => {
                    license.stopHeartbeat();
                    mainWindow.close();
                    createActivationWindow();
                });
            }
        });
        
        // 关闭激活窗口，打开主窗口
        if (activationWindow && !activationWindow.isDestroyed()) {
            activationWindow.close();
        }
        createWindow();
        return { success: true };
    }
    return { success: false, message: '验证失败' };
});
