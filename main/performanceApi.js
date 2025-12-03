/**
 * 数据表现采集API模块
 * 移植自 Python 版本的 blogger_api.py
 */

const { getRequestOptions, makeRequest } = require('./api');

// 字段到参数的映射
const FIELD_TO_PARAMS_MAP = {
    '日常笔记-图文+视频-近30天-全流量': { business: 0, noteType: 3, dateType: 1, advertiseSwitch: 1 },
    '日常笔记-图文-近30天-全流量': { business: 0, noteType: 1, dateType: 1, advertiseSwitch: 1 },
    '日常笔记-视频-近30天-全流量': { business: 0, noteType: 2, dateType: 1, advertiseSwitch: 1 },
    '日常笔记-图文+视频-近90天-全流量': { business: 0, noteType: 3, dateType: 2, advertiseSwitch: 1 },
    '日常笔记-图文-近90天-全流量': { business: 0, noteType: 1, dateType: 2, advertiseSwitch: 1 },
    '日常笔记-视频-近90天-全流量': { business: 0, noteType: 2, dateType: 2, advertiseSwitch: 1 },
    '合作笔记-图文+视频-近30天-全流量': { business: 1, noteType: 3, dateType: 1, advertiseSwitch: 1 },
    '合作笔记-图文-近30天-全流量': { business: 1, noteType: 1, dateType: 1, advertiseSwitch: 1 },
    '合作笔记-视频-近30天-全流量': { business: 1, noteType: 2, dateType: 1, advertiseSwitch: 1 },
    '合作笔记-图文+视频-近90天-全流量': { business: 1, noteType: 3, dateType: 2, advertiseSwitch: 1 },
    '合作笔记-图文-近90天-全流量': { business: 1, noteType: 1, dateType: 2, advertiseSwitch: 1 },
    '合作笔记-视频-近90天-全流量': { business: 1, noteType: 2, dateType: 2, advertiseSwitch: 1 },
};

// 用于接口2的映射（business为字符串）
const FIELD_TO_PARAMS_MAP_2 = {
    '日常笔记-图文+视频-近30天-全流量': { business: '0', noteType: 3, dateType: 1, advertiseSwitch: 1 },
    '日常笔记-图文-近30天-全流量': { business: '0', noteType: 1, dateType: 1, advertiseSwitch: 1 },
    '日常笔记-视频-近30天-全流量': { business: '0', noteType: 2, dateType: 1, advertiseSwitch: 1 },
    '日常笔记-图文+视频-近90天-全流量': { business: '0', noteType: 3, dateType: 2, advertiseSwitch: 1 },
    '日常笔记-图文-近90天-全流量': { business: '0', noteType: 1, dateType: 2, advertiseSwitch: 1 },
    '日常笔记-视频-近90天-全流量': { business: '0', noteType: 2, dateType: 2, advertiseSwitch: 1 },
    '合作笔记-图文+视频-近30天-全流量': { business: '1', noteType: 3, dateType: 1, advertiseSwitch: 1 },
    '合作笔记-图文-近30天-全流量': { business: '1', noteType: 1, dateType: 1, advertiseSwitch: 1 },
    '合作笔记-视频-近30天-全流量': { business: '1', noteType: 2, dateType: 1, advertiseSwitch: 1 },
    '合作笔记-图文+视频-近90天-全流量': { business: '1', noteType: 3, dateType: 2, advertiseSwitch: 1 },
    '合作笔记-图文-近90天-全流量': { business: '1', noteType: 1, dateType: 2, advertiseSwitch: 1 },
    '合作笔记-视频-近90天-全流量': { business: '1', noteType: 2, dateType: 2, advertiseSwitch: 1 },
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 获取笔记数据表现（接口1：notes_rate）
 */
async function fetchNotesRate(userId, params, cookies) {
    const url = `https://pgy.xiaohongshu.com/api/solar/kol/data_v3/notes_rate?userId=${userId}&business=${params.business}&noteType=${params.noteType}&dateType=${params.dateType}&advertiseSwitch=${params.advertiseSwitch}`;
    const options = getRequestOptions(url, cookies);
    
    try {
        const response = await makeRequest(options);
        
        if (response.statusCode === 200) {
            const result = JSON.parse(response.data);
            if (result.code === 0 && result.success) {
                const rawData = result.data || {};
                
                // 根据参数组合生成字段前缀
                const businessStr = params.business === 0 ? '日常笔记' : '合作笔记';
                const noteTypeStr = params.noteType === 3 ? '图文+视频' : (params.noteType === 1 ? '图文' : '视频');
                const dateTypeStr = params.dateType === 1 ? '近30天' : '近90天';
                const prefix = `数据表现-${businessStr}-${noteTypeStr}-${dateTypeStr}-全流量-`;
                
                // 处理内容类目
                const noteTypeList = rawData.noteType || [];
                const noteTypeContent = noteTypeList.map(item => 
                    `${item.contentTag || ''}${item.percent || ''}`
                ).join(', ');
                
                // 处理百分数字段
                const pagePercent = rawData.pagePercentVo || {};
                
                const extractedData = {
                    [`${prefix}笔记数`]: rawData.noteNumber || '',
                    [`${prefix}内容类目及占比`]: noteTypeContent,
                    [`${prefix}中位点赞量`]: rawData.likeMedian || '',
                    [`${prefix}中位收藏量`]: rawData.collectMedian || '',
                    [`${prefix}中位评论量`]: rawData.commentMedian || '',
                    [`${prefix}中位分享量`]: rawData.shareMedian || '',
                    [`${prefix}中位关注量`]: rawData.mfollowCnt || '',
                    [`${prefix}互动率`]: rawData.interactionRate || '',
                    [`${prefix}图文3秒阅读率`]: rawData.picture3sViewRate || '',
                    [`${prefix}千赞笔记比例`]: rawData.thousandLikePercent || '',
                    [`${prefix}百赞笔记比例`]: rawData.hundredLikePercent || '',
                    [`${prefix}阅读量来源-发现页`]: pagePercent.readHomefeedPercent != null ? `${(parseFloat(pagePercent.readHomefeedPercent) * 100).toFixed(1)}%` : '',
                    [`${prefix}阅读量来源-搜索页`]: pagePercent.readSearchPercent != null ? `${(parseFloat(pagePercent.readSearchPercent) * 100).toFixed(1)}%` : '',
                    [`${prefix}阅读量来源-关注页`]: pagePercent.readFollowPercent != null ? `${(parseFloat(pagePercent.readFollowPercent) * 100).toFixed(1)}%` : '',
                    [`${prefix}阅读量来源-博主个人页`]: pagePercent.readDetailPercent != null ? `${(parseFloat(pagePercent.readDetailPercent) * 100).toFixed(1)}%` : '',
                    [`${prefix}阅读量来源-附近页`]: pagePercent.readNearbyPercent != null ? `${(parseFloat(pagePercent.readNearbyPercent) * 100).toFixed(1)}%` : '',
                    [`${prefix}阅读量来源-其他`]: pagePercent.readOtherPercent != null ? `${(parseFloat(pagePercent.readOtherPercent) * 100).toFixed(1)}%` : '',
                    [`${prefix}曝光量来源-发现页`]: pagePercent.impHomefeedPercent != null ? `${(parseFloat(pagePercent.impHomefeedPercent) * 100).toFixed(1)}%` : '',
                    [`${prefix}曝光量来源-搜索页`]: pagePercent.impSearchPercent != null ? `${(parseFloat(pagePercent.impSearchPercent) * 100).toFixed(1)}%` : '',
                    [`${prefix}曝光量来源-关注页`]: pagePercent.impFollowPercent != null ? `${(parseFloat(pagePercent.impFollowPercent) * 100).toFixed(1)}%` : '',
                    [`${prefix}曝光量来源-博主个人页`]: pagePercent.impDetailPercent != null ? `${(parseFloat(pagePercent.impDetailPercent) * 100).toFixed(1)}%` : '',
                    [`${prefix}曝光量来源-附近页`]: pagePercent.impNearbyPercent != null ? `${(parseFloat(pagePercent.impNearbyPercent) * 100).toFixed(1)}%` : '',
                    [`${prefix}曝光量来源-其他`]: pagePercent.impOtherPercent != null ? `${(parseFloat(pagePercent.impOtherPercent) * 100).toFixed(1)}%` : '',
                };
                
                return { success: true, data: extractedData };
            } else {
                return { success: false, message: `接口返回错误: ${result.msg || '未知错误'}` };
            }
        } else if (response.statusCode === 406) {
            // 406表示数据不可用
            return { success: true, message: '数据不可用', data: {} };
        } else {
            return { success: false, message: `HTTP错误: ${response.statusCode}` };
        }
    } catch (e) {
        return { success: false, message: `请求异常: ${e.message}` };
    }
}

/**
 * 获取核心数据（接口2：core_data，POST请求）
 */
async function fetchCoreData(userId, params, cookies) {
    const url = 'https://pgy.xiaohongshu.com/api/pgy/kol/data/core_data';
    const postData = JSON.stringify({
        userId: userId,
        business: params.business,
        noteType: params.noteType,
        dateType: params.dateType,
        advertiseSwitch: params.advertiseSwitch
    });
    
    const options = getRequestOptions(url, cookies, 'POST', postData);
    
    try {
        const response = await makeRequest(options, postData);
        
        if (response.statusCode === 200) {
            const result = JSON.parse(response.data);
            if (result.code === 0 && result.success) {
                const sumData = (result.data || {}).sumData || {};
                
                // 根据参数组合生成字段前缀
                const businessStr = params.business === '0' ? '日常笔记' : '合作笔记';
                const noteTypeStr = params.noteType === 3 ? '图文+视频' : (params.noteType === 1 ? '图文' : '视频');
                const dateTypeStr = params.dateType === 1 ? '近30天' : '近90天';
                const prefix = `数据表现-${businessStr}-${noteTypeStr}-${dateTypeStr}-全流量-`;
                
                const extractedData = {
                    [`${prefix}曝光中位数`]: sumData.imp || '',
                    [`${prefix}阅读中位数`]: sumData.read || '',
                    [`${prefix}互动中位数`]: sumData.engage || '',
                    [`${prefix}预估CPM`]: sumData.cpm != null ? sumData.cpm.toFixed(2) : '',
                    [`${prefix}预估阅读单价`]: sumData.cpv != null ? sumData.cpv.toFixed(2) : '',
                    [`${prefix}预估互动单价`]: sumData.cpe != null ? sumData.cpe.toFixed(2) : '',
                };
                
                // 合作笔记添加外溢进店中位数字段
                if (params.business === '1') {
                    extractedData[`${prefix}外溢进店中位数`] = sumData.thirdUserNum || '';
                }
                
                return { success: true, data: extractedData };
            } else {
                return { success: false, message: `接口返回错误: ${result.msg || '未知错误'}` };
            }
        } else if (response.statusCode === 406) {
            return { success: true, message: '数据不可用', data: {} };
        } else {
            return { success: false, message: `HTTP错误: ${response.statusCode}` };
        }
    } catch (e) {
        return { success: false, message: `请求异常: ${e.message}` };
    }
}

/**
 * 获取博主数据表现
 */
async function getPerformanceData(userId, selectedFields, cookies) {
    try {
        const combinedData = {};
        
        // 如果没有指定字段，则采集全部
        if (!selectedFields || selectedFields.length === 0) {
            selectedFields = Object.keys(FIELD_TO_PARAMS_MAP);
        }
        
        // 接口1：调用 notes_rate
        for (const field of selectedFields) {
            if (FIELD_TO_PARAMS_MAP[field]) {
                const params = FIELD_TO_PARAMS_MAP[field];
                
                // 重试机制
                let retryCount = 0;
                const maxRetries = 3;
                
                while (retryCount < maxRetries) {
                    const result = await fetchNotesRate(userId, params, cookies);
                    
                    if ((result.success && result.data) || (!result.success && !result.message.includes('数据不可用'))) {
                        if (result.success && result.data) {
                            Object.assign(combinedData, result.data);
                        }
                        break;
                    }
                    
                    retryCount++;
                    if (retryCount < maxRetries) {
                        await sleep(500);
                    }
                }
            }
        }
        
        // 接口2：调用 core_data
        for (const field of selectedFields) {
            if (FIELD_TO_PARAMS_MAP_2[field]) {
                const params = FIELD_TO_PARAMS_MAP_2[field];
                
                // 重试机制
                let retryCount = 0;
                const maxRetries = 3;
                
                while (retryCount < maxRetries) {
                    const result = await fetchCoreData(userId, params, cookies);
                    
                    if ((result.success && result.data) || (!result.success && !result.message.includes('数据不可用'))) {
                        if (result.success && result.data) {
                            Object.assign(combinedData, result.data);
                        }
                        break;
                    }
                    
                    retryCount++;
                    if (retryCount < maxRetries) {
                        await sleep(500);
                    }
                }
                
                // 每次请求后延迟
                await sleep(500);
            }
        }
        
        return {
            success: true,
            message: '数据表现采集成功',
            data: combinedData
        };
    } catch (e) {
        return { success: false, message: `数据表现采集异常: ${e.message}` };
    }
}

module.exports = {
    getPerformanceData,
    FIELD_TO_PARAMS_MAP
};
