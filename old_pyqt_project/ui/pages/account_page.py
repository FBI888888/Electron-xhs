"""
账号管理页面
"""
import json
import os
from pathlib import Path
from PyQt5.QtCore import Qt, QThread, pyqtSignal
from PyQt5.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QTableWidget, 
                             QTableWidgetItem, QHeaderView, QMenu, QMessageBox, QDialog, QLabel)
from qfluentwidgets import (LineEdit, PrimaryPushButton, PushButton, 
                           FluentIcon as FIF, MessageBox, InfoBar, InfoBarPosition)
import requests


class EditAccountDialog(QDialog):
    """编辑账号对话框"""
    
    def __init__(self, account, parent=None):
        super().__init__(parent)
        self.account = account
        self.result_data = None
        self.init_ui()
        
    def init_ui(self):
        """初始化界面"""
        self.setWindowTitle('修改账号')
        self.resize(600, 200)
        
        layout = QVBoxLayout(self)
        layout.setContentsMargins(30, 30, 30, 30)
        layout.setSpacing(20)
        
        # 备注输入
        remark_layout = QHBoxLayout()
        remark_label = QLabel('备注名:')
        remark_label.setFixedWidth(80)
        self.remark_input = LineEdit()
        self.remark_input.setText(self.account.get('remark', ''))
        self.remark_input.setPlaceholderText('请输入备注名')
        remark_layout.addWidget(remark_label)
        remark_layout.addWidget(self.remark_input)
        
        # Cookies输入
        cookies_layout = QHBoxLayout()
        cookies_label = QLabel('Cookies:')
        cookies_label.setFixedWidth(80)
        self.cookies_input = LineEdit()
        self.cookies_input.setText(self.account.get('cookies', ''))
        self.cookies_input.setPlaceholderText('请输入Cookies')
        cookies_layout.addWidget(cookies_label)
        cookies_layout.addWidget(self.cookies_input)
        
        # 按钮
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        self.cancel_btn = PushButton('取消')
        self.cancel_btn.clicked.connect(self.reject)
        
        self.save_btn = PrimaryPushButton('保存')
        self.save_btn.clicked.connect(self.save_account)
        
        button_layout.addWidget(self.cancel_btn)
        button_layout.addWidget(self.save_btn)
        
        layout.addLayout(remark_layout)
        layout.addLayout(cookies_layout)
        layout.addLayout(button_layout)
        
        # 设置对话框样式
        self.setStyleSheet("""
            QDialog {
                background-color: white;
            }
            QLabel {
                font-size: 14px;
                color: #333;
            }
        """)
        
    def save_account(self):
        """保存账号修改"""
        remark = self.remark_input.text().strip()
        cookies = self.cookies_input.text().strip()
        
        if not remark:
            MessageBox('提示', '请输入备注名', self).exec_()
            return
            
        if not cookies:
            MessageBox('提示', '请输入Cookies', self).exec_()
            return
        
        self.result_data = {
            'remark': remark,
            'cookies': cookies
        }
        self.accept()


class CheckAccountThread(QThread):
    """检查账号状态的线程"""
    finished = pyqtSignal(bool, str, dict)  # 成功/失败, 消息, 数据
    
    def __init__(self, cookies):
        super().__init__()
        self.cookies = cookies
        
    def run(self):
        """执行账号检查"""
        try:
            url = 'https://pgy.xiaohongshu.com/api/solar/user/info'
            headers = {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'zh-CN,zh;q=0.9',
                'referer': 'https://pgy.xiaohongshu.com/solar/pre-trade/home',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
                'Cookie': self.cookies,
                'Host': 'pgy.xiaohongshu.com',
                'Connection': 'keep-alive'
            }
            
            response = requests.get(url, headers=headers, timeout=10)
            data = response.json()
            
            if data.get('success') and data.get('code') == 0:
                nick_name = ''
                role_info_list = data.get('data', {}).get('roleInfoList', [])
                if role_info_list:
                    nick_name = role_info_list[0].get('nickName', '')
                
                self.finished.emit(True, '账号有效', {
                    'nickName': nick_name,
                    'data': data.get('data', {})
                })
            else:
                self.finished.emit(False, data.get('msg', '账号验证失败'), {})
                
        except Exception as e:
            self.finished.emit(False, f'请求失败: {str(e)}', {})


class AccountPage(QWidget):
    """账号管理页面"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName('accountPage')
        self.data_file = Path('data/pgy_username.json')
        self.accounts = []
        self.check_threads = []  # 保存检查线程的引用，防止被垃圾回收
        # 批量检查的计数器
        self.batch_check_total = 0
        self.batch_check_completed = 0
        self.batch_check_success = 0
        self.batch_check_failed = 0
        self.init_ui()
        self.load_accounts()
        
    def init_ui(self):
        """初始化界面"""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(30, 30, 30, 30)
        layout.setSpacing(20)
        
        # 顶部操作区域
        top_layout = QHBoxLayout()
        
        # 备注输入框
        self.remark_input = LineEdit()
        self.remark_input.setPlaceholderText('备注名')
        self.remark_input.setFixedWidth(150)
        
        # Cookies输入框
        self.cookies_input = LineEdit()
        self.cookies_input.setPlaceholderText('请输入Cookies')
        self.cookies_input.setMinimumWidth(400)
        
        # 添加账号按钮
        self.add_btn = PrimaryPushButton('添加账号', self, FIF.ADD)
        self.add_btn.clicked.connect(self.add_account)
        
        # 检查全部账号按钮
        self.check_all_btn = PushButton('检查全部账号', self, FIF.SYNC)
        self.check_all_btn.clicked.connect(self.check_all_accounts)
        
        top_layout.addWidget(self.remark_input)
        top_layout.addWidget(self.cookies_input)
        top_layout.addWidget(self.add_btn)
        top_layout.addWidget(self.check_all_btn)
        top_layout.addStretch()
        
        # 表格
        self.table = QTableWidget()
        self.table.setColumnCount(4)
        self.table.setHorizontalHeaderLabels(['备注名', '蒲公英昵称', '账号状态', 'Cookies'])
        
        # 设置表格样式
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(3, QHeaderView.Stretch)
        
        self.table.setSelectionBehavior(QTableWidget.SelectRows)
        self.table.setContextMenuPolicy(Qt.CustomContextMenu)
        self.table.customContextMenuRequested.connect(self.show_context_menu)
        
        # 去除表格边框黑线
        self.table.setShowGrid(False)
        self.table.setStyleSheet("""
            QTableWidget {
                border: none;
                background-color: transparent;
            }
            QTableWidget::item {
                border: none;
                padding: 5px;
                color: #000000;
            }
            QTableWidget::item:selected {
                background-color: #e5f3ff;
                color: #000000;
            }
        """)
        
        layout.addLayout(top_layout)
        layout.addWidget(self.table)
        
    def load_accounts(self):
        """从JSON文件加载账号"""
        try:
            if self.data_file.exists():
                with open(self.data_file, 'r', encoding='utf-8') as f:
                    self.accounts = json.load(f)
                self.refresh_table()
        except Exception as e:
            InfoBar.error(
                title='加载失败',
                content=f'无法加载账号数据: {str(e)}',
                orient=Qt.Horizontal,
                isClosable=True,
                position=InfoBarPosition.TOP,
                duration=3000,
                parent=self
            )
            
    def save_accounts(self):
        """保存账号到JSON文件"""
        try:
            self.data_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.data_file, 'w', encoding='utf-8') as f:
                json.dump(self.accounts, f, ensure_ascii=False, indent=2)
        except Exception as e:
            InfoBar.error(
                title='保存失败',
                content=f'无法保存账号数据: {str(e)}',
                orient=Qt.Horizontal,
                isClosable=True,
                position=InfoBarPosition.TOP,
                duration=3000,
                parent=self
            )
            
    def refresh_table(self):
        """刷新表格显示"""
        self.table.setRowCount(len(self.accounts))
        for i, account in enumerate(self.accounts):
            self.table.setItem(i, 0, QTableWidgetItem(account.get('remark', '')))
            self.table.setItem(i, 1, QTableWidgetItem(account.get('nickName', '')))
            self.table.setItem(i, 2, QTableWidgetItem(account.get('status', '未检查')))
            self.table.setItem(i, 3, QTableWidgetItem(account.get('cookies', '')))
            
    def add_account(self):
        """添加账号"""
        remark = self.remark_input.text().strip()
        cookies = self.cookies_input.text().strip()
        
        if not remark:
            InfoBar.warning(
                title='提示',
                content='请输入备注名',
                orient=Qt.Horizontal,
                isClosable=True,
                position=InfoBarPosition.TOP,
                duration=2000,
                parent=self
            )
            return
            
        if not cookies:
            InfoBar.warning(
                title='提示',
                content='请输入Cookies',
                orient=Qt.Horizontal,
                isClosable=True,
                position=InfoBarPosition.TOP,
                duration=2000,
                parent=self
            )
            return
        
        # 检查账号
        InfoBar.info(
            title='验证中',
            content='正在验证账号...',
            orient=Qt.Horizontal,
            isClosable=True,
            position=InfoBarPosition.TOP,
            duration=2000,
            parent=self
        )
        
        thread = CheckAccountThread(cookies)
        thread.finished.connect(
            lambda success, msg, data: self.on_add_account_checked(success, msg, data, remark, cookies)
        )
        # 保存线程引用，防止被垃圾回收
        self.check_threads.append(thread)
        thread.finished.connect(lambda t=thread: self.on_thread_finished(t))
        thread.start()
        
    def on_add_account_checked(self, success, msg, data, remark, cookies):
        """账号检查完成回调"""
        if success:
            account = {
                'remark': remark,
                'nickName': data.get('nickName', ''),
                'status': '正常',
                'cookies': cookies
            }
            self.accounts.append(account)
            self.save_accounts()
            self.refresh_table()
            
            # 清空输入框
            self.remark_input.clear()
            self.cookies_input.clear()
            
            InfoBar.success(
                title='成功',
                content='账号添加成功',
                orient=Qt.Horizontal,
                isClosable=True,
                position=InfoBarPosition.TOP,
                duration=2000,
                parent=self
            )
        else:
            InfoBar.error(
                title='验证失败',
                content=msg,
                orient=Qt.Horizontal,
                isClosable=True,
                position=InfoBarPosition.TOP,
                duration=3000,
                parent=self
            )
            
    def check_all_accounts(self):
        """检查全部账号"""
        if not self.accounts:
            InfoBar.warning(
                title='提示',
                content='没有账号需要检查',
                orient=Qt.Horizontal,
                isClosable=True,
                position=InfoBarPosition.TOP,
                duration=2000,
                parent=self
            )
            return
            
        # 初始化批量检查计数器
        self.batch_check_total = len(self.accounts)
        self.batch_check_completed = 0
        self.batch_check_success = 0
        self.batch_check_failed = 0
        
        InfoBar.info(
            title='检查中',
            content=f'正在检查 {self.batch_check_total} 个账号...',
            orient=Qt.Horizontal,
            isClosable=True,
            position=InfoBarPosition.TOP,
            duration=2000,
            parent=self
        )
        
        # 清空旧的线程引用
        self.check_threads.clear()
        
        # 创建并启动线程，保存引用防止被垃圾回收
        for i, account in enumerate(self.accounts):
            thread = CheckAccountThread(account['cookies'])
            # 使用带默认参数的lambda来捕获当前的i值和thread对象
            thread.finished.connect(
                lambda success, msg, data, idx=i: self.on_account_checked(idx, success, msg, data, is_batch=True)
            )
            # 线程完成后自动从列表中移除（使用默认参数捕获thread）
            thread.finished.connect(lambda t=thread: self.on_thread_finished(t))
            self.check_threads.append(thread)
            thread.start()
            
    def on_thread_finished(self, thread):
        """线程完成后的清理"""
        try:
            if thread in self.check_threads:
                self.check_threads.remove(thread)
        except:
            pass
    
    def on_account_checked(self, index, success, msg, data, show_notification=False, is_batch=False):
        """单个账号检查完成"""
        if 0 <= index < len(self.accounts):
            self.accounts[index]['status'] = '正常' if success else '失效'
            if success and data.get('nickName'):
                self.accounts[index]['nickName'] = data['nickName']
            self.save_accounts()
            self.refresh_table()
            
            # 如果是批量检查，更新计数器
            if is_batch:
                self.batch_check_completed += 1
                if success:
                    self.batch_check_success += 1
                else:
                    self.batch_check_failed += 1
                
                # 如果所有账号都检查完成，显示汇总
                if self.batch_check_completed >= self.batch_check_total:
                    if self.batch_check_failed == 0:
                        InfoBar.success(
                            title='检查完成',
                            content=f'全部 {self.batch_check_total} 个账号验证成功！',
                            orient=Qt.Horizontal,
                            isClosable=True,
                            position=InfoBarPosition.TOP,
                            duration=3000,
                            parent=self
                        )
                    else:
                        InfoBar.warning(
                            title='检查完成',
                            content=f'成功: {self.batch_check_success} 个 | 失败: {self.batch_check_failed} 个',
                            orient=Qt.Horizontal,
                            isClosable=True,
                            position=InfoBarPosition.TOP,
                            duration=4000,
                            parent=self
                        )
            
            # 如果需要显示通知（单个检查时）
            elif show_notification:
                if success:
                    InfoBar.success(
                        title='检查成功',
                        content=f'账号 "{self.accounts[index]["remark"]}" 状态正常',
                        orient=Qt.Horizontal,
                        isClosable=True,
                        position=InfoBarPosition.TOP,
                        duration=2000,
                        parent=self
                    )
                else:
                    InfoBar.error(
                        title='检查失败',
                        content=f'账号 "{self.accounts[index]["remark"]}" {msg}',
                        orient=Qt.Horizontal,
                        isClosable=True,
                        position=InfoBarPosition.TOP,
                        duration=3000,
                        parent=self
                    )
            
    def show_context_menu(self, pos):
        """显示右键菜单"""
        if self.table.rowCount() == 0:
            return
            
        menu = QMenu(self)
        # 添加菜单项间距样式
        menu.setStyleSheet("""
            QMenu {
                padding: 5px;
            }
            QMenu::item {
                padding: 8px 25px;
                margin: 2px 5px;
                border-radius: 4px;
            }
            QMenu::item:selected {
                background-color: #e5f3ff;
            }
        """)
        
        check_action = menu.addAction('检查账号')
        edit_action = menu.addAction('修改账号')
        delete_action = menu.addAction('删除账号')
        
        action = menu.exec_(self.table.mapToGlobal(pos))
        
        row = self.table.currentRow()
        if row < 0:
            return
            
        if action == check_action:
            self.check_single_account(row)
        elif action == edit_action:
            self.edit_account(row)
        elif action == delete_action:
            self.delete_account(row)
            
    def check_single_account(self, row):
        """检查单个账号"""
        if 0 <= row < len(self.accounts):
            account = self.accounts[row]
            thread = CheckAccountThread(account['cookies'])
            thread.finished.connect(
                lambda success, msg, data: self.on_account_checked(row, success, msg, data, show_notification=True)
            )
            # 保存线程引用，防止被垃圾回收
            self.check_threads.append(thread)
            thread.finished.connect(lambda t=thread: self.on_thread_finished(t))
            thread.start()
            
            InfoBar.info(
                title='检查中',
                content=f'正在检查账号: {account["remark"]}',
                orient=Qt.Horizontal,
                isClosable=True,
                position=InfoBarPosition.TOP,
                duration=2000,
                parent=self
            )
            
    def edit_account(self, row):
        """编辑账号"""
        if 0 <= row < len(self.accounts):
            account = self.accounts[row]
            
            # 打开编辑对话框
            dialog = EditAccountDialog(account, self)
            if dialog.exec_():
                # 用户点击了保存
                result = dialog.result_data
                if result:
                    # 更新备注和Cookies
                    self.accounts[row]['remark'] = result['remark']
                    old_cookies = self.accounts[row]['cookies']
                    self.accounts[row]['cookies'] = result['cookies']
                    
                    # 如果Cookies变了，重新验证账号
                    if old_cookies != result['cookies']:
                        # 重新验证
                        InfoBar.info(
                            title='验证中',
                            content='正在验证新的Cookies...',
                            orient=Qt.Horizontal,
                            isClosable=True,
                            position=InfoBarPosition.TOP,
                            duration=2000,
                            parent=self
                        )
                        
                        thread = CheckAccountThread(result['cookies'])
                        thread.finished.connect(
                            lambda success, msg, data: self.on_edit_account_checked(row, success, msg, data)
                        )
                        # 保存线程引用，防止被垃圾回收
                        self.check_threads.append(thread)
                        thread.finished.connect(lambda t=thread: self.on_thread_finished(t))
                        thread.start()
                    else:
                        # Cookies没变，直接保存
                        self.save_accounts()
                        self.refresh_table()
                        
                        InfoBar.success(
                            title='修改成功',
                            content='账号信息已更新',
                            orient=Qt.Horizontal,
                            isClosable=True,
                            position=InfoBarPosition.TOP,
                            duration=2000,
                            parent=self
                        )
    
    def on_edit_account_checked(self, index, success, msg, data):
        """编辑账号后的验证回调"""
        if 0 <= index < len(self.accounts):
            self.accounts[index]['status'] = '正常' if success else '失效'
            if success and data.get('nickName'):
                self.accounts[index]['nickName'] = data['nickName']
            
            self.save_accounts()
            self.refresh_table()
            
            if success:
                InfoBar.success(
                    title='修改成功',
                    content='账号信息已更新并验证通过',
                    orient=Qt.Horizontal,
                    isClosable=True,
                    position=InfoBarPosition.TOP,
                    duration=2000,
                    parent=self
                )
            else:
                InfoBar.warning(
                    title='验证失败',
                    content=f'账号信息已更新，但验证失败: {msg}',
                    orient=Qt.Horizontal,
                    isClosable=True,
                    position=InfoBarPosition.TOP,
                    duration=3000,
                    parent=self
                )
            
    def delete_account(self, row):
        """删除账号"""
        if 0 <= row < len(self.accounts):
            account = self.accounts[row]
            
            # 确认对话框
            w = MessageBox('确认删除', f'确定要删除账号 "{account["remark"]}" 吗？', self)
            if w.exec_():
                self.accounts.pop(row)
                self.save_accounts()
                self.refresh_table()
                
                InfoBar.success(
                    title='删除成功',
                    content='账号已删除',
                    orient=Qt.Horizontal,
                    isClosable=True,
                    position=InfoBarPosition.TOP,
                    duration=2000,
                    parent=self
                )
