"""
博主信息采集API
"""
import re
import time

import execjs
import fake_useragent
import requests
import json

sign_js = execjs.compile(open("./api/sign.js", "r", encoding="utf-8").read())

def get_headers(url: str, body: str = None, Cookie: str = None) -> dict:
  """
  获取请求头
  :param url: 请求地址
  :param body: 请求参数
  :param Cookie: Cookie字符串
  """
  if not Cookie:
    raise ValueError("Cookie不能为空")
    
  match = re.search(r'a1=([^;]+)', Cookie)
  a1_value = match.group(1) if match else None
  headers = sign_js.call("headers", url, body, a1_value)
  headers["User-Agent"] = fake_useragent.UserAgent().random
  headers["Content-Type"] = "application/json;charset=UTF-8"
  headers["Cookie"] = Cookie
  return headers

class BloggerAPI:
    """博主信息API类"""
    
    def __init__(self, cookies):
        """
        初始化API
        :param cookies: 用户cookies
        """
        self.cookies = cookies
        
    def get_blogger_info(self, user_id):
        """
        获取博主个人信息
        接口：https://pgy.xiaohongshu.com/api/solar/cooperator/user/blogger/{user_id}
        :param user_id: 博主ID（小红书ID）
        :return: (success, message, data)
        """
        url = f"https://pgy.xiaohongshu.com/api/solar/cooperator/user/blogger/{user_id}"
        
        headers = get_headers(url, Cookie=self.cookies)
        
        try:
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                result = response.json()
                if result.get('code') == 0 and result.get('success'):
                    raw_data = result.get('data', {})
                    
                    # 提取该接口需要的字段
                    # 处理内容标签
                    content_tags = []
                    if raw_data.get('contentTags'):
                        for tag in raw_data['contentTags']:
                            taxonomy2_tags = tag.get('taxonomy2Tags', [])
                            content_tags.extend(taxonomy2_tags)
                    content_tags_str = ', '.join(content_tags) if content_tags else ''
                    
                    # 处理签约机构
                    note_sign = raw_data.get('noteSign')
                    note_sign_name = note_sign.get('name', '') if note_sign else ''
                    
                    extracted_data = {
                        'name': raw_data.get('name', ''),  # 昵称
                        'gender': raw_data.get('gender', ''),  # 性别
                        'redId': raw_data.get('redId', ''),  # 小红书号
                        'location': raw_data.get('location', ''),  # 地理位置
                        'fansCount': raw_data.get('fansCount', 0),  # 粉丝数量
                        'likeCollectCountInfo': raw_data.get('likeCollectCountInfo', 0),  # 获赞与收藏
                        'picturePrice': raw_data.get('picturePrice', 0.0),  # 合作报价-图文笔记
                        'videoPrice': raw_data.get('videoPrice', 0.0),  # 合作报价-视频笔记
                        'lowerPrice': raw_data.get('lowerPrice', 0.0),  # 合作报价-最低报价
                        'noteSign': note_sign_name,  # 签约机构
                        'contentTags': content_tags_str,  # 内容标签
                        'tradeType': raw_data.get('tradeType', ''),  # 合作行业
                    }
                    
                    return True, "采集成功", extracted_data
                else:
                    return False, f"接口返回错误: {result.get('msg', '未知错误')}", None
            else:
                return False, f"HTTP错误: {response.status_code}", None
                
        except requests.exceptions.Timeout:
            return False, "请求超时", None
        except requests.exceptions.RequestException as e:
            return False, f"请求异常: {str(e)}", None
        except json.JSONDecodeError:
            return False, "响应解析失败", None
        except Exception as e:
            return False, f"未知错误: {str(e)}", None
    
    def get_data_summary(self, user_id):
        """
        获取博主数据概览（包含日常笔记和合作笔记数据）
        接口：https://pgy.xiaohongshu.com/api/pgy/kol/data/data_summary?userId={user_id}&business={business}
        :param user_id: 博主ID（小红书ID）
        :return: (success, message, data)
        """
        try:
            # 先获取 business=0 的数据（日常笔记）
            business0_success, business0_msg, business0_data = self._fetch_data_summary(user_id, 0)
            if not business0_success:
                return False, f"获取日常笔记数据失败: {business0_msg}", None
            
            # 再获取 business=1 的数据（合作笔记）
            business1_success, business1_msg, business1_data = self._fetch_data_summary(user_id, 1)
            if not business1_success:
                return False, f"获取合作笔记数据失败: {business1_msg}", None
            
            # 合并两次请求的数据
            combined_data = {
                **business0_data,
                **business1_data
            }
            
            return True, "数据概览采集成功", combined_data
            
        except Exception as e:
            return False, f"数据概览采集异常: {str(e)}", None
    
    def _fetch_data_summary(self, user_id, business):
        """
        内部方法：获取指定 business 的数据概览
        :param user_id: 博主ID
        :param business: 0=日常笔记, 1=合作笔记
        :return: (success, message, data)
        """
        url = f"https://pgy.xiaohongshu.com/api/pgy/kol/data/data_summary?userId={user_id}&business={business}"
        
        headers = get_headers(url, Cookie=self.cookies)
        
        try:
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                result = response.json()
                if result.get('code') == 0 and result.get('success'):
                    raw_data = result.get('data', {})
                    
                    if business == 0:
                        # business=0: 日常笔记数据
                        # 处理内容类目
                        note_type_list = raw_data.get('noteType', [])
                        note_type_str = ', '.join([
                            f"{item.get('contentTag', '')}({item.get('percent', '')})" 
                            for item in note_type_list
                        ])
                        
                        extracted_data = {
                            'noteNumber': raw_data.get('noteNumber', 0),  # 发布笔记
                            'noteType': note_type_str,  # 内容类目
                            'dateKey': raw_data.get('dateKey', ''),  # 数据更新时间
                            'daily_mAccumImpNum': raw_data.get('mAccumImpNum', 0),  # 日常笔记-曝光中位数
                            'daily_mValidRawReadFeedNum': raw_data.get('mValidRawReadFeedNum', 0),  # 日常笔记-阅读中位数
                            'daily_mEngagementNum': raw_data.get('mEngagementNum', 0),  # 日常笔记-互动中位数
                        }
                        
                    else:  # business == 1
                        # business=1: 合作笔记数据
                        extracted_data = {
                            'coop_mAccumImpNum': raw_data.get('mAccumImpNum', 0),  # 合作笔记-曝光中位数
                            'coop_mValidRawReadFeedNum': raw_data.get('mValidRawReadFeedNum', 0),  # 合作笔记-阅读中位数
                            'coop_mEngagementNum': raw_data.get('mEngagementNum', 0),  # 合作笔记-互动中位数
                            'estimatePictureCpm': raw_data.get('estimatePictureCpm', 0),  # 预估CPM(图文)
                            'estimateVideoCpm': raw_data.get('estimateVideoCpm', 0),  # 预估CPM(视频)
                            'picReadCost': raw_data.get('picReadCost', 0),  # 预估阅读单价(图文)
                            'videoReadCostV2': raw_data.get('videoReadCostV2', 0),  # 预估阅读单价(视频)
                            'estimatePictureEngageCost': raw_data.get('estimatePictureEngageCost', 0),  # 预估互动单价(图文)
                            'estimateVideoEngageCost': raw_data.get('estimateVideoEngageCost', 0),  # 预估互动单价(视频)
                            'estimatePictureCpuv': raw_data.get('estimatePictureCpuv', 0),  # 预估外溢进店单价(图文)
                            'estimateVideoCpuv': raw_data.get('estimateVideoCpuv', 0),  # 预估外溢进店单价(视频)
                            'activeDayInLast7': raw_data.get('activeDayInLast7', 0),  # 近7天活跃天数
                            'responseRate': raw_data.get('responseRate', ''),  # 邀约48小时回复率
                            'fans30GrowthBeyondRate': raw_data.get('fans30GrowthBeyondRate', ''),  # 粉丝量变化幅度
                        }
                    
                    return True, "成功", extracted_data
                else:
                    return False, f"接口返回错误: {result.get('msg', '未知错误')}", None
            else:
                return False, f"HTTP错误: {response.status_code}", None
                
        except requests.exceptions.Timeout:
            return False, "请求超时", None
        except requests.exceptions.RequestException as e:
            return False, f"请求异常: {str(e)}", None
        except json.JSONDecodeError:
            return False, "响应解析失败", None
        except Exception as e:
            return False, f"未知错误: {str(e)}", None
    
    def get_performance_data(self, user_id, selected_fields=None):
        """
        获取博主数据表现（根据用户选择的字段采集）
        接口1：https://pgy.xiaohongshu.com/api/solar/kol/data_v3/notes_rate
        接口2：https://pgy.xiaohongshu.com/api/pgy/kol/data/core_data
        :param user_id: 博主ID
        :param selected_fields: 用户选择的字段列表，如 ['日常笔记-图文+视频-近30天-全流量', ...]
        :return: (success, message, data)
        """
        try:
            combined_data = {}
            
            # 如果没有指定字段，则采集全部
            if not selected_fields:
                selected_fields = [
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
                    '合作笔记-视频-近90天-全流量',
                ]
            
            # 根据字段生成参数配置
            field_to_params_map = {
                '日常笔记-图文+视频-近30天-全流量': {'business': 0, 'noteType': 3, 'dateType': 1, 'advertiseSwitch': 1},
                '日常笔记-图文-近30天-全流量': {'business': 0, 'noteType': 1, 'dateType': 1, 'advertiseSwitch': 1},
                '日常笔记-视频-近30天-全流量': {'business': 0, 'noteType': 2, 'dateType': 1, 'advertiseSwitch': 1},
                '日常笔记-图文+视频-近90天-全流量': {'business': 0, 'noteType': 3, 'dateType': 2, 'advertiseSwitch': 1},
                '日常笔记-图文-近90天-全流量': {'business': 0, 'noteType': 1, 'dateType': 2, 'advertiseSwitch': 1},
                '日常笔记-视频-近90天-全流量': {'business': 0, 'noteType': 2, 'dateType': 2, 'advertiseSwitch': 1},
                '合作笔记-图文+视频-近30天-全流量': {'business': 1, 'noteType': 3, 'dateType': 1, 'advertiseSwitch': 1},
                '合作笔记-图文-近30天-全流量': {'business': 1, 'noteType': 1, 'dateType': 1, 'advertiseSwitch': 1},
                '合作笔记-视频-近30天-全流量': {'business': 1, 'noteType': 2, 'dateType': 1, 'advertiseSwitch': 1},
                '合作笔记-图文+视频-近90天-全流量': {'business': 1, 'noteType': 3, 'dateType': 2, 'advertiseSwitch': 1},
                '合作笔记-图文-近90天-全流量': {'business': 1, 'noteType': 1, 'dateType': 2, 'advertiseSwitch': 1},
                '合作笔记-视频-近90天-全流量': {'business': 1, 'noteType': 2, 'dateType': 2, 'advertiseSwitch': 1},
            }
            
            # 只采集用户选择的字段
            params_list_1 = []
            for field in selected_fields:
                if field in field_to_params_map:
                    params_list_1.append(field_to_params_map[field])
            
            # 接口1：调用 notes_rate
            for params in params_list_1:
                # 添加重试机制，最多重试3次
                max_retries = 3
                retry_count = 0
                success = False
                
                while retry_count < max_retries:
                    success, msg, data = self._fetch_notes_rate(user_id, params)
                    
                    # 如果成功且有数据，或者失败但不是406错误，则跳出重试循环
                    if (success and data) or (not success and "数据不可用" not in msg):
                        if success and data:
                            combined_data.update(data)
                        else:
                            print(f"接口1调用失败 - business:{params['business']}, noteType:{params['noteType']}, dateType:{params['dateType']} - {msg}")
                        break
                    
                    # 如果是406错误（数据不可用），进行重试
                    retry_count += 1
                    if retry_count < max_retries:
                        print(f"[接口1] 406错误重试 {retry_count}/{max_retries} - business:{params['business']}, noteType:{params['noteType']}, dateType:{params['dateType']}")
                        time.sleep(0.5)
                    else:
                        # 已达到最大重试次数，记录并继续
                        print(f"[接口1] 重试{max_retries}次后仍失败 - business:{params['business']}, noteType:{params['noteType']}, dateType:{params['dateType']} - {msg}")
                
            
            # 接口2：调用 core_data（POST请求，business字段为字符串）
            # 根据字段生成参数配置（注意business为字符串）
            field_to_params_map_2 = {
                '日常笔记-图文+视频-近30天-全流量': {'business': '0', 'noteType': 3, 'dateType': 1, 'advertiseSwitch': 1},
                '日常笔记-图文-近30天-全流量': {'business': '0', 'noteType': 1, 'dateType': 1, 'advertiseSwitch': 1},
                '日常笔记-视频-近30天-全流量': {'business': '0', 'noteType': 2, 'dateType': 1, 'advertiseSwitch': 1},
                '日常笔记-图文+视频-近90天-全流量': {'business': '0', 'noteType': 3, 'dateType': 2, 'advertiseSwitch': 1},
                '日常笔记-图文-近90天-全流量': {'business': '0', 'noteType': 1, 'dateType': 2, 'advertiseSwitch': 1},
                '日常笔记-视频-近90天-全流量': {'business': '0', 'noteType': 2, 'dateType': 2, 'advertiseSwitch': 1},
                '合作笔记-图文+视频-近30天-全流量': {'business': '1', 'noteType': 3, 'dateType': 1, 'advertiseSwitch': 1},
                '合作笔记-图文-近30天-全流量': {'business': '1', 'noteType': 1, 'dateType': 1, 'advertiseSwitch': 1},
                '合作笔记-视频-近30天-全流量': {'business': '1', 'noteType': 2, 'dateType': 1, 'advertiseSwitch': 1},
                '合作笔记-图文+视频-近90天-全流量': {'business': '1', 'noteType': 3, 'dateType': 2, 'advertiseSwitch': 1},
                '合作笔记-图文-近90天-全流量': {'business': '1', 'noteType': 1, 'dateType': 2, 'advertiseSwitch': 1},
                '合作笔记-视频-近90天-全流量': {'business': '1', 'noteType': 2, 'dateType': 2, 'advertiseSwitch': 1},
            }
            
            # 只采集用户选择的字段
            params_list_2 = []
            for field in selected_fields:
                if field in field_to_params_map_2:
                    params_list_2.append(field_to_params_map_2[field])
            
            for params in params_list_2:
                # 添加重试机制，最多重试3次
                max_retries = 3
                retry_count = 0
                success = False
                
                while retry_count < max_retries:
                    success, msg, data = self._fetch_core_data(user_id, params)
                    
                    # 如果成功且有数据，或者失败但不是406错误，则跳出重试循环
                    if (success and data) or (not success and "数据不可用" not in msg):
                        if success and data:
                            combined_data.update(data)
                        else:
                            print(f"接口2调用失败 - business:{params['business']}, noteType:{params['noteType']}, dateType:{params['dateType']} - {msg}")
                        break
                    
                    # 如果是406错误（数据不可用），进行重试
                    retry_count += 1
                    if retry_count < max_retries:
                        print(f"[接口2] 406错误重试 {retry_count}/{max_retries} - business:{params['business']}, noteType:{params['noteType']}, dateType:{params['dateType']}")
                        time.sleep(0.5)
                    else:
                        # 已达到最大重试次数，记录并继续
                        print(f"[接口2] 重试{max_retries}次后仍失败 - business:{params['business']}, noteType:{params['noteType']}, dateType:{params['dateType']} - {msg}")
                
                # 每次请求后延迟0.5秒，避免API限流
                time.sleep(0.5)
            
            return True, "数据表现采集成功", combined_data
            
        except Exception as e:
            return False, f"数据表现采集异常: {str(e)}", None
    
    def get_fans_summary(self, user_id):
        """
        获取博主粉丝指标
        接口：https://pgy.xiaohongshu.com/api/solar/kol/data_v3/fans_summary?userId={user_id}
        :param user_id: 博主ID
        :return: (success, message, data)
        """
        url = f"https://pgy.xiaohongshu.com/api/solar/kol/data_v3/fans_summary?userId={user_id}"
        headers = get_headers(url, Cookie=self.cookies)
        
        try:
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                result = response.json()
                if result.get('code') == 0 and result.get('success'):
                    raw_data = result.get('data', {})
                    
                    # 提取所需字段
                    extracted_data = {
                        '粉丝指标-粉丝增量': raw_data.get('fansIncreaseNum', ''),
                        '粉丝指标-粉丝量变化幅度': f"{raw_data.get('fansGrowthRate', '')}%" if raw_data.get('fansGrowthRate') else '',
                        '粉丝指标-活跃粉丝占比': f"{raw_data.get('activeFansRate', '')}%" if raw_data.get('activeFansRate') else '',
                        '粉丝指标-阅读粉丝占比': f"{raw_data.get('readFansRate', '')}%" if raw_data.get('readFansRate') else '',
                        '粉丝指标-互动粉丝占比': f"{raw_data.get('engageFansRate', '')}%" if raw_data.get('engageFansRate') else '',
                        '粉丝指标-下单粉丝占比': f"{raw_data.get('payFansUserRate30d', '')}%" if raw_data.get('payFansUserRate30d') else '',
                    }
                    
                    return True, "粉丝指标采集成功", extracted_data
                else:
                    return False, f"接口返回错误: {result.get('msg', '未知错误')}", None
            else:
                return False, f"HTTP错误: {response.status_code}", None
                
        except requests.exceptions.Timeout:
            return False, "请求超时", None
        except requests.exceptions.RequestException as e:
            return False, f"请求异常: {str(e)}", None
        except json.JSONDecodeError:
            return False, "响应解析失败", None
        except Exception as e:
            return False, f"未知错误: {str(e)}", None
    
    def get_fans_profile(self, user_id):
        """
        获取博主粉丝画像
        接口：https://pgy.xiaohongshu.com/api/solar/kol/data/{user_id}/fans_profile
        :param user_id: 博主ID
        :return: (success, message, data)
        """
        url = f"https://pgy.xiaohongshu.com/api/solar/kol/data/{user_id}/fans_profile"
        headers = get_headers(url, Cookie=self.cookies)
        
        try:
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                result = response.json()
                if result.get('code') == 0 and result.get('success'):
                    raw_data = result.get('data', {})
                    
                    # 处理性别分布
                    gender = raw_data.get('gender', {})
                    male_percent = gender.get('male', 0) * 100
                    female_percent = gender.get('female', 0) * 100
                    gender_str = f"男{male_percent:.2f}%，女{female_percent:.2f}%"
                    
                    # 处理年龄分布
                    ages = raw_data.get('ages', [])
                    ages_str = '，'.join([f"{item.get('group', '')} {item.get('percent', 0) * 100:.1f}%" for item in ages])
                    
                    # 处理省份分布（取前20）
                    provinces = raw_data.get('provinces', [])[:20]
                    provinces_str = '，'.join([f"{item.get('name', '')} {item.get('percent', 0) * 100:.1f}%" for item in provinces])
                    
                    # 处理城市分布（取前9）
                    cities = raw_data.get('cities', [])[:9]
                    cities_str = '，'.join([f"{item.get('name', '')} {item.get('percent', 0) * 100:.1f}%" for item in cities])
                    
                    # 处理设备分布（取前10）
                    devices = raw_data.get('devices', [])[:10]
                    devices_str = '，'.join([f"{item.get('desc', '')} {item.get('percent', 0) * 100:.1f}%" for item in devices])
                    
                    # 处理兴趣分布（取前20）
                    interests = raw_data.get('interests', [])[:20]
                    interests_str = '，'.join([f"{item.get('name', '')} {item.get('percent', 0) * 100:.1f}%" for item in interests])
                    
                    # 提取所需字段
                    extracted_data = {
                        '粉丝画像-性别分布': gender_str,
                        '粉丝画像-年龄分布': ages_str,
                        '粉丝画像-地域分布-按省份': provinces_str,
                        '粉丝画像-地域分布-按城市': cities_str,
                        '粉丝画像-用户设备分布': devices_str,
                        '粉丝画像-用户兴趣': interests_str,
                    }
                    
                    return True, "粉丝画像采集成功", extracted_data
                else:
                    return False, f"接口返回错误: {result.get('msg', '未知错误')}", None
            else:
                return False, f"HTTP错误: {response.status_code}", None
                
        except requests.exceptions.Timeout:
            return False, "请求超时", None
        except requests.exceptions.RequestException as e:
            return False, f"请求异常: {str(e)}", None
        except json.JSONDecodeError:
            return False, "响应解析失败", None
        except Exception as e:
            return False, f"未知错误: {str(e)}", None
    
    def _fetch_notes_rate(self, user_id, params):
        """
        内部方法：获取笔记数据表现（接口1）
        :param user_id: 博主ID
        :param params: 参数字典
        :return: (success, message, data)
        """
        url = f"https://pgy.xiaohongshu.com/api/solar/kol/data_v3/notes_rate?userId={user_id}&business={params['business']}&noteType={params['noteType']}&dateType={params['dateType']}&advertiseSwitch={params['advertiseSwitch']}"
        
        headers = get_headers(url, Cookie=self.cookies)
        
        try:
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                result = response.json()
                if result.get('code') == 0 and result.get('success'):
                    raw_data = result.get('data', {})
                    
                    # 根据参数组合生成字段前缀
                    business_str = '日常笔记' if params['business'] == 0 else '合作笔记'
                    note_type_str = '图文+视频' if params['noteType'] == 3 else ('图文' if params['noteType'] == 1 else '视频')
                    date_type_str = '近30天' if params['dateType'] == 1 else '近90天'
                    prefix = f"数据表现-{business_str}-{note_type_str}-{date_type_str}-全流量-"
                    
                    # 调试信息
                    print(f"[接口1] business:{params['business']} -> {business_str}, noteType:{params['noteType']} -> {note_type_str}, 笔记数: {raw_data.get('noteNumber', 'N/A')}")
                    
                    # 处理内容类目
                    note_type_list = raw_data.get('noteType', [])
                    note_type_content = ', '.join([
                        f"{item.get('contentTag', '')}{item.get('percent', '')}"
                        for item in note_type_list
                    ])
                    
                    # 处理百分数字段（转换为百分数表示）
                    # 注意：当笔记数为0时，pagePercentVo可能为None而不是空字典
                    page_percent = raw_data.get('pagePercentVo') or {}
                    
                    extracted_data = {
                        f'{prefix}笔记数': raw_data.get('noteNumber', ''),
                        f'{prefix}内容类目及占比': note_type_content,
                        f'{prefix}中位点赞量': raw_data.get('likeMedian', ''),
                        f'{prefix}中位收藏量': raw_data.get('collectMedian', ''),
                        f'{prefix}中位评论量': raw_data.get('commentMedian', ''),
                        f'{prefix}中位分享量': raw_data.get('shareMedian', ''),
                        f'{prefix}中位关注量': raw_data.get('mfollowCnt', ''),
                        f'{prefix}互动率': raw_data.get('interactionRate', ''),
                        f'{prefix}图文3秒阅读率': raw_data.get('picture3sViewRate', ''),
                        f'{prefix}千赞笔记比例': raw_data.get('thousandLikePercent', ''),
                        f'{prefix}百赞笔记比例': raw_data.get('hundredLikePercent', ''),
                        f'{prefix}阅读量来源-发现页': f"{float(page_percent.get('readHomefeedPercent', 0)) * 100:.1f}%" if page_percent.get('readHomefeedPercent') is not None else '',
                        f'{prefix}阅读量来源-搜索页': f"{float(page_percent.get('readSearchPercent', 0)) * 100:.1f}%" if page_percent.get('readSearchPercent') is not None else '',
                        f'{prefix}阅读量来源-关注页': f"{float(page_percent.get('readFollowPercent', 0)) * 100:.1f}%" if page_percent.get('readFollowPercent') is not None else '',
                        f'{prefix}阅读量来源-博主个人页': f"{float(page_percent.get('readDetailPercent', 0)) * 100:.1f}%" if page_percent.get('readDetailPercent') is not None else '',
                        f'{prefix}阅读量来源-附近页': f"{float(page_percent.get('readNearbyPercent', 0)) * 100:.1f}%" if page_percent.get('readNearbyPercent') is not None else '',
                        f'{prefix}阅读量来源-其他': f"{float(page_percent.get('readOtherPercent', 0)) * 100:.1f}%" if page_percent.get('readOtherPercent') is not None else '',
                        f'{prefix}曝光量来源-发现页': f"{float(page_percent.get('impHomefeedPercent', 0)) * 100:.1f}%" if page_percent.get('impHomefeedPercent') is not None else '',
                        f'{prefix}曝光量来源-搜索页': f"{float(page_percent.get('impSearchPercent', 0)) * 100:.1f}%" if page_percent.get('impSearchPercent') is not None else '',
                        f'{prefix}曝光量来源-关注页': f"{float(page_percent.get('impFollowPercent', 0)) * 100:.1f}%" if page_percent.get('impFollowPercent') is not None else '',
                        f'{prefix}曝光量来源-博主个人页': f"{float(page_percent.get('impDetailPercent', 0)) * 100:.1f}%" if page_percent.get('impDetailPercent') is not None else '',
                        f'{prefix}曝光量来源-附近页': f"{float(page_percent.get('impNearbyPercent', 0)) * 100:.1f}%" if page_percent.get('impNearbyPercent') is not None else '',
                        f'{prefix}曝光量来源-其他': f"{float(page_percent.get('impOtherPercent', 0)) * 100:.1f}%" if page_percent.get('impOtherPercent') is not None else '',
                    }
                    
                    return True, "成功", extracted_data
                else:
                    return False, f"接口返回错误: {result.get('msg', '未知错误')}", None
            elif response.status_code == 406:
                # 406表示该参数组合数据不可用（通常是数据不足），返回空数据而非错误
                print(f"[接口1] 406错误 - noteType:{params['noteType']}, 数据不足，返回空数据")
                return True, "数据不可用", {}
            else:
                return False, f"HTTP错误: {response.status_code}", None
                
        except requests.exceptions.Timeout:
            return False, "请求超时", None
        except requests.exceptions.RequestException as e:
            return False, f"请求异常: {str(e)}", None
        except json.JSONDecodeError:
            return False, "响应解析失败", None
        except Exception as e:
            return False, f"未知错误: {str(e)}", None
    
    def _fetch_core_data(self, user_id, params):
        """
        内部方法：获取核心数据（接口2，POST请求）
        :param user_id: 博主ID
        :param params: 参数字典
        :return: (success, message, data)
        """
        url = "https://pgy.xiaohongshu.com/api/pgy/kol/data/core_data"
        
        # 准备POST数据
        post_data = {
            'userId': user_id,
            'business': params['business'],
            'noteType': params['noteType'],
            'dateType': params['dateType'],
            'advertiseSwitch': params['advertiseSwitch']
        }
        
        headers = get_headers(url, body=json.dumps(post_data), Cookie=self.cookies)
        headers['Content-Type'] = 'application/json;charset=UTF-8'
        
        try:
            response = requests.post(url, headers=headers, json=post_data, timeout=10)
            if response.status_code == 200:
                result = response.json()
                if result.get('code') == 0 and result.get('success'):
                    sum_data = result.get('data', {}).get('sumData', {})
                    
                    # 根据参数组合生成字段前缀
                    business_str = '日常笔记' if params['business'] == '0' else '合作笔记'
                    note_type_str = '图文+视频' if params['noteType'] == 3 else ('图文' if params['noteType'] == 1 else '视频')
                    date_type_str = '近30天' if params['dateType'] == 1 else '近90天'
                    prefix = f"数据表现-{business_str}-{note_type_str}-{date_type_str}-全流量-"
                    
                    # 调试信息
                    print(f"[接口2] business:{params['business']} -> {business_str}, noteType:{params['noteType']} -> {note_type_str}, 曝光中位数: {sum_data.get('imp', 'N/A')}")
                    
                    extracted_data = {
                        f'{prefix}曝光中位数': sum_data.get('imp', ''),
                        f'{prefix}阅读中位数': sum_data.get('read', ''),
                        f'{prefix}互动中位数': sum_data.get('engage', ''),
                        f'{prefix}预估CPM': f"{sum_data.get('cpm', 0):.2f}" if sum_data.get('cpm') is not None else '',
                        f'{prefix}预估阅读单价': f"{sum_data.get('cpv', 0):.2f}" if sum_data.get('cpv') is not None else '',
                        f'{prefix}预估互动单价': f"{sum_data.get('cpe', 0):.2f}" if sum_data.get('cpe') is not None else '',
                    }
                    
                    return True, "成功", extracted_data
                else:
                    return False, f"接口返回错误: {result.get('msg', '未知错误')}", None
            elif response.status_code == 406:
                # 406表示该参数组合数据不可用（通常是数据不足），返回空数据而非错误
                print(f"[接口2] 406错误 - noteType:{params['noteType']}, 数据不足，返回空数据")
                return True, "数据不可用", {}
            else:
                return False, f"HTTP错误: {response.status_code}", None
                
        except requests.exceptions.Timeout:
            return False, "请求超时", None
        except requests.exceptions.RequestException as e:
            return False, f"请求异常: {str(e)}", None
        except json.JSONDecodeError:
            return False, "响应解析失败", None
        except Exception as e:
            return False, f"未知错误: {str(e)}", None
