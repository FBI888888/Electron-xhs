const { ipcRenderer } = require('electron');
 const fs = require('fs');
const path = require('path');

// 数据存储路径
const DATA_DIR = 'data';
const ACCOUNTS_FILE = 'pgy_username.json';
const SETTINGS_FILE = 'collect_settings.json';

// 全局状态
let accounts = [];
let collectItems = [];
let settings = null;
let isCollecting = false;
let appPath = ''; // 应用根目录路径
let currentMemberLevel = null; // 当前会员等级

// 高级功能权限配置 (VIP无法访问的页面)
const PREMIUM_PAGES = ['blogger-list']; // 达人列表需要VVIP或SVIP

// ==================== 工具函数 ====================

// Toast 消息提示
function showToast(type, title, message, duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
        warning: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
        error: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
        info: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
    };
    
    toast.innerHTML = `
        ${icons[type]}
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// 模态框
function showModal(title, content, buttons = [], getFormData = null) {
    return new Promise((resolve) => {
        const container = document.getElementById('modal-container');
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        
        const buttonsHtml = buttons.map((btn, index) => 
            `<button class="btn ${btn.primary ? 'btn-primary' : 'btn-secondary'}" data-index="${index}">${btn.text}</button>`
        ).join('');
        
        overlay.innerHTML = `
            <div class="modal">
                <div class="modal-header">${title}</div>
                <div class="modal-body">${content}</div>
                <div class="modal-footer">${buttonsHtml}</div>
            </div>
        `;
        
        container.appendChild(overlay);
        
        overlay.querySelectorAll('.modal-footer .btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.dataset.index);
                const buttonValue = buttons[index].value;
                
                // 在移除前获取表单数据
                let formData = null;
                if (getFormData && buttonValue) {
                    formData = getFormData();
                }
                
                overlay.remove();
                
                // 返回按钮值和表单数据
                if (formData !== null) {
                    resolve({ confirmed: buttonValue, data: formData });
                } else {
                    resolve(buttonValue);
                }
            });
        });
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve(null);
            }
        });
    });
}

// 确认对话框
async function showConfirm(title, message) {
    return showModal(title, `<p>${message}</p>`, [
        { text: '取消', value: false },
        { text: '确定', value: true, primary: true }
    ]);
}

// 初始化应用路径
async function initAppPath() {
    if (!appPath) {
        appPath = await ipcRenderer.invoke('get-app-path');
    }
    return appPath;
}

// 文件路径助手 - 保存到项目目录的data文件夹
async function getDataPath(filename) {
    await initAppPath();
    return path.join(appPath, DATA_DIR, filename);
}

// 加载 JSON 数据
async function loadJsonData(filename, defaultValue = null) {
    try {
        const filePath = await getDataPath(filename);
        const exists = await ipcRenderer.invoke('file-exists', filePath);
        if (!exists) return defaultValue;
        
        const result = await ipcRenderer.invoke('read-file', filePath);
        if (result.success) {
            return JSON.parse(result.content);
        }
    } catch (err) {
        console.error('加载数据失败:', err);
    }
    return defaultValue;
}

// 保存 JSON 数据
async function saveJsonData(filename, data) {
    try {
        const filePath = await getDataPath(filename);
        const result = await ipcRenderer.invoke('write-file', filePath, JSON.stringify(data, null, 2));
        return result.success;
    } catch (err) {
        console.error('保存数据失败:', err);
        return false;
    }
}

// ==================== 页面导航 ====================

function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const pages = document.querySelectorAll('.page');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const pageName = item.dataset.page;
            
            // 检查高级功能权限
            if (PREMIUM_PAGES.includes(pageName) && !hasPremiumAccess()) {
                showPermissionDenied();
                return;
            }
            
            // 更新导航状态
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            // 切换页面
            pages.forEach(page => {
                page.classList.remove('active');
                if (page.id === `page-${pageName}`) {
                    page.classList.add('active');
                }
            });
            
            // 切换到授权信息页面时刷新数据
            if (pageName === 'license') {
                loadLicenseInfo();
            }
        });
    });
}

// 检查是否有高级功能访问权限 (VVIP或SVIP)
function hasPremiumAccess() {
    return currentMemberLevel === 'VVIP' || currentMemberLevel === 'SVIP';
}

// 显示权限不足提示
function showPermissionDenied() {
    showModal('权限不足', `
        <div style="text-align: center; padding: 20px;">
            <div style="font-size: 48px; margin-bottom: 20px;">🔒</div>
            <p style="font-size: 16px; color: #333; margin-bottom: 15px;">
                此功能为<span style="color: #7c3aed; font-weight: 600;">高级会员</span>和<span style="color: #db2777; font-weight: 600;">超级会员</span>专属功能
            </p>
            <p style="font-size: 14px; color: #666;">
                如需使用请联系管理员提升权限
            </p>
        </div>
    `, [
        { text: '我知道了', value: true, primary: true }
    ]);
}

// ==================== 账号管理页面 ====================

async function loadAccounts() {
    accounts = await loadJsonData(ACCOUNTS_FILE, []);
    renderAccountTable();
}

function renderAccountTable() {
    const tbody = document.getElementById('account-tbody');
    
    if (accounts.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 40px; color: #999;">
                    暂无账号数据，请添加账号
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = accounts.map((account, index) => `
        <tr data-index="${index}">
            <td>${account.remark || ''}</td>
            <td>${account.nickName || ''}</td>
            <td>
                <span class="status-tag ${account.status === '正常' ? 'normal' : account.status === '失效' ? 'error' : 'pending'}">
                    ${account.status || '未检查'}
                </span>
            </td>
            <td title="${account.cookies || ''}">${account.cookies || ''}</td>
        </tr>
    `).join('');
    
    // 绑定右键菜单
    tbody.querySelectorAll('tr').forEach(row => {
        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const index = parseInt(row.dataset.index);
            showAccountContextMenu(e.clientX, e.clientY, index);
        });
    });
}

function showAccountContextMenu(x, y, index) {
    // 移除已有的菜单
    document.querySelectorAll('.context-menu').forEach(m => m.remove());
    
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.innerHTML = `
        <div class="context-menu-item" data-action="check">检查账号</div>
        <div class="context-menu-item" data-action="edit">修改账号</div>
        <div class="context-menu-item" data-action="delete">删除账号</div>
    `;
    
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    document.body.appendChild(menu);
    
    menu.querySelectorAll('.context-menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const action = item.dataset.action;
            menu.remove();
            
            switch (action) {
                case 'check':
                    checkSingleAccount(index);
                    break;
                case 'edit':
                    editAccount(index);
                    break;
                case 'delete':
                    deleteAccount(index);
                    break;
            }
        });
    });
    
    // 点击其他地方关闭菜单
    setTimeout(() => {
        document.addEventListener('click', function handler() {
            menu.remove();
            document.removeEventListener('click', handler);
        });
    }, 0);
}

async function checkAccountStatus(cookies) {
    // 通过主进程发送 HTTP 请求，避免 CORS 限制
    try {
        const result = await ipcRenderer.invoke('check-account', cookies);
        return result;
    } catch (err) {
        return { success: false, message: `请求失败: ${err.message}` };
    }
}

async function addAccount() {
    const remarkInput = document.getElementById('remark-input');
    const cookiesInput = document.getElementById('cookies-input');
    
    const remark = remarkInput.value.trim();
    const cookies = cookiesInput.value.trim();
    
    if (!remark) {
        showToast('warning', '提示', '请输入备注名');
        return;
    }
    
    if (!cookies) {
        showToast('warning', '提示', '请输入Cookies');
        return;
    }
    
    showToast('info', '验证中', '正在验证账号...');
    
    const result = await checkAccountStatus(cookies);
    
    if (result.success) {
        accounts.push({
            remark,
            nickName: result.nickName,
            status: '正常',
            cookies
        });
        
        await saveJsonData(ACCOUNTS_FILE, accounts);
        renderAccountTable();
        
        remarkInput.value = '';
        cookiesInput.value = '';
        
        showToast('success', '成功', '账号添加成功');
    } else {
        showToast('error', '验证失败', result.message);
    }
}

async function checkAllAccounts() {
    if (accounts.length === 0) {
        showToast('warning', '提示', '没有账号需要检查');
        return;
    }
    
    showToast('info', '检查中', `正在检查 ${accounts.length} 个账号...`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < accounts.length; i++) {
        const result = await checkAccountStatus(accounts[i].cookies);
        
        accounts[i].status = result.success ? '正常' : '失效';
        if (result.success && result.nickName) {
            accounts[i].nickName = result.nickName;
        }
        
        if (result.success) {
            successCount++;
        } else {
            failCount++;
        }
        
        renderAccountTable();
    }
    
    await saveJsonData(ACCOUNTS_FILE, accounts);
    
    if (failCount === 0) {
        showToast('success', '检查完成', `全部 ${accounts.length} 个账号验证成功！`);
    } else {
        showToast('warning', '检查完成', `成功: ${successCount} 个 | 失败: ${failCount} 个`);
    }
}

async function checkSingleAccount(index) {
    const account = accounts[index];
    showToast('info', '检查中', `正在检查账号: ${account.remark}`);
    
    const result = await checkAccountStatus(account.cookies);
    
    accounts[index].status = result.success ? '正常' : '失效';
    if (result.success && result.nickName) {
        accounts[index].nickName = result.nickName;
    }
    
    await saveJsonData(ACCOUNTS_FILE, accounts);
    renderAccountTable();
    
    if (result.success) {
        showToast('success', '检查成功', `账号 "${account.remark}" 状态正常`);
    } else {
        showToast('error', '检查失败', `账号 "${account.remark}" ${result.message}`);
    }
}

async function editAccount(index) {
    const account = accounts[index];
    
    const content = `
        <div class="form-row">
            <label class="form-label">备注名:</label>
            <input type="text" class="input" id="edit-remark" value="${account.remark || ''}" style="flex: 1;">
        </div>
        <div class="form-row">
            <label class="form-label">Cookies:</label>
            <input type="text" class="input" id="edit-cookies" value="${account.cookies || ''}" style="flex: 1;">
        </div>
    `;
    
    // 使用 getFormData 回调在关闭前获取表单内容
    const result = await showModal('修改账号', content, [
        { text: '取消', value: false },
        { text: '保存', value: true, primary: true }
    ], () => {
        return {
            remark: document.getElementById('edit-remark')?.value.trim() || '',
            cookies: document.getElementById('edit-cookies')?.value.trim() || ''
        };
    });
    
    if (result && result.confirmed && result.data) {
        const { remark: newRemark, cookies: newCookies } = result.data;
        
        if (!newRemark) {
            showToast('warning', '提示', '请输入备注名');
            return;
        }
        
        if (!newCookies) {
            showToast('warning', '提示', '请输入Cookies');
            return;
        }
        
        const oldCookies = accounts[index].cookies;
        accounts[index].remark = newRemark;
        accounts[index].cookies = newCookies;
        
        // 如果 Cookies 变了，重新验证
        if (oldCookies !== newCookies) {
            showToast('info', '验证中', '正在验证新的Cookies...');
            const checkResult = await checkAccountStatus(newCookies);
            
            accounts[index].status = checkResult.success ? '正常' : '失效';
            if (checkResult.success && checkResult.nickName) {
                accounts[index].nickName = checkResult.nickName;
            }
            
            if (checkResult.success) {
                showToast('success', '修改成功', '账号信息已更新并验证通过');
            } else {
                showToast('warning', '验证失败', `账号信息已更新，但验证失败: ${checkResult.message}`);
            }
        } else {
            showToast('success', '修改成功', '账号信息已更新');
        }
        
        await saveJsonData(ACCOUNTS_FILE, accounts);
        renderAccountTable();
    }
}

async function deleteAccount(index) {
    const account = accounts[index];
    const confirmed = await showConfirm('确认删除', `确定要删除账号 "${account.remark}" 吗？`);
    
    if (confirmed) {
        accounts.splice(index, 1);
        await saveJsonData(ACCOUNTS_FILE, accounts);
        renderAccountTable();
        showToast('success', '删除成功', '账号已删除');
    }
}

// 直接登录 - 打开浏览器获取Cookies
async function directLogin() {
    showToast('info', '正在打开', '正在打开登录窗口，请在浏览器中登录...');
    const result = await ipcRenderer.invoke('open-direct-login');
    if (!result.success) {
        showToast('error', '打开失败', result.message);
    }
}

// 监听登录Cookies捕获事件
ipcRenderer.on('login-cookies-captured', (event, cookies) => {
    const cookiesInput = document.getElementById('cookies-input');
    if (cookiesInput) {
        cookiesInput.value = cookies;
        showToast('success', '获取成功', 'Cookies已自动填入，请输入备注名后点击“添加账号”');
    }
});

function initAccountPage() {
    document.getElementById('add-account-btn').addEventListener('click', addAccount);
    document.getElementById('direct-login-btn').addEventListener('click', directLogin);
    document.getElementById('check-all-btn').addEventListener('click', checkAllAccounts);
    loadAccounts();
}

// ==================== 采集设置页面 ====================

function getDefaultSettings() {
    return {
        save_mode: 'local',
        local: {
            filename: 'collected_data.xlsx',
            path: ''
        },
        performance_fields: [
            '日常笔记-图文+视频-近30天-全流量',
            '日常笔记-图文-近30天-全流量',
            '日常笔记-视频-近30天-全流量',
            '日常笔记-图文+视频-近90天-全流量',
            '日常笔记-图文-近90天-全流量',
            '日常笔记-视频-近90天-全流量',
            '合作笔记-图文+视频-近30天-全流量',
            '合作笔记-图文-近30天-全流量',
            '合作笔记-视频-近30天-全流量',
            '合作笔记-图文+视频-近90天-全流量',
            '合作笔记-图文-近90天-全流量',
            '合作笔记-视频-近90天-全流量'
        ],
        max_count: 9999,
        concurrency: 2,
        throttle_ms: 500,
        split_fans_profile: false,
        dual_thread: false
    };
}

async function loadSettings() {
    const defaultSettings = getDefaultSettings();
    
    // 获取默认文档路径
    const documentsPath = await ipcRenderer.invoke('get-documents-path');
    defaultSettings.local.path = documentsPath;
    
    settings = await loadJsonData(SETTINGS_FILE, null);
    
    if (settings) {
        // 合并默认设置和已保存设置
        if (settings.local) {
            defaultSettings.local.filename = settings.local.filename || defaultSettings.local.filename;
            defaultSettings.local.path = settings.local.path || defaultSettings.local.path;
        }
        if (settings.performance_fields) {
            defaultSettings.performance_fields = settings.performance_fields;
        }
        if (settings.max_count !== undefined) {
            defaultSettings.max_count = settings.max_count;
        }
        if (settings.concurrency !== undefined) {
            defaultSettings.concurrency = settings.concurrency;
        }
        if (settings.throttle_ms !== undefined) {
            defaultSettings.throttle_ms = settings.throttle_ms;
        }
        if (settings.split_fans_profile !== undefined) {
            defaultSettings.split_fans_profile = settings.split_fans_profile;
        }
        if (settings.dual_thread !== undefined) {
            defaultSettings.dual_thread = settings.dual_thread;
        }
    }
    
    settings = defaultSettings;
    renderSettings();
}

function renderSettings() {
    document.getElementById('filename-input').value = settings.local?.filename || '';
    document.getElementById('path-input').value = settings.local?.path || '';
    document.getElementById('max-count-input').value = settings.max_count || 9999;
    
    // 渲染粉丝画像字段拆分开关状态
    const splitToggle = document.getElementById('split-fans-profile-toggle');
    if (splitToggle) {
        splitToggle.checked = settings.split_fans_profile || false;
    }
    
    // 渲染双线程采集开关状态
    const dualThreadToggle = document.getElementById('dual-thread-toggle');
    if (dualThreadToggle) {
        dualThreadToggle.checked = settings.dual_thread || false;
    }
    
    // 渲染复选框状态
    const selectedFields = settings.performance_fields || [];
    document.querySelectorAll('input[name="performance"]').forEach(checkbox => {
        checkbox.checked = selectedFields.includes(checkbox.value);
    });
}

async function saveSettings(showNotification = false) {
    const filename = document.getElementById('filename-input').value.trim();
    const savePath = document.getElementById('path-input').value.trim();
    const maxCount = parseInt(document.getElementById('max-count-input').value) || 9999;
    
    // 获取粉丝画像字段拆分开关状态
    const splitToggle = document.getElementById('split-fans-profile-toggle');
    const splitFansProfile = splitToggle ? splitToggle.checked : false;
    
    // 获取双线程采集开关状态
    const dualThreadToggle = document.getElementById('dual-thread-toggle');
    const dualThread = dualThreadToggle ? dualThreadToggle.checked : false;
    
    // 获取选中的字段（允许为空）
    const selectedFields = [];
    document.querySelectorAll('input[name="performance"]:checked').forEach(checkbox => {
        selectedFields.push(checkbox.value);
    });
    
    settings = {
        save_mode: 'local',
        local: {
            filename,
            path: savePath
        },
        performance_fields: selectedFields,
        max_count: maxCount,
        concurrency: dualThread ? 2 : 1,
        throttle_ms: settings?.throttle_ms ?? 1000,
        split_fans_profile: splitFansProfile,
        dual_thread: dualThread
    };
    
    await saveJsonData(SETTINGS_FILE, settings);
}

async function selectSavePath() {
    const selectedPath = await ipcRenderer.invoke('select-directory');
    if (selectedPath) {
        document.getElementById('path-input').value = selectedPath;
    }
}

function selectAllFields() {
    document.querySelectorAll('input[name="performance"]').forEach(checkbox => {
        checkbox.checked = true;
    });
}

function deselectAllFields() {
    document.querySelectorAll('input[name="performance"]').forEach(checkbox => {
        checkbox.checked = false;
    });
}

function initSettingsPage() {
    document.getElementById('select-path-btn').addEventListener('click', async () => {
        await selectSavePath();
        saveSettings();
    });
    document.getElementById('select-all-btn').addEventListener('click', () => {
        selectAllFields();
        saveSettings();
    });
    document.getElementById('deselect-all-btn').addEventListener('click', () => {
        deselectAllFields();
        saveSettings();
    });
    
    // 自动保存：监听输入变化
    document.getElementById('filename-input').addEventListener('input', saveSettings);
    document.getElementById('max-count-input').addEventListener('input', saveSettings);
    
    // 监听粉丝画像字段拆分开关变化
    const splitToggle = document.getElementById('split-fans-profile-toggle');
    if (splitToggle) {
        splitToggle.addEventListener('change', saveSettings);
    }
    
    // 监听双线程采集开关变化
    const dualThreadToggle = document.getElementById('dual-thread-toggle');
    if (dualThreadToggle) {
        dualThreadToggle.addEventListener('change', function() {
            if (this.checked) {
                showToast('warning', '双线程提醒', '双线程会加快采集速度，但有可能导致蒲公英账号异常，请谨慎使用');
            }
            saveSettings();
        });
    }
    
    // 监听所有复选框变化
    document.querySelectorAll('input[name="performance"]').forEach(checkbox => {
        checkbox.addEventListener('change', saveSettings);
    });
    
    loadSettings();
}

// ==================== 采集管理页面 ====================

function extractUserId(url) {
    // 匹配蒲公英URL
    const pgyPattern = /pgy\.xiaohongshu\.com\/solar\/pre-trade\/blogger-detail\/([a-f0-9]+)/;
    let match = url.match(pgyPattern);
    if (match) return match[1];
    
    // 匹配小红书URL
    const xhsPattern = /www\.xiaohongshu\.com\/user\/profile\/([a-f0-9]+)/;
    match = url.match(xhsPattern);
    if (match) return match[1];
    
    return null;
}

function isValidUrl(url) {
    return url.includes('pgy.xiaohongshu.com/solar/pre-trade/blogger-detail') ||
           url.includes('www.xiaohongshu.com/user/profile');
}

function generateUrls(userId) {
    return {
        pgy_url: `https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/${userId}`,
        xhs_url: `https://www.xiaohongshu.com/user/profile/${userId}`
    };
}

function addCollectItem(url) {
    if (!isValidUrl(url)) return false;
    
    const userId = extractUserId(url);
    if (!userId) return false;
    
    // 检查是否已存在
    if (collectItems.some(item => item.user_id === userId)) {
        return false;
    }
    
    const urls = generateUrls(userId);
    
    collectItems.push({
        pgy_url: urls.pgy_url,
        xhs_url: urls.xhs_url,
        user_id: userId,
        nickname: '',
        status: '待采集',
        collect_time: ''
    });
    
    return true;
}

function renderCollectTable() {
    const tbody = document.getElementById('collect-tbody');
    
    if (collectItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: #999;">
                    暂无采集数据，请导入采集目标
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = collectItems.map((item, index) => `
        <tr data-index="${index}">
            <td title="${item.pgy_url}">${item.pgy_url}</td>
            <td title="${item.xhs_url}">${item.xhs_url}</td>
            <td>${item.user_id}</td>
            <td>${item.nickname || ''}</td>
            <td>${item.healthLevel !== undefined ? item.healthLevel : '-'}</td>
            <td>
                <span class="status-tag ${getStatusClass(item.status)}">
                    ${item.status}
                </span>
            </td>
            <td>${item.collect_time || ''}</td>
        </tr>
    `).join('');
}

function getStatusClass(status) {
    if (status === '已完成') return 'success';
    if (status === '待采集') return 'pending';
    if (status.includes('采集中')) return 'processing';
    if (status.includes('失败')) return 'error';
    return 'pending';
}

async function importFromExcel() {
    const filePath = await ipcRenderer.invoke('select-file', [
        { name: 'Excel Files', extensions: ['xlsx', 'xls'] }
    ]);
    
    if (!filePath) return;
    
    try {
        const XLSX = require('xlsx');
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        let addedCount = 0;
        let skippedCount = 0;
        
        data.forEach(row => {
            if (row[0]) {
                const url = String(row[0]).trim();
                if (addCollectItem(url)) {
                    addedCount++;
                } else {
                    skippedCount++;
                }
            }
        });
        
        renderCollectTable();
        showToast('success', '导入成功', `成功导入 ${addedCount} 条，跳过 ${skippedCount} 条`);
    } catch (err) {
        showToast('error', '导入失败', `无法读取Excel文件: ${err.message}`);
    }
}

async function importFromText() {
    const content = `
        <p style="margin-bottom: 10px; color: #666;">请输入URL，每行一个：</p>
        <textarea class="textarea" id="import-text" placeholder="请输入URL，每行一个。
支持格式：
https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/xxx
https://www.xiaohongshu.com/user/profile/xxx"></textarea>
    `;
    
    // 使用 getFormData 回调在关闭前获取文本框内容
    const result = await showModal('文本导入', content, [
        { text: '取消', value: false },
        { text: '导入', value: true, primary: true }
    ], () => {
        const textArea = document.getElementById('import-text');
        return textArea ? textArea.value : '';
    });
    
    if (result && result.confirmed && result.data) {
        const text = result.data;
        const lines = text.trim().split('\n');
        let addedCount = 0;
        let skippedCount = 0;
        
        lines.forEach(line => {
            const url = line.trim();
            if (url) {
                if (addCollectItem(url)) {
                    addedCount++;
                } else {
                    skippedCount++;
                }
            }
        });
        
        renderCollectTable();
        showToast('success', '导入成功', `成功导入 ${addedCount} 条，跳过 ${skippedCount} 条`);
    }
}

async function importFromTxt() {
    const filePath = await ipcRenderer.invoke('select-file', [
        { name: 'Text Files', extensions: ['txt'] }
    ]);
    
    if (!filePath) return;
    
    const result = await ipcRenderer.invoke('read-file', filePath);
    
    if (!result.success) {
        showToast('error', '导入失败', `无法读取TXT文件: ${result.error}`);
        return;
    }
    
    const lines = result.content.split('\n');
    let addedCount = 0;
    let skippedCount = 0;
    
    lines.forEach(line => {
        const url = line.trim();
        if (url) {
            if (addCollectItem(url)) {
                addedCount++;
            } else {
                skippedCount++;
            }
        }
    });
    
    renderCollectTable();
    showToast('success', '导入成功', `成功导入 ${addedCount} 条，跳过 ${skippedCount} 条`);
}

// 采集状态控制变量
let isPaused = false;
let currentAccountIndex = 0;
let currentAccounts = [];

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

function updateCollectButtons(collecting) {
    isCollecting = collecting;
    document.getElementById('start-collect-btn').disabled = collecting;
    document.getElementById('pause-collect-btn').disabled = !collecting;
    document.getElementById('stop-collect-btn').disabled = !collecting;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitWhilePaused() {
    while (isPaused && isCollecting) {
        await sleep(100);
    }
}

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

function getNextAvailableAccount(maxCount) {
    const today = getTodayDate();
    let attempts = 0;
    
    while (attempts < currentAccounts.length) {
        const account = currentAccounts[currentAccountIndex];
        
        // 检查是否为今天的使用记录
        if (account.last_use_date !== today) {
            account.last_use_date = today;
            account.today_use_count = 0;
        }
        
        // 检查是否超过最大使用次数
        if ((account.today_use_count || 0) < maxCount) {
            return { index: currentAccountIndex, account };
        }
        
        // 尝试下一个账号
        currentAccountIndex = (currentAccountIndex + 1) % currentAccounts.length;
        attempts++;
    }
    
    // 所有账号都已达到最大使用次数
    return { index: null, account: null };
}

async function collectSingleItem(index, item, selectedFields, maxCount) {
    const accountMutex = collectSingleItem.accountMutex || (collectSingleItem.accountMutex = createMutex());
 
    // 获取可用账号 + 更新账号使用次数（并发下需要互斥）
    const { accountIndex, cookies } = await accountMutex.runExclusive(async () => {
        const { index: idx, account } = getNextAvailableAccount(maxCount);
        if (account === null) {
            return { accountIndex: null, cookies: null };
        }
 
        account.today_use_count = (account.today_use_count || 0) + 1;
        console.log(`账号 ${idx + 1} 今日已使用 ${account.today_use_count} 次`);
 
        // 分配完账号后立即轮转，避免并发下集中使用同一账号
        currentAccountIndex = (currentAccountIndex + 1) % currentAccounts.length;
 
        return { accountIndex: idx, cookies: account.cookies };
    });
 
    if (cookies === null) {
        return { success: false, message: '所有账号均已达到今日最大使用次数' };
    }
    const userId = item.user_id;
    let combinedData = {};
    let finalMessage = '';
    
    // 1. 采集博主信息
    collectItems[index].status = `采集中-博主信息(账号${accountIndex + 1})`;
    renderCollectTable();
    
    const result1 = await ipcRenderer.invoke('collect-blogger-info', userId, cookies);
    
    if (!result1.success) {
        return { success: false, message: result1.message };
    }
    
    combinedData = { ...result1.data };
    finalMessage = '采集成功';

    collectItems[index].status = '采集中-数据采集';
    renderCollectTable();

    const tasks = [
        ipcRenderer.invoke('collect-data-summary', userId, cookies),
        selectedFields.length > 0
            ? ipcRenderer.invoke('collect-performance-data', userId, selectedFields, cookies)
            : Promise.resolve({ success: true, data: null, message: '' }),
        ipcRenderer.invoke('collect-fans-summary', userId, cookies),
        ipcRenderer.invoke('collect-fans-profile', userId, cookies),
    ];

    const [r2, r3, r4, r5] = await Promise.allSettled(tasks);

    const result2 = r2.status === 'fulfilled' ? r2.value : { success: false, message: r2.reason?.message || String(r2.reason) };
    const result3 = r3.status === 'fulfilled' ? r3.value : { success: false, message: r3.reason?.message || String(r3.reason) };
    const result4 = r4.status === 'fulfilled' ? r4.value : { success: false, message: r4.reason?.message || String(r4.reason) };
    const result5 = r5.status === 'fulfilled' ? r5.value : { success: false, message: r5.reason?.message || String(r5.reason) };

    if (result2.success && result2.data) {
        combinedData = { ...combinedData, ...result2.data };
    } else if (!result2.success) {
        finalMessage += `（数据概览失败: ${result2.message}）`;
    }

    if (selectedFields.length > 0) {
        if (result3.success && result3.data) {
            combinedData = { ...combinedData, ...result3.data };
        } else if (!result3.success) {
            finalMessage += `（数据表现失败: ${result3.message}）`;
        }
    }

    if (result4.success && result4.data) {
        combinedData = { ...combinedData, ...result4.data };
    } else if (!result4.success) {
        finalMessage += `（粉丝指标失败: ${result4.message}）`;
    }

    if (result5.success && result5.data) {
        combinedData = { ...combinedData, ...result5.data };
    } else if (!result5.success) {
        finalMessage += `（粉丝画像失败: ${result5.message}）`;
    }
    
    return { success: true, message: finalMessage, data: combinedData };
}

async function startCollect() {
    if (collectItems.length === 0) {
        showToast('warning', '提示', '请先导入采集目标');
        return;
    }
    
    if (isCollecting) {
        showToast('warning', '提示', '正在采集中，请勿重复操作');
        return;
    }
    
    // 重新加载最新设置
    console.log('开始采集 - 重新加载配置文件...');
    const loadedSettings = await loadJsonData(SETTINGS_FILE, null);
    const maxCount = loadedSettings?.max_count || 9999;
    const selectedFields = loadedSettings?.performance_fields || [];
    const concurrency = Math.max(1, Math.min(10, Number(loadedSettings?.concurrency ?? 2) || 2));
    const throttleMs = Math.max(0, Number(loadedSettings?.throttle_ms ?? 1000) || 1000);
    
    console.log(`账号最大使用次数: ${maxCount}`);
    console.log(`选择的数据表现字段数量: ${selectedFields.length}`);
    console.log(`采集并发(concurrency): ${concurrency}`);
    console.log(`采集节流(throttle_ms): ${throttleMs}`);
    
    // 获取有效账号
    const validAccounts = accounts.filter(acc => acc.status === '正常');
    if (validAccounts.length === 0) {
        showToast('error', '错误', '没有可用的账号，请先在账号管理中添加并验证账号');
        return;
    }
    
    // 初始化采集状态
    currentAccounts = validAccounts.map(acc => ({ ...acc })); // 深拷贝
    currentAccountIndex = 0;
    isPaused = false;
    
    updateCollectButtons(true);
    showToast('info', '开始采集', `开始采集 ${collectItems.length} 个目标（已选择 ${selectedFields.length} 种数据表现字段）`);
    
    // 执行采集（双并发 worker）
    const pendingIndexes = [];
    for (let i = 0; i < collectItems.length; i++) {
        if (collectItems[i].status !== '已完成') {
            pendingIndexes.push(i);
        }
    }
 
    const queueMutex = createMutex();
    let queuePos = 0;
 
    async function getNextIndex() {
        return queueMutex.runExclusive(async () => {
            if (queuePos >= pendingIndexes.length) return null;
            const idx = pendingIndexes[queuePos];
            queuePos++;
            return idx;
        });
    }
 
    async function workerLoop(workerId) {
        while (isCollecting) {
            await waitWhilePaused();
            if (!isCollecting) break;
 
            const i = await getNextIndex();
            if (i === null) break;
 
            const item = collectItems[i];
            if (!item || item.status === '已完成') {
                continue;
            }
 
            try {
                const result = await collectSingleItem(i, item, selectedFields, maxCount);
 
                if (result.success && result.data) {
                    item.nickname = result.data.name || '';
                    item.healthLevel = result.data.currentLevel !== undefined ? result.data.currentLevel : '-';
                    item.status = '已完成';
                    item.collect_time = new Date().toLocaleString('zh-CN');
                    item.collected_data = result.data;
                } else {
                    item.status = `失败: ${result.message}`;
                    item.collect_time = new Date().toLocaleString('zh-CN');
                }
 
                renderCollectTable();
 
                // 每个 worker 内部保持间隔，避免请求过于密集
                if (isCollecting && throttleMs > 0) {
                    await sleep(throttleMs);
                }
            } catch (err) {
                item.status = `失败: ${err.message}`;
                item.collect_time = new Date().toLocaleString('zh-CN');
                renderCollectTable();
            }
        }
    }
 
    await Promise.all(
        Array.from({ length: concurrency }, (_, i) => workerLoop(i + 1))
    );
    
    // 采集完成
    if (isCollecting) {
        // 保存账号使用记录
        await saveAccountUsageRecords();
        
        // 统计结果
        const successCount = collectItems.filter(item => item.status === '已完成').length;
        const failCount = collectItems.filter(item => item.status.includes('失败')).length;
        
        showToast('success', '采集完成', `成功: ${successCount} 个 | 失败: ${failCount} 个`);
        
        // 自动保存到Excel
        if (loadedSettings?.save_mode === 'local') {
            await saveToExcel(loadedSettings, selectedFields);
        }
    }
    
    isPaused = false;
    updateCollectButtons(false);
    resetPauseButton();
}

async function saveAccountUsageRecords() {
    try {
        // 读取所有账号
        const allAccounts = await loadJsonData(ACCOUNTS_FILE, []);
        
        // 更新使用记录
        for (const currentAcc of currentAccounts) {
            for (const acc of allAccounts) {
                if (acc.cookies === currentAcc.cookies) {
                    acc.last_use_date = currentAcc.last_use_date || '';
                    acc.today_use_count = currentAcc.today_use_count || 0;
                    break;
                }
            }
        }
        
        // 保存回文件
        await saveJsonData(ACCOUNTS_FILE, allAccounts);
    } catch (e) {
        console.error('保存账号使用记录失败:', e);
    }
}

function pauseCollect() {
    const pauseBtn = document.getElementById('pause-collect-btn');
    if (!isPaused) {
        isPaused = true;
        pauseBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            恢复采集
        `;
        showToast('info', '已暂停', '采集任务已暂停');
    } else {
        isPaused = false;
        pauseBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
            暂停采集
        `;
        showToast('info', '恢复采集', '已恢复采集任务');
    }
}

function resetPauseButton() {
    const pauseBtn = document.getElementById('pause-collect-btn');
    pauseBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <rect x="6" y="4" width="4" height="16"></rect>
            <rect x="14" y="4" width="4" height="16"></rect>
        </svg>
        暂停采集
    `;
}

function stopCollect() {
    isCollecting = false;
    isPaused = false;
    updateCollectButtons(false);
    resetPauseButton();
    showToast('success', '已停止', '采集任务已终止');
}

// ==================== 保存到Excel ====================

/**
 * 解析粉丝画像字符串，拆分为键值对
 * 支持格式:
 * - "男3.09%，女96.91%" => [["男", "3.09%"], ["女", "96.91%"]]
 * - "<18 4.6%，18-24 37.8%" => [["<18", "4.6%"], ["18-24", "37.8%"]]
 * - "广东 15.0%，浙江 9.8%" => [["广东", "15.0%"], ["浙江", "9.8%"]]
 * - "健康 8.5%，时尚 6.2%" => [["健康", "8.5%"], ["时尚", "6.2%"]]
 */
function parseFansProfileString(str) {
    if (!str || typeof str !== 'string') return [];
    
    // 按中文逗号或英文逗号分割
    const parts = str.split(/[，,]/).map(s => s.trim()).filter(s => s);
    const result = [];
    
    for (const part of parts) {
        // 统一匹配：从末尾找百分比数字，前面的都是名称
        // 匹配格式: "名称 X.XX%" 或 "名称X.XX%" (百分比在末尾)
        const match = part.match(/^(.+?)\s*(\d+\.?\d*%)$/);
        if (match) {
            const name = match[1].trim();
            const value = match[2];
            if (name) {
                result.push([name, value]);
            }
        }
    }
    
    return result;
}

/**
 * 根据粉丝画像数据生成拆分后的表头
 * 需要遍历所有数据来收集所有可能的子字段
 */
function getSplitFansProfileHeaders(collectItems) {
    const headersMap = {
        '粉丝画像-性别分布': new Set(),
        '粉丝画像-年龄分布': new Set(),
        '粉丝画像-地域分布-按省份': new Set(),
        '粉丝画像-地域分布-按城市': new Set(),
        '粉丝画像-用户设备分布': new Set(),
        '粉丝画像-用户兴趣': new Set(),
    };
    
    for (const item of collectItems) {
        if (!item.collected_data) continue;
        const d = item.collected_data;
        
        for (const fieldKey of Object.keys(headersMap)) {
            const parsed = parseFansProfileString(d[fieldKey] || '');
            for (const [name] of parsed) {
                headersMap[fieldKey].add(name);
            }
        }
    }
    
    // 转换为排序后的数组
    const headers = [];
    for (const [fieldKey, nameSet] of Object.entries(headersMap)) {
        const sortedNames = Array.from(nameSet).sort();
        for (const name of sortedNames) {
            headers.push(`${fieldKey}-${name}`);
        }
    }
    
    return headers;
}

/**
 * 根据拆分后的表头获取对应的值
 */
function getSplitFansProfileValues(data, splitHeaders) {
    const values = [];
    
    // 预解析所有粉丝画像字段
    const parsedData = {
        '粉丝画像-性别分布': {},
        '粉丝画像-年龄分布': {},
        '粉丝画像-地域分布-按省份': {},
        '粉丝画像-地域分布-按城市': {},
        '粉丝画像-用户设备分布': {},
        '粉丝画像-用户兴趣': {},
    };
    
    for (const fieldKey of Object.keys(parsedData)) {
        const parsed = parseFansProfileString(data[fieldKey] || '');
        for (const [name, value] of parsed) {
            parsedData[fieldKey][name] = value;
        }
    }
    
    // 按表头顺序填充值
    for (const header of splitHeaders) {
        // 解析表头获取原始字段和子字段名
        let matched = false;
        for (const fieldKey of Object.keys(parsedData)) {
            if (header.startsWith(fieldKey + '-')) {
                const subName = header.substring(fieldKey.length + 1);
                values.push(parsedData[fieldKey][subName] || '');
                matched = true;
                break;
            }
        }
        if (!matched) {
            values.push('');
        }
    }
    
    return values;
}

function getPerformanceFieldHeaders(fieldPrefix) {
    const headers = [
        `${fieldPrefix}-笔记数`,
        `${fieldPrefix}-内容类目及占比`,
        `${fieldPrefix}-曝光中位数`,
        `${fieldPrefix}-阅读中位数`,
        `${fieldPrefix}-互动中位数`,
        `${fieldPrefix}-中位点赞量`,
        `${fieldPrefix}-中位收藏量`,
        `${fieldPrefix}-中位评论量`,
        `${fieldPrefix}-中位分享量`,
        `${fieldPrefix}-中位关注量`,
        `${fieldPrefix}-互动率`,
        `${fieldPrefix}-图文3秒阅读率`,
        `${fieldPrefix}-千赞笔记比例`,
        `${fieldPrefix}-百赞笔记比例`,
        `${fieldPrefix}-预估CPM`,
        `${fieldPrefix}-预估阅读单价`,
        `${fieldPrefix}-预估互动单价`,
    ];
    
    // 合作笔记添加外溢进店中位数字段
    if (fieldPrefix.includes('合作笔记')) {
        headers.push(`${fieldPrefix}-外溢进店中位数`);
    }
    
    headers.push(
        `${fieldPrefix}-阅读量来源-发现页`,
        `${fieldPrefix}-阅读量来源-搜索页`,
        `${fieldPrefix}-阅读量来源-关注页`,
        `${fieldPrefix}-阅读量来源-博主个人页`,
        `${fieldPrefix}-阅读量来源-附近页`,
        `${fieldPrefix}-阅读量来源-其他`,
        `${fieldPrefix}-曝光量来源-发现页`,
        `${fieldPrefix}-曝光量来源-搜索页`,
        `${fieldPrefix}-曝光量来源-关注页`,
        `${fieldPrefix}-曝光量来源-博主个人页`,
        `${fieldPrefix}-曝光量来源-附近页`,
        `${fieldPrefix}-曝光量来源-其他`,
    );
    
    return headers;
}

function getPerformanceFieldValues(data, fieldPrefix) {
    const values = [
        data[`${fieldPrefix}-笔记数`] || '',
        data[`${fieldPrefix}-内容类目及占比`] || '',
        data[`${fieldPrefix}-曝光中位数`] || '',
        data[`${fieldPrefix}-阅读中位数`] || '',
        data[`${fieldPrefix}-互动中位数`] || '',
        data[`${fieldPrefix}-中位点赞量`] || '',
        data[`${fieldPrefix}-中位收藏量`] || '',
        data[`${fieldPrefix}-中位评论量`] || '',
        data[`${fieldPrefix}-中位分享量`] || '',
        data[`${fieldPrefix}-中位关注量`] || '',
        data[`${fieldPrefix}-互动率`] || '',
        data[`${fieldPrefix}-图文3秒阅读率`] || '',
        data[`${fieldPrefix}-千赞笔记比例`] || '',
        data[`${fieldPrefix}-百赞笔记比例`] || '',
        data[`${fieldPrefix}-预估CPM`] || '',
        data[`${fieldPrefix}-预估阅读单价`] || '',
        data[`${fieldPrefix}-预估互动单价`] || '',
    ];
    
    // 合作笔记添加外溢进店中位数字段
    if (fieldPrefix.includes('合作笔记')) {
        values.push(data[`${fieldPrefix}-外溢进店中位数`] || '');
    }
    
    values.push(
        data[`${fieldPrefix}-阅读量来源-发现页`] || '',
        data[`${fieldPrefix}-阅读量来源-搜索页`] || '',
        data[`${fieldPrefix}-阅读量来源-关注页`] || '',
        data[`${fieldPrefix}-阅读量来源-博主个人页`] || '',
        data[`${fieldPrefix}-阅读量来源-附近页`] || '',
        data[`${fieldPrefix}-阅读量来源-其他`] || '',
        data[`${fieldPrefix}-曝光量来源-发现页`] || '',
        data[`${fieldPrefix}-曝光量来源-搜索页`] || '',
        data[`${fieldPrefix}-曝光量来源-关注页`] || '',
        data[`${fieldPrefix}-曝光量来源-博主个人页`] || '',
        data[`${fieldPrefix}-曝光量来源-附近页`] || '',
        data[`${fieldPrefix}-曝光量来源-其他`] || '',
    );
    
    return values;
}

async function saveToExcel(loadedSettings, selectedFields, saveAll = false) {
    try {
        const XLSX = require('xlsx');
        
        const filename = loadedSettings.local?.filename || 'collected_data.xlsx';
        let savePath = loadedSettings.local?.path || '';
        
        if (!savePath) {
            savePath = await ipcRenderer.invoke('get-documents-path');
        }
        
        const normalizedPath = typeof savePath === 'string' ? savePath.trim() : '';
        let filepath;
        if (normalizedPath && normalizedPath.toLowerCase().endsWith('.xlsx')) {
            // 兼容用户把“保存路径”填成完整文件路径的情况
            filepath = normalizedPath;
        } else {
            filepath = path.join(savePath, filename);
        }
        
        // 确保文件名以.xlsx结尾
        if (!filepath.endsWith('.xlsx')) {
            filepath += '.xlsx';
        }

        // 确保目录存在
        const dir = path.dirname(filepath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        console.log(`保存文件: ${filepath}`);
        console.log(`包含 ${selectedFields.length} 种数据表现字段`);
        console.log(`保存模式: ${saveAll ? '全部' : '仅已完成'}`);
        
        // 基础表头
        const baseHeaders = [
            '博主主页', '达人 ID', '蒲公英主页', '小红书主页',
            '昵称', '健康等级', '性别', '小红书号', '地理位置',
            '粉丝数量', '获赞与收藏', '合作报价-图文笔记',
            '合作报价-视频笔记', '合作报价-最低报价',
            '签约机构', '内容标签', '合作行业',
            // 数据概览字段
            '发布笔记', '内容类目', '数据更新时间',
            '数据概览-笔记数据-日常笔记-曝光中位数', '数据概览-笔记数据-日常笔记-阅读中位数', '数据概览-笔记数据-日常笔记-互动中位数',
            '数据概览-笔记数据-合作笔记-曝光中位数', '数据概览-合作笔记-阅读中位数', '数据概览-笔记数据-合作笔记-互动中位数',
            '数据概览-笔记数据-预估CPM(图文)', '数据概览-笔记数据-预估CPM(视频)',
            '数据概览-笔记数据-预估阅读单价(图文)', '数据概览-笔记数据-预估阅读单价(视频)',
            '数据概览-笔记数据-预估互动单价(图文)', '数据概览-笔记数据-预估互动单价(视频)',
            '数据概览-笔记数据-预估外溢进店单价(图文)', '数据概览-笔记数据-预估外溢进店单价(视频)',
            '近7天活跃天数', '邀约48小时回复率', '粉丝量变化幅度',
        ];
        
        // 根据用户选择添加数据表现字段
        let performanceHeaders = [];
        for (const field of selectedFields) {
            const fieldPrefix = `数据表现-${field}`;
            performanceHeaders = performanceHeaders.concat(getPerformanceFieldHeaders(fieldPrefix));
        }
        
        // 粉丝指标字段（固定）
        const fansMetricsHeaders = [
            '粉丝指标-粉丝增量', '粉丝指标-粉丝量变化幅度', '粉丝指标-活跃粉丝占比', 
            '粉丝指标-阅读粉丝占比', '粉丝指标-互动粉丝占比', '粉丝指标-下单粉丝占比',
        ];
        
        // 根据设置决定粉丝画像字段是否拆分
        const splitFansProfile = loadedSettings.split_fans_profile || false;
        let fansProfileHeaders = [];
        let splitFansProfileHeadersList = [];
        
        if (splitFansProfile) {
            // 拆分模式：动态生成表头
            splitFansProfileHeadersList = getSplitFansProfileHeaders(collectItems);
            fansProfileHeaders = splitFansProfileHeadersList;
            console.log(`粉丝画像字段拆分模式：共 ${splitFansProfileHeadersList.length} 个拆分字段`);
        } else {
            // 原始模式：使用固定表头
            fansProfileHeaders = [
                '粉丝画像-性别分布', '粉丝画像-年龄分布', '粉丝画像-地域分布-按省份', 
                '粉丝画像-地域分布-按城市', '粉丝画像-用户设备分布', '粉丝画像-用户兴趣',
            ];
        }
        
        // 合并所有表头
        const headers = [...baseHeaders, ...performanceHeaders, ...fansMetricsHeaders, ...fansProfileHeaders, '采集时间'];
        
        // 构建数据
        const data = [headers];
        
        for (const item of collectItems) {
            // 根据 saveAll 决定保存范围
            const shouldSave = saveAll ? true : (item.status === '已完成' && item.collected_data);
            if (shouldSave) {
                const d = item.collected_data || {};
                
                // 基础数据行
                const baseRow = [
                    item.pgy_url,
                    item.user_id,
                    item.pgy_url,
                    item.xhs_url,
                    d.name || '',
                    d.currentLevel !== undefined ? d.currentLevel : '',
                    d.gender || '',
                    d.redId || '',
                    d.location || '',
                    d.fansCount || 0,
                    d.likeCollectCountInfo || 0,
                    d.picturePrice || 0,
                    d.videoPrice || 0,
                    d.lowerPrice || 0,
                    d.noteSign || '',
                    d.contentTags || '',
                    d.tradeType || '',
                    d.noteNumber || '',
                    d.noteType || '',
                    d.dateKey || '',
                    d.daily_mAccumImpNum || '',
                    d.daily_mValidRawReadFeedNum || '',
                    d.daily_mEngagementNum || '',
                    d.coop_mAccumImpNum || '',
                    d.coop_mValidRawReadFeedNum || '',
                    d.coop_mEngagementNum || '',
                    d.estimatePictureCpm || '',
                    d.estimateVideoCpm || '',
                    d.picReadCost || '',
                    d.videoReadCostV2 || '',
                    d.estimatePictureEngageCost || '',
                    d.estimateVideoEngageCost || '',
                    d.estimatePictureCpuv || '',
                    d.estimateVideoCpuv || '',
                    d.activeDayInLast7 || '',
                    d.responseRate || '',
                    d.fans30GrowthBeyondRate || '',
                ];
                
                // 数据表现字段的值
                let performanceValues = [];
                for (const field of selectedFields) {
                    const fieldPrefix = `数据表现-${field}`;
                    performanceValues = performanceValues.concat(getPerformanceFieldValues(d, fieldPrefix));
                }
                
                // 粉丝指标数据（固定）
                const fansMetricsValues = [
                    d['粉丝指标-粉丝增量'] || '',
                    d['粉丝指标-粉丝量变化幅度'] || '',
                    d['粉丝指标-活跃粉丝占比'] || '',
                    d['粉丝指标-阅读粉丝占比'] || '',
                    d['粉丝指标-互动粉丝占比'] || '',
                    d['粉丝指标-下单粉丝占比'] || '',
                ];
                
                // 粉丝画像数据（根据设置决定是否拆分）
                let fansProfileValues = [];
                if (splitFansProfile) {
                    // 拆分模式：按拆分后的表头获取值
                    fansProfileValues = getSplitFansProfileValues(d, splitFansProfileHeadersList);
                } else {
                    // 原始模式：使用原始值
                    fansProfileValues = [
                        d['粉丝画像-性别分布'] || '',
                        d['粉丝画像-年龄分布'] || '',
                        d['粉丝画像-地域分布-按省份'] || '',
                        d['粉丝画像-地域分布-按城市'] || '',
                        d['粉丝画像-用户设备分布'] || '',
                        d['粉丝画像-用户兴趣'] || '',
                    ];
                }
                
                // 合并所有行数据
                const row = [...baseRow, ...performanceValues, ...fansMetricsValues, ...fansProfileValues, item.collect_time || ''];
                data.push(row);
            }
        }
        
        // 创建工作簿
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, '采集数据');
        
        // 保存文件
        XLSX.writeFile(wb, filepath);
        
        showToast('success', '保存成功', `数据已保存到: ${filepath}`);
    } catch (err) {
        showToast('error', '保存失败', `无法保存文件: ${err.message}`);
    }
}

async function clearCollectList() {
    if (collectItems.length === 0) {
        showToast('info', '提示', '列表已经是空的');
        return;
    }
    
    if (isCollecting) {
        showToast('warning', '提示', '正在采集中，无法清空列表');
        return;
    }
    
    const confirmed = await showConfirm('确认清空', '确定要清空采集列表吗？此操作不可撤销。');
    if (confirmed) {
        collectItems = [];
        renderCollectTable();
        showToast('success', '已清空', '采集列表已清空');
    }
}

async function manualSaveExcel() {
    // 检查是否有采集数据
    const completedItems = collectItems.filter(item => item.status === '已完成' && item.collected_data);
    const allItems = collectItems.filter(item => item.collected_data);
    
    if (allItems.length === 0 && completedItems.length === 0) {
        showToast('warning', '提示', '没有可保存的采集数据');
        return;
    }
    
    // 弹出选择对话框
    const content = `
        <p style="margin-bottom: 15px; color: #666;">请选择保存范围：</p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
            <label style="display: flex; align-items: center; cursor: pointer;">
                <input type="radio" name="save-mode" value="completed" checked style="margin-right: 8px;">
                <span>仅保存已完成 (${completedItems.length} 条)</span>
            </label>
            <label style="display: flex; align-items: center; cursor: pointer;">
                <input type="radio" name="save-mode" value="all" style="margin-right: 8px;">
                <span>保存全部 (${collectItems.length} 条，含未采集)</span>
            </label>
        </div>
    `;
    
    const result = await showModal('保存Excel', content, [
        { text: '取消', value: false },
        { text: '保存', value: true, primary: true }
    ], () => {
        const selected = document.querySelector('input[name="save-mode"]:checked');
        return selected ? selected.value : 'completed';
    });
    
    if (!result || !result.confirmed) return;
    
    const saveMode = result.data || 'completed';
    
    // 加载设置获取选择的字段
    const loadedSettings = await loadJsonData(SETTINGS_FILE, null);
    const selectedFields = loadedSettings?.performance_fields || [];
    
    await saveToExcel(loadedSettings, selectedFields, saveMode === 'all');
}

function initCollectPage() {
    document.getElementById('excel-import-btn').addEventListener('click', importFromExcel);
    document.getElementById('text-import-btn').addEventListener('click', importFromText);
    document.getElementById('txt-import-btn').addEventListener('click', importFromTxt);
    document.getElementById('start-collect-btn').addEventListener('click', startCollect);
    document.getElementById('pause-collect-btn').addEventListener('click', pauseCollect);
    document.getElementById('stop-collect-btn').addEventListener('click', stopCollect);
    document.getElementById('clear-list-btn').addEventListener('click', clearCollectList);
    document.getElementById('save-excel-btn').addEventListener('click', manualSaveExcel);
    renderCollectTable();
}

// ==================== 达人列表功能 ====================

let bloggerList = [];
let isFetchingBloggers = false;
let capturedBloggerRequest = null;

// 监听请求捕获事件
ipcRenderer.on('blogger-request-captured', () => {
    capturedBloggerRequest = true;
    document.getElementById('start-fetch-btn').disabled = false;
    document.getElementById('fetch-status').textContent = '已捕获请求，可以开始获取';
    document.getElementById('fetch-status').style.color = '#28a745';
});

function formatFansNum(num) {
    if (num >= 10000) {
        return (num / 10000).toFixed(1) + 'w';
    }
    return num.toString();
}

// 打开博主详情页
async function openBloggerDetail(userId) {
    const validAccount = accounts.find(acc => acc.status === '正常');
    if (!validAccount) {
        showToast('error', '错误', '没有可用的账号');
        return;
    }
    
    const url = `https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/${userId}`;
    await ipcRenderer.invoke('open-blogger-detail', url, validAccount.cookies);
}

function renderBloggerTable() {
    const tbody = document.getElementById('blogger-list-tbody');
    
    if (bloggerList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: #999;">
                    暂无数据，请先打开博主广场并在浏览器中操作
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = bloggerList.map((blogger, index) => `
        <tr>
            <td>${index + 1}</td>
            <td style="max-width: 200px;">
                <a href="#" 
                   onclick="openBloggerDetail('${blogger.userId}'); return false;"
                   style="color: #007bff; text-decoration: none; word-break: break-all; cursor: pointer; display: block; line-height: 1.4;">
                    https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/${blogger.userId}
                </a>
            </td>
            <td style="max-width: 200px;">
                <a href="https://www.xiaohongshu.com/user/profile/${blogger.userId}" 
                   target="_blank"
                   style="color: #007bff; text-decoration: none; word-break: break-all; display: block; line-height: 1.4;">
                    https://www.xiaohongshu.com/user/profile/${blogger.userId}
                </a>
            </td>
            <td>${blogger.name || '-'}</td>
            <td>${blogger.location || '-'}</td>
            <td>${(blogger.personalTags || []).join('、') || '-'}</td>
            <td>${(blogger.featureTags || []).join('、') || '-'}</td>
            <td>${blogger.gender || '-'}</td>
            <td>${blogger.fansNum || 0}</td>
            <td>${formatFansWan(blogger.fansNum || 0)}</td>
            <td>${blogger.readMidCoop30 || 0}</td>
            <td>${blogger.interMidCoop30 || 0}</td>
            <td>${blogger.mcpuvNum30d || 0}</td>
            <td>${formatPrice(blogger.picturePrice)}</td>
            <td>${formatPrice(blogger.videoPrice)}</td>
        </tr>
    `).join('');
}

// 格式化粉丝数为万
function formatFansWan(num) {
    if (!num || num === 0) return '0';
    return (num / 10000).toFixed(2) + '万';
}

// 格式化报价
function formatPrice(price) {
    if (!price || price === 0) return '-';
    return '¥' + price.toFixed(0);
}

async function openBloggerBrowser() {
    // 获取有效账号
    const validAccount = accounts.find(acc => acc.status === '正常');
    if (!validAccount) {
        showToast('error', '错误', '没有可用的账号，请先在账号管理中添加并验证账号');
        return;
    }
    
    capturedBloggerRequest = null;
    document.getElementById('start-fetch-btn').disabled = true;
    document.getElementById('fetch-status').textContent = '请在浏览器中操作，系统会自动捕获请求...';
    document.getElementById('fetch-status').style.color = '#666';
    
    const result = await ipcRenderer.invoke('open-blogger-browser', validAccount.cookies);
    if (result.success) {
        showToast('info', '提示', '浏览器窗口已打开，请在博主广场中进行筛选操作');
    } else {
        showToast('error', '错误', result.message);
    }
}

async function startFetchBloggers() {
    const capturedReq = await ipcRenderer.invoke('get-captured-request');
    if (!capturedReq || !capturedReq.body) {
        showToast('error', '错误', '未捕获到有效请求，请在浏览器中重新操作');
        return;
    }
    
    isFetchingBloggers = true;
    document.getElementById('start-fetch-btn').disabled = true;
    document.getElementById('stop-fetch-btn').disabled = false;
    document.getElementById('open-browser-btn').disabled = true;
    document.getElementById('max-pages-input').disabled = true;
    
    const pageSize = capturedReq.body.pageSize || 20;
    const maxPages = parseInt(document.getElementById('max-pages-input').value) || 500;
    let currentPage = 1;
    let totalFetched = 0;
    
    while (isFetchingBloggers && currentPage <= maxPages) {
        document.getElementById('fetch-status').textContent = `正在获取第 ${currentPage}/${maxPages} 页，已有 ${bloggerList.length} 条数据...`;
        document.getElementById('fetch-status').style.color = '#007bff';
        
        const result = await ipcRenderer.invoke('fetch-blogger-list', currentPage, capturedReq);
        
        if (!isFetchingBloggers) break;
        
        if (result.success) {
            const newBloggers = result.data;
            if (newBloggers.length === 0) {
                showToast('info', '完成', `已获取全部数据，共 ${bloggerList.length} 条`);
                break;
            }
            
            // 去重添加
            for (const blogger of newBloggers) {
                if (!bloggerList.find(b => b.userId === blogger.userId)) {
                    bloggerList.push(blogger);
                    totalFetched++;
                }
            }
            
            // 每页都实时渲染表格
            renderBloggerTable();
            
            // 达到用户设定的最大页数
            if (currentPage >= maxPages) {
                showToast('success', '完成', `已达到设定页数 ${maxPages} 页，共 ${bloggerList.length} 条`);
                break;
            }
            
            currentPage++;
            
            // 添加延迟避免请求过快
            await sleep(500);
        } else {
            showToast('error', '错误', `第 ${currentPage} 页获取失败: ${result.message}`);
            // 失败后等待一段时间再重试
            await sleep(2000);
        }
    }
    
    // 最后完整渲染一次
    renderBloggerTable();
    
    isFetchingBloggers = false;
    document.getElementById('start-fetch-btn').disabled = false;
    document.getElementById('stop-fetch-btn').disabled = true;
    document.getElementById('open-browser-btn').disabled = false;
    document.getElementById('max-pages-input').disabled = false;
    document.getElementById('fetch-status').textContent = `获取完成，共 ${bloggerList.length} 条数据`;
    document.getElementById('fetch-status').style.color = '#28a745';
}

function stopFetchBloggers() {
    isFetchingBloggers = false;
    document.getElementById('max-pages-input').disabled = false;
    document.getElementById('fetch-status').textContent = '已停止获取';
    document.getElementById('fetch-status').style.color = '#dc3545';
}

function clearBloggerList() {
    bloggerList = [];
    renderBloggerTable();
    showToast('success', '成功', '达人列表已清空');
}

async function exportBloggerExcel() {
    if (bloggerList.length === 0) {
        showToast('warning', '提示', '没有可导出的数据');
        return;
    }
    
    const result = await ipcRenderer.invoke('select-save-path', {
        title: '保存达人列表',
        defaultPath: `达人列表_${new Date().toISOString().slice(0, 10)}.xlsx`,
        filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
    });
    
    if (!result) return;
    
    try {
        const XLSX = require('xlsx');
        
        // 准备数据
        const data = [
            ['蒲公英主页', '小红书主页', '达人昵称', '归属地', '个人标签', '内容标签', '性别', 
             '粉丝数', '粉丝数-万', '阅读中位数(合作)', '互动中位数(合作)', 
             '外溢进店中位数', '图文报价', '视频报价']
        ];
        
        bloggerList.forEach((blogger) => {
            const fansWan = blogger.fansNum ? (blogger.fansNum / 10000).toFixed(2) : 0;
            const picPrice = blogger.picturePrice || 0;
            const vidPrice = blogger.videoPrice || 0;
            
            data.push([
                `https://pgy.xiaohongshu.com/solar/pre-trade/blogger-detail/${blogger.userId}`,
                `https://www.xiaohongshu.com/user/profile/${blogger.userId}`,
                blogger.name || '',
                blogger.location || '',
                (blogger.personalTags || []).join('、'),
                (blogger.featureTags || []).join('、'),
                blogger.gender || '',
                blogger.fansNum || 0,
                fansWan,
                blogger.readMidCoop30 || 0,
                blogger.interMidCoop30 || 0,
                blogger.mcpuvNum30d || 0,
                picPrice,
                vidPrice
            ]);
        });
        
        // 创建工作簿和工作表
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet(data);
        
        // 设置列宽
        worksheet['!cols'] = [
            { wch: 60 },  // 蒲公英主页
            { wch: 50 },  // 小红书主页
            { wch: 15 },  // 达人昵称
            { wch: 10 },  // 归属地
            { wch: 25 },  // 个人标签
            { wch: 25 },  // 内容标签
            { wch: 8 },   // 性别
            { wch: 12 },  // 粉丝数
            { wch: 12 },  // 粉丝数-万
            { wch: 15 },  // 阅读中位数(合作)
            { wch: 15 },  // 互动中位数(合作)
            { wch: 15 },  // 外溢进店中位数
            { wch: 12 },  // 图文报价
            { wch: 12 }   // 视频报价
        ];
        
        XLSX.utils.book_append_sheet(workbook, worksheet, '达人列表');
        XLSX.writeFile(workbook, result);
        
        showToast('success', '成功', `已导出 ${bloggerList.length} 条数据`);
    } catch (e) {
        showToast('error', '错误', `导出失败: ${e.message}`);
    }
}

function initBloggerListPage() {
    document.getElementById('open-browser-btn').addEventListener('click', openBloggerBrowser);
    document.getElementById('start-fetch-btn').addEventListener('click', startFetchBloggers);
    document.getElementById('stop-fetch-btn').addEventListener('click', stopFetchBloggers);
    document.getElementById('clear-blogger-list-btn').addEventListener('click', clearBloggerList);
    document.getElementById('export-blogger-btn').addEventListener('click', exportBloggerExcel);
    renderBloggerTable();
}

// ==================== 启动免责声明 ====================

function showDisclaimerModal() {
    return new Promise((resolve) => {
        const container = document.getElementById('modal-container');
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.background = 'rgba(0, 0, 0, 0.7)';
        
        overlay.innerHTML = `
            <div class="modal" style="max-width: 500px;">
                <div class="modal-header" style="font-size: 18px; font-weight: 600;">软件使用免责声明</div>
                <div class="modal-body" style="padding: 20px;">
                    <div style="line-height: 1.8; color: #555;">
                        <p style="margin-bottom: 12px;">本软件仅支持采集小红书蒲公英公开达人主页信息，不获取非公开数据。</p>
                        <p style="margin-bottom: 12px;">使用者需遵守相关法律法规及平台规则，严禁违规使用软件。</p>
                        <p style="margin-bottom: 12px;">因违规使用导致的法律责任、第三方索赔等，均由使用者自行承担，与开发者无关。</p>
                        <p style="font-weight: 600; color: #333;">您使用本软件即视为同意本声明全部条款。</p>
                    </div>
                </div>
                <div class="modal-footer" style="justify-content: center; gap: 20px;">
                    <button class="btn btn-secondary" id="disclaimer-reject" style="min-width: 100px;">拒绝</button>
                    <button class="btn btn-primary" id="disclaimer-accept" style="min-width: 100px;">接受声明</button>
                </div>
            </div>
        `;
        
        container.appendChild(overlay);
        
        document.getElementById('disclaimer-accept').addEventListener('click', () => {
            overlay.remove();
            resolve(true);
        });
        
        document.getElementById('disclaimer-reject').addEventListener('click', () => {
            overlay.remove();
            resolve(false);
        });
    });
}

// ==================== 授权信息页面 ====================

async function loadLicenseInfo() {
    try {
        // 获取机器码
        const machineCode = await ipcRenderer.invoke('get-machine-code');
        document.getElementById('license-machine-code').textContent = machineCode;
        
        // 获取授权信息
        const licenseInfo = await ipcRenderer.invoke('get-license-info');
        
        if (licenseInfo) {
            // 更新全局会员等级
            currentMemberLevel = licenseInfo.member_level;
            
            document.getElementById('license-key').textContent = licenseInfo.license_key || '未激活';
            
            const levelEl = document.getElementById('license-level');
            const level = licenseInfo.member_level || '-';
            levelEl.textContent = getLevelDisplayName(level);
            levelEl.className = 'license-value license-level ' + level.toLowerCase();
            
            document.getElementById('license-expire').textContent = 
                licenseInfo.expire_at ? new Date(licenseInfo.expire_at).toLocaleString('zh-CN') : '-';
            document.getElementById('license-days').textContent = 
                licenseInfo.days_remaining !== undefined ? licenseInfo.days_remaining + ' 天' : '-';
        } else {
            currentMemberLevel = null;
            document.getElementById('license-key').textContent = '未激活';
            document.getElementById('license-level').textContent = '-';
            document.getElementById('license-level').className = 'license-value license-level';
            document.getElementById('license-expire').textContent = '-';
            document.getElementById('license-days').textContent = '-';
        }
    } catch (e) {
        console.error('加载授权信息失败:', e);
    }
}

function getLevelDisplayName(level) {
    const names = {
        'VIP': 'VIP (会员)',
        'VVIP': 'VVIP (高级会员)',
        'SVIP': 'SVIP (超级会员)'
    };
    return names[level] || level;
}

function initLicensePage() {
    // 复制机器码按钮
    document.getElementById('copy-machine-code-btn').addEventListener('click', () => {
        const machineCode = document.getElementById('license-machine-code').textContent;
        navigator.clipboard.writeText(machineCode).then(() => {
            showToast('success', '复制成功', '机器码已复制到剪贴板');
        }).catch(() => {
            showToast('error', '复制失败', '无法访问剪贴板');
        });
    });
    
    // 复制授权码按钮
    document.getElementById('copy-license-key-btn').addEventListener('click', () => {
        const licenseKey = document.getElementById('license-key').textContent;
        if (licenseKey && licenseKey !== '未激活') {
            navigator.clipboard.writeText(licenseKey).then(() => {
                showToast('success', '复制成功', '授权码已复制到剪贴板');
            }).catch(() => {
                showToast('error', '复制失败', '无法访问剪贴板');
            });
        } else {
            showToast('warning', '提示', '暂无授权码可复制');
        }
    });
    
    // 解绑授权码按钮
    document.getElementById('unbind-license-btn').addEventListener('click', async () => {
        const confirmed = await showConfirm('解绑授权码', '确定要解绑当前授权码吗？\n\n解绑后软件将退出，需要重新输入授权码激活。');
        if (confirmed) {
            const result = await ipcRenderer.invoke('unbind-license');
            if (result.success) {
                showToast('success', '解绑成功', '正在退出软件...');
                setTimeout(() => {
                    ipcRenderer.invoke('quit-app');
                }, 1500);
            } else {
                showToast('error', '解绑失败', result.message);
            }
        }
    });
    
    // 更换授权码按钮
    document.getElementById('change-license-btn').addEventListener('click', async () => {
        const result = await showModal('更换授权码', `
            <div class="form-group">
                <label style="display: block; margin-bottom: 8px; font-weight: 500;">请输入新的授权码</label>
                <input type="text" id="new-license-key" class="input" placeholder="XXXX-XXXX-XXXX-XXXX" style="width: 100%; text-transform: uppercase;">
            </div>
            <p style="font-size: 12px; color: #999; margin-top: 10px;">
                更换后原授权码将被解绑，新授权码将绑定到当前设备。
            </p>
        `, [
            { text: '取消', value: false },
            { text: '确定更换', value: true, primary: true }
        ], () => {
            return document.getElementById('new-license-key').value.trim();
        });
        
        if (result && result.confirmed && result.data) {
            const newKey = result.data.toUpperCase();
            if (!newKey) {
                showToast('warning', '提示', '请输入授权码');
                return;
            }
            
            // 先清除本地数据
            await ipcRenderer.invoke('unbind-license');
            
            // 激活新授权码
            const activateResult = await ipcRenderer.invoke('activate-license', newKey, true);
            if (activateResult.success) {
                showToast('success', '更换成功', '授权码已更换');
                loadLicenseInfo();
            } else if (activateResult.code === 'ALREADY_ACTIVATED') {
                // 询问是否解绑原设备
                const forceConfirmed = await showConfirm('授权码已被使用', '该授权码已绑定到其他设备。\n\n确定要解绑原设备并绑定到当前设备吗？');
                if (forceConfirmed) {
                    const forceResult = await ipcRenderer.invoke('activate-license', newKey, true);
                    if (forceResult.success) {
                        showToast('success', '更换成功', '授权码已更换');
                        loadLicenseInfo();
                    } else {
                        showToast('error', '更换失败', forceResult.message);
                    }
                }
            } else {
                showToast('error', '更换失败', activateResult.message);
            }
        }
    });
    
    // 初始加载授权信息和会员等级
    loadLicenseInfo();
}

// 初始化会员等级 (启动时调用)
async function initMemberLevel() {
    try {
        const licenseInfo = await ipcRenderer.invoke('get-license-info');
        if (licenseInfo) {
            currentMemberLevel = licenseInfo.member_level;
            console.log('当前会员等级:', currentMemberLevel);
        }
    } catch (e) {
        console.error('获取会员等级失败:', e);
    }
}

// ==================== 初始化 ====================

document.addEventListener('DOMContentLoaded', async () => {
    // 显示免责声明弹窗
    const accepted = await showDisclaimerModal();
    if (!accepted) {
        // 用户拒绝，关闭应用
        await ipcRenderer.invoke('quit-app');
        return;
    }
    
    // 先初始化应用路径
    await initAppPath();
    console.log('应用路径:', appPath);
    console.log('数据目录:', path.join(appPath, DATA_DIR));
    
    // 先初始化会员等级 (用于权限控制)
    await initMemberLevel();
    
    initNavigation();
    initAccountPage();
    initSettingsPage();
    initCollectPage();
    initBloggerListPage();
    initLicensePage();
});
