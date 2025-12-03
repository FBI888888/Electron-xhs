# 小红书采集管理系统

基于 PyQt5 和 PyQt-Fluent-Widgets 开发的小红书蒲公英平台账号管理系统。

## 功能特点

### 已实现功能

1. **左侧导航栏**
   - Web端管理系统风格
   - 默认展开显示
   - 包含四个主菜单：账号管理、采集设置、采集管理、关于

2. **账号管理页面**
   - 账号添加：支持输入备注名和Cookies
   - 自动验证：添加账号时自动调用API验证
   - 账号列表：展示备注名、蒲公英昵称、账号状态、Cookies
   - 批量检查：一键检查所有账号状态
   - 右键菜单：
     - 检查账号：验证单个账号
     - 修改账号：编辑账号信息
     - 删除账号：移除账号
   - 数据持久化：账号数据保存在 `data/pgy_username.json`

3. **其他页面**
   - 采集设置页面（待实现）
   - 采集管理页面（待实现）
   - 关于页面（基础信息展示）

## 技术栈

- **PyQt5**: Qt图形界面框架
- **PyQt-Fluent-Widgets**: 现代化UI组件库
- **requests**: HTTP请求库

## 安装使用

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 运行程序

```bash
python main.py
```

## 项目结构

```
xhs/
├── main.py                 # 主程序入口
├── requirements.txt        # 项目依赖
├── data/                   # 数据存储目录
│   └── pgy_username.json   # 账号数据文件
├── ui/                     # UI模块
│   ├── main_window.py      # 主窗口
│   └── pages/              # 页面模块
│       ├── account_page.py          # 账号管理页面
│       ├── collect_settings_page.py # 采集设置页面
│       ├── collect_manage_page.py   # 采集管理页面
│       └── about_page.py            # 关于页面
└── core/                   # 核心功能模块（待实现）
```

## API说明

### 账号验证接口

- **URL**: `https://pgy.xiaohongshu.com/api/solar/user/info`
- **方法**: GET
- **必需Headers**:
  - Cookie: 用户的Cookie信息
  - User-Agent: 浏览器标识
  - Referer: 来源页面

### 响应示例

```json
{
    "code": 0,
    "success": true,
    "msg": "成功",
    "data": {
        "nickName": "用户昵称",
        "roleInfoList": [
            {
                "nickName": "蒲公英昵称",
                "userId": "用户ID",
                "status": 20
            }
        ]
    }
}
```

## 注意事项

1. 账号Cookie需要从浏览器中获取
2. Cookie有时效性，需定期更新
3. 数据文件自动保存在 `data` 目录下
4. 建议定期检查账号状态

## 开发计划

- [ ] 完善采集设置页面
- [ ] 实现采集管理功能
- [ ] 添加日志记录功能
- [ ] 支持配置文件管理
- [ ] 优化多线程检查机制
- [ ] 添加数据导入导出功能

## 许可证

MIT License
