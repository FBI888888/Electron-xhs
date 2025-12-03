const { app, BrowserWindow, ipcMain, dialog, Menu, net } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

let mainWindow;

// 获取应用根目录（项目目录）
function getAppRootPath() {
    // 开发环境下使用当前工作目录，打包后使用 app 路径
    if (app.isPackaged) {
        return path.dirname(app.getPath('exe'));
    }
    return process.cwd();
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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
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
ipcMain.handle('collect-blogger-info', async (event, userId, cookies) => {
    return await bloggerApi.getBloggerInfo(userId, cookies);
});

// 采集数据概览
ipcMain.handle('collect-data-summary', async (event, userId, cookies) => {
    return await bloggerApi.getDataSummary(userId, cookies);
});

// 采集数据表现
ipcMain.handle('collect-performance-data', async (event, userId, selectedFields, cookies) => {
    return await performanceApi.getPerformanceData(userId, selectedFields, cookies);
});

// 采集粉丝指标
ipcMain.handle('collect-fans-summary', async (event, userId, cookies) => {
    return await bloggerApi.getFansSummary(userId, cookies);
});

// 采集粉丝画像
ipcMain.handle('collect-fans-profile', async (event, userId, cookies) => {
    return await bloggerApi.getFansProfile(userId, cookies);
});

// HTTP 请求处理 - 用于验证账号
ipcMain.handle('check-account', async (event, cookies) => {
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
});

// ==================== 达人列表功能 ====================

let bloggerWindow = null;
let capturedRequest = null;
let bloggerSessionCounter = 0;

// 打开博主广场浏览器窗口
ipcMain.handle('open-blogger-browser', async (event, cookies) => {
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
        title: '博主广场 - 小红书蒲公英'
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
});

// 获取捕获的请求
ipcMain.handle('get-captured-request', () => {
    return capturedRequest;
});

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
ipcMain.handle('open-direct-login', async () => {
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
        title: '小红书蒲公英 - 登录获取Cookies'
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
});

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
ipcMain.handle('open-blogger-detail', async (event, url, cookies) => {
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
});
