"""
关于页面
"""
from PyQt5.QtWidgets import QWidget, QVBoxLayout, QLabel
from PyQt5.QtCore import Qt


class AboutPage(QWidget):
    """关于页面"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName('aboutPage')
        self.init_ui()
        
    def init_ui(self):
        """初始化界面"""
        layout = QVBoxLayout(self)
        layout.setAlignment(Qt.AlignCenter)
        layout.setSpacing(15)
        
        # 标题
        title = QLabel('小红书采集管理系统')
        title.setStyleSheet('font-size: 28px; font-weight: bold; color: #333;')
        layout.addWidget(title, alignment=Qt.AlignCenter)
        
        # 版本
        version = QLabel('版本: 1.0.0')
        version.setStyleSheet('font-size: 16px; color: #666;')
        layout.addWidget(version, alignment=Qt.AlignCenter)
        
        # 描述
        desc = QLabel('基于 PyQt5 和 PyQt-Fluent-Widgets 开发')
        desc.setStyleSheet('font-size: 14px; color: #999; margin-top: 20px;')
        layout.addWidget(desc, alignment=Qt.AlignCenter)
