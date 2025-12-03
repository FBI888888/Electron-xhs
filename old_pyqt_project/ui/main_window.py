"""
主窗口 - 使用PyQt-Fluent-Widgets的导航界面
"""
from PyQt5.QtCore import Qt, QSize
from PyQt5.QtWidgets import QApplication
from qfluentwidgets import FluentIcon as FIF, NavigationItemPosition, FluentWindow

from ui.pages.account_page import AccountPage
from ui.pages.collect_settings_page import CollectSettingsPage
from ui.pages.collect_manage_page import CollectManagePage
from ui.pages.about_page import AboutPage


class MainWindow(FluentWindow):
    """主窗口类"""
    
    def __init__(self):
        super().__init__()
        self.init_window()
        self.init_navigation()
        
    def init_window(self):
        """初始化窗口"""
        self.setWindowTitle("小红书采集管理系统")
        
        # 窗口大小自适应屏幕（占屏幕的70%）
        desktop = QApplication.desktop().availableGeometry()
        screen_width = desktop.width()
        screen_height = desktop.height()
        
        window_width = int(screen_width * 0.7)
        window_height = int(screen_height * 0.8)
        self.resize(window_width, window_height)
        
        # 窗口居中
        self.move((screen_width - window_width) // 2, (screen_height - window_height) // 2)
        
    def init_navigation(self):
        """初始化导航栏"""
        # 创建各个页面实例
        self.account_page = AccountPage(self)
        self.collect_settings_page = CollectSettingsPage(self)
        self.collect_manage_page = CollectManagePage(self)
        self.about_page = AboutPage(self)
        
        # 添加导航项
        self.addSubInterface(
            self.account_page,
            FIF.PEOPLE,
            '账号管理',
            position=NavigationItemPosition.TOP
        )
        
        self.addSubInterface(
            self.collect_settings_page,
            FIF.SETTING,
            '采集设置',
            position=NavigationItemPosition.TOP
        )
        
        self.addSubInterface(
            self.collect_manage_page,
            FIF.FOLDER,
            '采集管理',
            position=NavigationItemPosition.TOP
        )
        
        # 关于页面放在底部
        self.addSubInterface(
            self.about_page,
            FIF.INFO,
            '关于',
            position=NavigationItemPosition.BOTTOM
        )
        
        # 设置导航栏默认展开
        self.navigationInterface.setExpandWidth(150)
        self.navigationInterface.expand(useAni=False)
