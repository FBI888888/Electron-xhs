# 数据表现字段生成器
# 用于生成Excel表头和数据行

# 6种参数组合
combinations = [
    ('日常笔记-图文+视频-近30天-全流量', 'perf_pic_video_30'),
    ('日常笔记-图文-近30天-全流量', 'perf_pic_30'),
    ('日常笔记-视频-近30天-全流量', 'perf_video_30'),
    ('日常笔记-图文+视频-近90天-全流量', 'perf_pic_video_90'),
    ('日常笔记-图文-近90天-全流量', 'perf_pic_90'),
    ('日常笔记-视频-近90天-全流量', 'perf_video_90'),
]

# 生成表头
headers = []
for prefix, _ in combinations:
    headers.extend([
        f'数据表现-{prefix}-笔记数',
        f'数据表现-{prefix}-内容类目及占比',
        f'数据表现-{prefix}-曝光中位数',
        f'数据表现-{prefix}-阅读中位数',
        f'数据表现-{prefix}-互动中位数',
        f'数据表现-{prefix}-中位点赞量',
        f'数据表现-{prefix}-中位收藏量',
        f'数据表现-{prefix}-中位评论量',
        f'数据表现-{prefix}-中位分享量',
        f'数据表现-{prefix}-中位关注量',
        f'数据表现-{prefix}-互动率',
        f'数据表现-{prefix}-图文3秒阅读率',
        f'数据表现-{prefix}-千赞笔记比例',
        f'数据表现-{prefix}-百赞笔记比例',
        f'数据表现-{prefix}-预估CPM',
        f'数据表现-{prefix}-预估阅读单价',
        f'数据表现-{prefix}-预估互动单价',
        f'数据表现-{prefix}-阅读量来源-发现页',
        f'数据表现-{prefix}-阅读量来源-搜索页',
        f'数据表现-{prefix}-阅读量来源-关注页',
        f'数据表现-{prefix}-阅读量来源-博主个人页',
        f'数据表现-{prefix}-阅读量来源-附近页',
        f'数据表现-{prefix}-阅读量来源-其他',
        f'数据表现-{prefix}-曝光量来源-发现页',
        f'数据表现-{prefix}-曝光量来源-搜索页',
        f'数据表现-{prefix}-曝光量来源-关注页',
        f'数据表现-{prefix}-曝光量来源-博主个人页',
        f'数据表现-{prefix}-曝光量来源-附近页',
        f'数据表现-{prefix}-曝光量来源-其他',
    ])

print(f"总共字段数: {len(headers)}")
print("\n表头列表:")
for i, h in enumerate(headers, 1):
    print(f"{i}. {h}")

# 生成数据获取代码
print("\n\n数据行代码:")
for prefix, _ in combinations:
    print(f"    data.get('数据表现-{prefix}-笔记数', ''),")
    print(f"    data.get('数据表现-{prefix}-内容类目及占比', ''),")
    print(f"    data.get('数据表现-{prefix}-曝光中位数', ''),")
    print(f"    data.get('数据表现-{prefix}-阅读中位数', ''),")
    print(f"    data.get('数据表现-{prefix}-互动中位数', ''),")
    print(f"    data.get('数据表现-{prefix}-中位点赞量', ''),")
    print(f"    data.get('数据表现-{prefix}-中位收藏量', ''),")
    print(f"    data.get('数据表现-{prefix}-中位评论量', ''),")
    print(f"    data.get('数据表现-{prefix}-中位分享量', ''),")
    print(f"    data.get('数据表现-{prefix}-中位关注量', ''),")
    print(f"    data.get('数据表现-{prefix}-互动率', ''),")
    print(f"    data.get('数据表现-{prefix}-图文3秒阅读率', ''),")
    print(f"    data.get('数据表现-{prefix}-千赞笔记比例', ''),")
    print(f"    data.get('数据表现-{prefix}-百赞笔记比例', ''),")
    print(f"    data.get('数据表现-{prefix}-预估CPM', ''),")
    print(f"    data.get('数据表现-{prefix}-预估阅读单价', ''),")
    print(f"    data.get('数据表现-{prefix}-预估互动单价', ''),")
    print(f"    data.get('数据表现-{prefix}-阅读量来源-发现页', ''),")
    print(f"    data.get('数据表现-{prefix}-阅读量来源-搜索页', ''),")
    print(f"    data.get('数据表现-{prefix}-阅读量来源-关注页', ''),")
    print(f"    data.get('数据表现-{prefix}-阅读量来源-博主个人页', ''),")
    print(f"    data.get('数据表现-{prefix}-阅读量来源-附近页', ''),")
    print(f"    data.get('数据表现-{prefix}-阅读量来源-其他', ''),")
    print(f"    data.get('数据表现-{prefix}-曝光量来源-发现页', ''),")
    print(f"    data.get('数据表现-{prefix}-曝光量来源-搜索页', ''),")
    print(f"    data.get('数据表现-{prefix}-曝光量来源-关注页', ''),")
    print(f"    data.get('数据表现-{prefix}-曝光量来源-博主个人页', ''),")
    print(f"    data.get('数据表现-{prefix}-曝光量来源-附近页', ''),")
    print(f"    data.get('数据表现-{prefix}-曝光量来源-其他', ''),")
