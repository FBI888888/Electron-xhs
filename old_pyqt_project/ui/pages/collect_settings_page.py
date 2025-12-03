"""
采集设置页面
"""
import json
from pathlib import Path
from PyQt5.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, 
                             QGroupBox, QFileDialog, QGridLayout, QScrollArea)
from PyQt5.QtCore import Qt
from qfluentwidgets import (LineEdit, PushButton, PrimaryPushButton,
                           SpinBox, DoubleSpinBox, InfoBar, InfoBarPosition,
                           FluentIcon as FIF, CheckBox)


class CollectSettingsPage(QWidget):
    """采集设置页面"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName('collectSettingsPage')
        self.settings_file = Path('data/collect_settings.json')
        self.settings = self.load_settings()
        self.init_ui()
        self.load_ui_from_settings()
        
    def init_ui(self):
        """初始化界面"""
        # 创建主滚动区域
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QScrollArea.NoFrame)
        scroll.setStyleSheet("QScrollArea { background-color: transparent; border: none; }")
        
        # 创建内容widget
        content_widget = QWidget()
        content_widget.setStyleSheet("QWidget { background-color: transparent; }")
        layout = QVBoxLayout(content_widget)
        layout.setContentsMargins(30, 30, 30, 30)
        layout.setSpacing(20)
        
        # 本地保存设置
        local_widget = self.create_local_settings()
        layout.addWidget(local_widget)
        
        # 数据表现字段选择
        performance_group = self.create_performance_fields_selector()
        layout.addWidget(performance_group)
        
        # 通用设置
        common_group = QGroupBox('通用设置')
        common_layout = QVBoxLayout(common_group)
        
        # 最大采集次数
        max_count_layout = QHBoxLayout()
        max_count_label = QLabel('账号最大采集次数:')
        max_count_label.setFixedWidth(120)
        self.max_count_input = SpinBox()
        self.max_count_input.setRange(1, 99999)
        self.max_count_input.setValue(9999)
        self.max_count_input.setFixedWidth(150)
        max_count_layout.addWidget(max_count_label)
        max_count_layout.addWidget(self.max_count_input)
        max_count_layout.addStretch()
        
        common_layout.addLayout(max_count_layout)
        
        layout.addWidget(common_group)
        
        # 保存按钮
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        self.save_btn = PrimaryPushButton('保存设置', self, FIF.SAVE)
        self.save_btn.clicked.connect(self.save_settings_to_file)
        self.save_btn.setFixedWidth(120)
        button_layout.addWidget(self.save_btn)
        
        layout.addLayout(button_layout)
        layout.addStretch()
        
        # 设置滚动区域
        scroll.setWidget(content_widget)
        
        # 将滚动区域添加到页面
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.addWidget(scroll)
        
    def create_local_settings(self):
        """创建本地保存设置界面"""
        group = QGroupBox('本地保存配置')
        group_layout = QVBoxLayout(group)
        
        # 保存文件名称
        filename_layout = QHBoxLayout()
        filename_label = QLabel('保存文件名称:')
        filename_label.setFixedWidth(120)
        self.filename_input = LineEdit()
        self.filename_input.setPlaceholderText('例如: collected_data.xlsx')
        filename_layout.addWidget(filename_label)
        filename_layout.addWidget(self.filename_input)
        
        # 选择保存路径
        path_layout = QHBoxLayout()
        path_label = QLabel('保存路径:')
        path_label.setFixedWidth(120)
        self.path_input = LineEdit()
        self.path_input.setPlaceholderText('点击选择按钮选择保存路径')
        self.path_input.setReadOnly(True)
        self.path_btn = PushButton('选择路径', self, FIF.FOLDER)
        self.path_btn.clicked.connect(self.select_save_path)
        path_layout.addWidget(path_label)
        path_layout.addWidget(self.path_input)
        path_layout.addWidget(self.path_btn)
        
        group_layout.addLayout(filename_layout)
        group_layout.addLayout(path_layout)
        
        return group
    
    def create_performance_fields_selector(self):
        """创建数据表现字段选择器"""
        group = QGroupBox('数据表现字段选择')
        group_layout = QVBoxLayout(group)
        
        # # 提示文本
        # tip_label = QLabel('请选择需要采集的数据表现情况（默认全选）：')
        # tip_label.setStyleSheet('color: #666; font-size: 13px;')
        # group_layout.addWidget(tip_label)
        
        # 创建全选按钮
        select_all_layout = QHBoxLayout()
        self.select_all_btn = PushButton('全选', self, FIF.ACCEPT)
        self.select_all_btn.clicked.connect(self.select_all_performance_fields)
        self.deselect_all_btn = PushButton('取消全选', self, FIF.CANCEL)
        self.deselect_all_btn.clicked.connect(self.deselect_all_performance_fields)
        select_all_layout.addWidget(self.select_all_btn)
        select_all_layout.addWidget(self.deselect_all_btn)
        select_all_layout.addStretch()
        group_layout.addLayout(select_all_layout)
        
        # 数据表现字段列表
        self.performance_checkboxes = {}
        
        # 日常笔记字段
        daily_label = QLabel('日常笔记：')
        daily_label.setStyleSheet('font-weight: bold; margin-top: 10px;')
        group_layout.addWidget(daily_label)
        
        daily_fields = [
            ('日常笔记-图文+视频-近30天-全流量', '图文+视频 - 近30天'),
            ('日常笔记-图文-近30天-全流量', '图文 - 近30天'),
            ('日常笔记-视频-近30天-全流量', '视频 - 近30天'),
            ('日常笔记-图文+视频-近90天-全流量', '图文+视频 - 近90天'),
            ('日常笔记-图文-近90天-全流量', '图文 - 近90天'),
            ('日常笔记-视频-近90天-全流量', '视频 - 近90天'),
        ]
        
        daily_grid = QGridLayout()
        daily_grid.setSpacing(10)
        for i, (field_key, field_name) in enumerate(daily_fields):
            checkbox = CheckBox(field_name)
            checkbox.setChecked(True)  # 默认全选
            self.performance_checkboxes[field_key] = checkbox
            daily_grid.addWidget(checkbox, i // 2, i % 2)
        
        group_layout.addLayout(daily_grid)
        
        # 合作笔记字段
        coop_label = QLabel('合作笔记：')
        coop_label.setStyleSheet('font-weight: bold; margin-top: 10px;')
        group_layout.addWidget(coop_label)
        
        coop_fields = [
            ('合作笔记-图文+视频-近30天-全流量', '图文+视频 - 近30天'),
            ('合作笔记-图文-近30天-全流量', '图文 - 近30天'),
            ('合作笔记-视频-近30天-全流量', '视频 - 近30天'),
            ('合作笔记-图文+视频-近90天-全流量', '图文+视频 - 近90天'),
            ('合作笔记-图文-近90天-全流量', '图文 - 近90天'),
            ('合作笔记-视频-近90天-全流量', '视频 - 近90天'),
        ]
        
        coop_grid = QGridLayout()
        coop_grid.setSpacing(10)
        for i, (field_key, field_name) in enumerate(coop_fields):
            checkbox = CheckBox(field_name)
            checkbox.setChecked(True)  # 默认全选
            self.performance_checkboxes[field_key] = checkbox
            coop_grid.addWidget(checkbox, i // 2, i % 2)
        
        group_layout.addLayout(coop_grid)
        
        return group
    
    def select_all_performance_fields(self):
        """全选所有数据表现字段"""
        for checkbox in self.performance_checkboxes.values():
            checkbox.setChecked(True)
    
    def deselect_all_performance_fields(self):
        """取消全选所有数据表现字段"""
        for checkbox in self.performance_checkboxes.values():
            checkbox.setChecked(False)
            
    def select_save_path(self):
        """选择保存路径"""
        path = QFileDialog.getExistingDirectory(
            self,
            '选择保存路径',
            str(Path.home())
        )
        if path:
            self.path_input.setText(path)
        
    def load_settings(self):
        """从文件加载设置"""
        default_settings = {
            'save_mode': 'local',
            'local': {
                'filename': 'collected_data.xlsx',
                'path': str(Path.home() / 'Documents')
            },
            'performance_fields': [
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
            ],
            'max_count': 9999
        }
        
        try:
            if self.settings_file.exists():
                with open(self.settings_file, 'r', encoding='utf-8') as f:
                    loaded = json.load(f)
                    # 合并默认设置和加载的设置
                    if 'local' in loaded:
                        default_settings['local'].update(loaded['local'])
                    if 'performance_fields' in loaded:
                        default_settings['performance_fields'] = loaded['performance_fields']
                    if 'max_count' in loaded:
                        default_settings['max_count'] = loaded['max_count']
                    return default_settings
        except Exception as e:
            print(f'加载设置失败: {e}')
            
        return default_settings
        
    def load_ui_from_settings(self):
        """从设置加载UI状态"""
        # 本地保存设置
        self.filename_input.setText(self.settings['local']['filename'])
        self.path_input.setText(self.settings['local']['path'])
        
        # 数据表现字段选择
        selected_fields = self.settings.get('performance_fields', [])
        for field_key, checkbox in self.performance_checkboxes.items():
            checkbox.setChecked(field_key in selected_fields)
        
        # 通用设置
        self.max_count_input.setValue(self.settings['max_count'])
        
    def save_settings_to_file(self):
        """保存设置到文件"""
        # 获取当前UI的设置
        self.settings['save_mode'] = 'local'
        
        # 本地设置
        self.settings['local']['filename'] = self.filename_input.text().strip()
        self.settings['local']['path'] = self.path_input.text().strip()
        
        # 数据表现字段选择
        selected_fields = []
        for field_key, checkbox in self.performance_checkboxes.items():
            if checkbox.isChecked():
                selected_fields.append(field_key)
        self.settings['performance_fields'] = selected_fields
        
        # 通用设置
        self.settings['max_count'] = self.max_count_input.value()
        
        # 验证必填项
        if not self.settings['local']['filename']:
            InfoBar.warning(
                title='提示',
                content='请输入保存文件名称',
                orient=Qt.Horizontal,
                isClosable=True,
                position=InfoBarPosition.TOP,
                duration=2000,
                parent=self
            )
            return
        if not self.settings['local']['path']:
            InfoBar.warning(
                title='提示',
                content='请选择保存路径',
                orient=Qt.Horizontal,
                isClosable=True,
                position=InfoBarPosition.TOP,
                duration=2000,
                parent=self
            )
            return
        
        # 验证至少选择一个数据表现字段
        if not selected_fields:
            InfoBar.warning(
                title='提示',
                content='请至少选择一个数据表现字段',
                orient=Qt.Horizontal,
                isClosable=True,
                position=InfoBarPosition.TOP,
                duration=2000,
                parent=self
            )
            return
        
        # 保存到文件
        try:
            self.settings_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.settings_file, 'w', encoding='utf-8') as f:
                json.dump(self.settings, f, ensure_ascii=False, indent=2)
                
            InfoBar.success(
                title='保存成功',
                content='采集设置已保存',
                orient=Qt.Horizontal,
                isClosable=True,
                position=InfoBarPosition.TOP,
                duration=2000,
                parent=self
            )
        except Exception as e:
            InfoBar.error(
                title='保存失败',
                content=f'无法保存设置: {str(e)}',
                orient=Qt.Horizontal,
                isClosable=True,
                position=InfoBarPosition.TOP,
                duration=3000,
                parent=self
            )
