/**
 * 博主信息采集API模块
 * 移植自 Python 版本的 blogger_api.py
 */

const https = require('https');
const crypto = require('crypto');

// ==================== 签名相关函数 ====================

const lookup = ["Z", "m", "s", "e", "r", "b", "B", "o", "H", "Q", "t", "N", "P", "+", "w", "O", "c", "z", "a", "/", "L", "p", "n", "g", "G", "8", "y", "J", "q", "4", "2", "K", "W", "Y", "j", "0", "D", "S", "f", "d", "i", "k", "x", "3", "V", "T", "1", "6", "I", "l", "U", "A", "F", "M", "9", "7", "h", "E", "C", "v", "u", "R", "X", "5"];

function MD5(res) {
    return crypto.createHash('md5').update(res).digest('hex');
}

function encodeChunk(e, t, n) {
    for (var r, o = [], i = t; i < n; i += 3)
        r = (e[i] << 16 & 16711680) + (e[i + 1] << 8 & 65280) + (255 & e[i + 2]),
            o.push(tripletToBase64(r));
    return o.join("")
}

function tripletToBase64(e) {
    return lookup[e >> 18 & 63] + lookup[e >> 12 & 63] + lookup[e >> 6 & 63] + lookup[63 & e]
}

function encrypt_sign(e, t) {
    var n = "A4NjFqYu5wPHsO0XTdDgMa2r1ZQocVte9UJBvk6/7=yRnhISGKblCWi+LpfE8xzm3"
        , r = "test"
        , o = (new Date).getTime()
    var a = "[object Object]" === Object.prototype.toString.call(t) || "[object Array]" === Object.prototype.toString.call(t);
    return {
        "X-s": function (e) {
            var t, r, o, i, a, s, l, c = "", u = 0;
            for (e = function (e) {
                e = e.replace(/\r\n/g, "\n");
                for (var t = "", n = 0; n < e.length; n++) {
                    var r = e.charCodeAt(n);
                    r < 128 ? t += String.fromCharCode(r) : r > 127 && r < 2048 ? (t += String.fromCharCode(r >> 6 | 192),
                        t += String.fromCharCode(63 & r | 128)) : (t += String.fromCharCode(r >> 12 | 224),
                        t += String.fromCharCode(r >> 6 & 63 | 128),
                        t += String.fromCharCode(63 & r | 128))
                }
                return t
            }(e); u < e.length;)
                i = (t = e.charCodeAt(u++)) >> 2,
                    a = (3 & t) << 4 | (r = e.charCodeAt(u++)) >> 4,
                    s = (15 & r) << 2 | (o = e.charCodeAt(u++)) >> 6,
                    l = 63 & o,
                    isNaN(r) ? s = l = 64 : isNaN(o) && (l = 64),
                    c = c + n.charAt(i) + n.charAt(a) + n.charAt(s) + n.charAt(l);
            return c
        }(MD5([o, r, e, a ? JSON.stringify(t) : ""].join(""))),
        "X-t": o
    }
}

function encodeUtf8(e) {
    for (var t = encodeURIComponent(e), n = [], r = 0; r < t.length; r++) {
        var o = t.charAt(r);
        if ("%" === o) {
            var i = t.charAt(r + 1) + t.charAt(r + 2)
                , a = parseInt(i, 16);
            n.push(a),
                r += 2
        } else
            n.push(o.charCodeAt(0))
    }
    return n
}

function b64Encode(e) {
    for (var t, n = e.length, r = n % 3, o = [], i = 16383, a = 0, s = n - r; a < s; a += i)
        o.push(encodeChunk(e, a, a + i > s ? s : a + i));
    return 1 === r ? (t = e[n - 1],
        o.push(lookup[t >> 2] + lookup[t << 4 & 63] + "==")) : 2 === r && (t = (e[n - 2] << 8) + e[n - 1],
        o.push(lookup[t >> 10] + lookup[t >> 4 & 63] + lookup[t << 2 & 63] + "=")),
        o.join("")
}

var mcr = function (e) {
    for (var t, n, r = 3988292384, o = 256, i = []; o--; i[o] = t >>> 0)
        for (n = 8, t = o; n--;)
            t = 1 & t ? t >>> 1 ^ r : t >>> 1;
    return function (e) {
        if ("string" == typeof e) {
            for (var t = 0, n = -1; t < e.length; ++t)
                n = i[255 & n ^ e.charCodeAt(t)] ^ n >>> 8;
            return ~n ^ r
        }
        for (t = 0, n = -1; t < e.length; ++t)
            n = i[255 & n ^ e[t]] ^ n >>> 8;
        return ~n ^ r
    }
}()

function xsCommon(a1) {
    try {
        var u = "I38rHdgsjopgIvesdVwgIC+oIELmBZ5e3VwXLgFTIxS3bqwErFeexd0ekncAzMFYnqthIhJeSBMDKutRI3KsYorWHPtGrbV0P9WfIi/eWc6eYqtyQApPI37ekmR6QL+5Ii6sdneeSfqYHqwl2qt5B0DBIx+PGDi/sVtkIxdsxuwr4qtiIhuaIE3e3LV0I3VTIC7e0utl2ADmsLveDSKsSPw5IEvsiVtJOqw8BuwfPpdeTFWOIx4TIiu6ZPwrPut5IvlaLbgs3qtxIxes1VwHIkumIkIyejgsY/WTge7eSqte/D7sDcpipedeYrDtIC6eDVw2IENsSqtlnlSuNjVtIvoekqt3cZ7sVo4gIESyIhE2HfquIxhnqz8gIkIfoqwkICqWJ73sdlOeVPw3IvAe0fgedfVtIi5s3IcA2utAIiKsidvekZNeTPt4nAOeWPwEIvkLcA0eSuwuLB/sDqweI3RrIxE5Luwwaqw+rekhZANe1MNe0PwjIveskDoeSmrvIiAsfI/sxBidIkve3PwlIhQk2VtqOqt1IxesTVtjIk0siqwdIh/sjut3wutnsPw5ICclI3l4wA4jwIAsWVw4IE4qIhOsSqtZBbTt/A0ejjp1IkGPGutKoqw3I3OexqtYQL5eicAs3phwIhos3BOs3utscPwaICJsWPwUIigekeqLIxKsSedsSuwFIv3eiqt5Q0ioI3RPIx0ekl5s306sWjJe1qwMICQqIEqmqqw9IiHKIxOeSe88pMKeiVw6IxHIqPwmodveVANsxVtNaVtcI3PiIhp2mutyrqwHI3OsfI6e1uwmpqtnIhSNbutlIxcrm/c9Ii/sfdosS9geVPwttPtNIiVcI3AsfqtYIEAe0SYxIv+aez8GIvpBICde1PwSaqtz+qtMIkPIIhes3AAe6PwlprFMICF4yqtmZVtQIxDwI38ZIi+fIh/e3rvskbkUwVwGIvI68PwaoqwMIE3ekfPkIkZf/B7eDVtpHPtW+AiieduWIkMkguwRIx6sWeY9IxQMPuwqI3MeQPtSrPtWIEP6IvzlICzgZPwDIiLKIhosxuw6sjmFIEG4IC6sfn3s3qwXIv4BIELEalIYIvMS/lh4Ihes0L0eDqwJIE3sxqtwICWgIC/sSuw4Iv+bQqwlIC/sklWmpqteePtPIv6eYqtoIhAsS9bYIE5sDrKsVPtew00s0VwHoMdsfVt4IxesiYKeTVtoIhH3IkTvePwNObRtI36sduwsr/ee6SM7",
            p = {
                s0: 5,
                s1: "",
                x0: "1",
                x1: "4.1.4",
                x2: "Windows",
                x3: "ratlin-shell",
                x4: "0.0.971",
                x5: a1,
                x6: "",
                x7: "",
                x8: u,
                x9: mcr(u),
                x10: 0,
                x11: "lite"
            }
        return b64Encode(encodeUtf8(JSON.stringify(p)))
    } catch (v) {
    }
    return null
}

function getSignHeaders(url, body, cookies) {
    // 从 cookies 中提取 a1
    const match = cookies.match(/a1=([^;]+)/);
    const a1Value = match ? match[1] : null;
    
    const urlObj = new URL(url);
    let x1_data = urlObj.pathname;
    if (urlObj.searchParams.toString()) {
        x1_data += urlObj.search;
    }
    if (body !== null && body !== undefined && body !== "") {
        try {
            body = JSON.stringify(JSON.parse(body));
        } catch (e) {
            body = JSON.stringify(body);
        }
        x1_data = x1_data + body;
    }
    
    const sign = encrypt_sign(x1_data);
    return {
        "X-S-Common": xsCommon(a1Value),
        "X-S": sign["X-s"],
        "X-T": sign["X-t"].toString(),
    }
}

// ==================== HTTP 请求函数 ====================

function makeRequest(options, postData = null) {
    return new Promise((resolve) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                resolve({ statusCode: res.statusCode, data });
            });
        });
        
        req.on('error', (e) => {
            resolve({ statusCode: 0, error: e.message });
        });
        
        req.on('timeout', () => {
            req.destroy();
            resolve({ statusCode: 0, error: '请求超时' });
        });
        
        if (postData) {
            req.write(postData);
        }
        req.end();
    });
}

/**
 * 随机化 cookies 中的 webId
 * webId 是一个 32 位的十六进制字符串
 */
function randomizeWebId(cookies) {
    return cookies.replace(/webId=([a-f0-9]+)/i, (match, webId) => {
        // 生成同位数的随机十六进制字符串
        const length = webId.length;
        let randomId = '';
        for (let i = 0; i < length; i++) {
            randomId += Math.floor(Math.random() * 16).toString(16);
        }
        return `webId=${randomId}`;
    });
}

function getRequestOptions(url, cookies, method = 'GET', body = null) {
    const urlObj = new URL(url);
    
    // 随机化 webId
    const randomizedCookies = randomizeWebId(cookies);
    
    const signHeaders = getSignHeaders(url, body, randomizedCookies);
    
    return {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: method,
        headers: {
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'zh-CN,zh;q=0.9',
            'referer': 'https://pgy.xiaohongshu.com/solar/pre-trade/home',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
            'Content-Type': 'application/json;charset=UTF-8',
            'Cookie': randomizedCookies,
            'Host': urlObj.hostname,
            'Connection': 'keep-alive',
            ...signHeaders
        },
        timeout: 10000
    };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带重试机制的请求包装函数
 * @param {Function} requestFn - 请求函数
 * @param {number} maxRetries - 最大重试次数
 * @param {number} retryDelay - 重试延迟(ms)
 */
async function withRetry(requestFn, maxRetries = 3, retryDelay = 500) {
    let lastResult = null;
    
    for (let retryCount = 0; retryCount < maxRetries; retryCount++) {
        const result = await requestFn();
        lastResult = result;
        
        // 如果成功，直接返回
        if (result.success) {
            return result;
        }
        
        // 如果是406错误（数据不可用），进行重试
        if (result.message && result.message.includes('406')) {
            if (retryCount < maxRetries - 1) {
                console.log(`[API] 406错误重试 ${retryCount + 1}/${maxRetries}`);
                await sleep(retryDelay);
                continue;
            }
        }
        
        // 其他错误不重试
        break;
    }
    
    return lastResult;
}

// ==================== API 接口函数 ====================

/**
 * 获取博主个人信息
 */
async function getBloggerInfo(userId, cookies) {
    return withRetry(async () => {
        const url = `https://pgy.xiaohongshu.com/api/solar/cooperator/user/blogger/${userId}`;
        const options = getRequestOptions(url, cookies);
        
        try {
            const response = await makeRequest(options);
            
            if (response.statusCode === 200) {
                const result = JSON.parse(response.data);
                if (result.code === 0 && result.success) {
                    const rawData = result.data || {};
                    
                    // 处理内容标签
                    let contentTags = [];
                    if (rawData.contentTags) {
                        for (const tag of rawData.contentTags) {
                            const taxonomy2Tags = tag.taxonomy2Tags || [];
                            contentTags = contentTags.concat(taxonomy2Tags);
                        }
                    }
                    const contentTagsStr = contentTags.join(', ');
                    
                    // 处理签约机构
                    const noteSign = rawData.noteSign;
                    const noteSignName = noteSign ? noteSign.name || '' : '';
                    
                    return {
                        success: true,
                        message: '采集成功',
                        data: {
                            name: rawData.name || '',
                            gender: rawData.gender || '',
                            redId: rawData.redId || '',
                            location: rawData.location || '',
                            fansCount: rawData.fansCount || 0,
                            likeCollectCountInfo: rawData.likeCollectCountInfo || 0,
                            picturePrice: rawData.picturePrice || 0,
                            videoPrice: rawData.videoPrice || 0,
                            lowerPrice: rawData.lowerPrice || 0,
                            noteSign: noteSignName,
                            contentTags: contentTagsStr,
                            tradeType: rawData.tradeType || '',
                        }
                    };
                } else {
                    return { success: false, message: `接口返回错误: ${result.msg || '未知错误'}` };
                }
            } else {
                return { success: false, message: `HTTP错误: ${response.statusCode}` };
            }
        } catch (e) {
            return { success: false, message: `请求异常: ${e.message}` };
        }
    });
}

/**
 * 获取数据概览
 */
async function getDataSummary(userId, cookies) {
    try {
        // 获取 business=0 的数据（日常笔记）
        const result0 = await fetchDataSummary(userId, 0, cookies);
        if (!result0.success) {
            return { success: false, message: `获取日常笔记数据失败: ${result0.message}` };
        }
        
        // 获取 business=1 的数据（合作笔记）
        const result1 = await fetchDataSummary(userId, 1, cookies);
        if (!result1.success) {
            return { success: false, message: `获取合作笔记数据失败: ${result1.message}` };
        }
        
        return {
            success: true,
            message: '数据概览采集成功',
            data: { ...result0.data, ...result1.data }
        };
    } catch (e) {
        return { success: false, message: `数据概览采集异常: ${e.message}` };
    }
}

async function fetchDataSummary(userId, business, cookies) {
    return withRetry(async () => {
        const url = `https://pgy.xiaohongshu.com/api/pgy/kol/data/data_summary?userId=${userId}&business=${business}`;
        const options = getRequestOptions(url, cookies);
        
        try {
            const response = await makeRequest(options);
            
            if (response.statusCode === 200) {
                const result = JSON.parse(response.data);
                if (result.code === 0 && result.success) {
                    const rawData = result.data || {};
                    
                    if (business === 0) {
                        // 日常笔记数据
                        const noteTypeList = rawData.noteType || [];
                        const noteTypeStr = noteTypeList.map(item => 
                            `${item.contentTag || ''}(${item.percent || ''})`
                        ).join(', ');
                        
                        return {
                            success: true,
                            data: {
                                noteNumber: rawData.noteNumber || 0,
                                noteType: noteTypeStr,
                                dateKey: rawData.dateKey || '',
                                daily_mAccumImpNum: rawData.mAccumImpNum || 0,
                                daily_mValidRawReadFeedNum: rawData.mValidRawReadFeedNum || 0,
                                daily_mEngagementNum: rawData.mEngagementNum || 0,
                            }
                        };
                    } else {
                        // 合作笔记数据
                        return {
                            success: true,
                            data: {
                                coop_mAccumImpNum: rawData.mAccumImpNum || 0,
                                coop_mValidRawReadFeedNum: rawData.mValidRawReadFeedNum || 0,
                                coop_mEngagementNum: rawData.mEngagementNum || 0,
                                estimatePictureCpm: rawData.estimatePictureCpm || 0,
                                estimateVideoCpm: rawData.estimateVideoCpm || 0,
                                picReadCost: rawData.picReadCost || 0,
                                videoReadCostV2: rawData.videoReadCostV2 || 0,
                                estimatePictureEngageCost: rawData.estimatePictureEngageCost || 0,
                                estimateVideoEngageCost: rawData.estimateVideoEngageCost || 0,
                                estimatePictureCpuv: rawData.estimatePictureCpuv || 0,
                                estimateVideoCpuv: rawData.estimateVideoCpuv || 0,
                                activeDayInLast7: rawData.activeDayInLast7 || 0,
                                responseRate: rawData.responseRate || '',
                                fans30GrowthBeyondRate: rawData.fans30GrowthBeyondRate || '',
                            }
                        };
                    }
                } else {
                    return { success: false, message: `接口返回错误: ${result.msg || '未知错误'}` };
                }
            } else {
                return { success: false, message: `HTTP错误: ${response.statusCode}` };
            }
        } catch (e) {
            return { success: false, message: `请求异常: ${e.message}` };
        }
    });
}

/**
 * 获取粉丝指标
 */
async function getFansSummary(userId, cookies) {
    return withRetry(async () => {
        const url = `https://pgy.xiaohongshu.com/api/solar/kol/data_v3/fans_summary?userId=${userId}`;
        const options = getRequestOptions(url, cookies);
        
        try {
            const response = await makeRequest(options);
            
            if (response.statusCode === 200) {
                const result = JSON.parse(response.data);
                if (result.code === 0 && result.success) {
                    const rawData = result.data || {};
                    
                    return {
                        success: true,
                        message: '粉丝指标采集成功',
                        data: {
                            '粉丝指标-粉丝增量': rawData.fansIncreaseNum || '',
                            '粉丝指标-粉丝量变化幅度': rawData.fansGrowthRate ? `${rawData.fansGrowthRate}%` : '',
                            '粉丝指标-活跃粉丝占比': rawData.activeFansRate ? `${rawData.activeFansRate}%` : '',
                            '粉丝指标-阅读粉丝占比': rawData.readFansRate ? `${rawData.readFansRate}%` : '',
                            '粉丝指标-互动粉丝占比': rawData.engageFansRate ? `${rawData.engageFansRate}%` : '',
                            '粉丝指标-下单粉丝占比': rawData.payFansUserRate30d ? `${rawData.payFansUserRate30d}%` : '',
                        }
                    };
                } else {
                    return { success: false, message: `接口返回错误: ${result.msg || '未知错误'}` };
                }
            } else {
                return { success: false, message: `HTTP错误: ${response.statusCode}` };
            }
        } catch (e) {
            return { success: false, message: `请求异常: ${e.message}` };
        }
    });
}

/**
 * 获取粉丝画像
 */
async function getFansProfile(userId, cookies) {
    return withRetry(async () => {
        const url = `https://pgy.xiaohongshu.com/api/solar/kol/data/${userId}/fans_profile`;
        const options = getRequestOptions(url, cookies);
        
        try {
            const response = await makeRequest(options);
            
            if (response.statusCode === 200) {
                const result = JSON.parse(response.data);
                if (result.code === 0 && result.success) {
                    const rawData = result.data || {};
                    
                    // 处理性别分布
                    const gender = rawData.gender || {};
                    const malePercent = (gender.male || 0) * 100;
                    const femalePercent = (gender.female || 0) * 100;
                    const genderStr = `男${malePercent.toFixed(2)}%，女${femalePercent.toFixed(2)}%`;
                    
                    // 处理年龄分布
                    const ages = rawData.ages || [];
                    const agesStr = ages.map(item => 
                        `${item.group || ''} ${((item.percent || 0) * 100).toFixed(1)}%`
                    ).join('，');
                    
                    // 处理省份分布（取前20）
                    const provinces = (rawData.provinces || []).slice(0, 20);
                    const provincesStr = provinces.map(item => 
                        `${item.name || ''} ${((item.percent || 0) * 100).toFixed(1)}%`
                    ).join('，');
                    
                    // 处理城市分布（取前9）
                    const cities = (rawData.cities || []).slice(0, 9);
                    const citiesStr = cities.map(item => 
                        `${item.name || ''} ${((item.percent || 0) * 100).toFixed(1)}%`
                    ).join('，');
                    
                    // 处理设备分布（取前10）
                    const devices = (rawData.devices || []).slice(0, 10);
                    const devicesStr = devices.map(item => 
                        `${item.desc || ''} ${((item.percent || 0) * 100).toFixed(1)}%`
                    ).join('，');
                    
                    // 处理兴趣分布（取前20）
                    const interests = (rawData.interests || []).slice(0, 20);
                    const interestsStr = interests.map(item => 
                        `${item.name || ''} ${((item.percent || 0) * 100).toFixed(1)}%`
                    ).join('，');
                    
                    return {
                        success: true,
                        message: '粉丝画像采集成功',
                        data: {
                            '粉丝画像-性别分布': genderStr,
                            '粉丝画像-年龄分布': agesStr,
                            '粉丝画像-地域分布-按省份': provincesStr,
                            '粉丝画像-地域分布-按城市': citiesStr,
                            '粉丝画像-用户设备分布': devicesStr,
                            '粉丝画像-用户兴趣': interestsStr,
                        }
                    };
                } else {
                    return { success: false, message: `接口返回错误: ${result.msg || '未知错误'}` };
                }
            } else {
                return { success: false, message: `HTTP错误: ${response.statusCode}` };
            }
        } catch (e) {
            return { success: false, message: `请求异常: ${e.message}` };
        }
    });
}

module.exports = {
    getBloggerInfo,
    getDataSummary,
    getFansSummary,
    getFansProfile,
    getRequestOptions,
    makeRequest,
    getSignHeaders
};
