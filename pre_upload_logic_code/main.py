import sys, os, time, shutil, pathlib
from PyQt5.QtCore import Qt, QThread, pyqtSignal
from PyQt5.QtWidgets import (QApplication, QWidget, QVBoxLayout, QHBoxLayout,
                             QListWidget, QListWidgetItem, QPushButton, QLabel,
                             QGroupBox, QMainWindow, QMessageBox)

# -------------------- 通用拖放列表 --------------------
import os, pathlib, urllib.parse
from PyQt5.QtCore import Qt, pyqtSignal
from PyQt5.QtWidgets import QListWidget, QListWidgetItem
import threading
import subprocess
import re
import psutil
from clean import process_data_folders
from pathlib import Path
from datetime import datetime
from split import split_type

def kill_process_tree(proc: subprocess.Popen, timeout=3):
    """把 proc 及其所有子孙进程全部干掉"""
    if proc.poll() is not None:          # 已经死了
        return
    try:
        parent = psutil.Process(proc.pid)
        children = parent.children(recursive=True)   # 所有子孙
        for child in children:
            child.terminate()            # 先礼貌
        _, alive = psutil.wait_procs(children, timeout=timeout)
        for p in alive:
            p.kill()                     # 再强制
        parent.terminate()
        parent.wait(timeout)
        parent.kill()
    except psutil.NoSuchProcess:
        pass


class DroppableList(QListWidget):
    files_dropped = pyqtSignal(list)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAcceptDrops(True)

    # ---------- 拖进来 ----------
    def dragEnterEvent(self, e):
        if e.mimeData().hasUrls():
            e.acceptProposedAction()

    def dragMoveEvent(self, e):
        if e.mimeData().hasUrls():
            e.setDropAction(Qt.CopyAction)
            e.accept()

    # ---------- 放下 ----------
    def dropEvent(self, e):
        if not e.mimeData().hasUrls():
            return

        urls = e.mimeData().urls()
        local_files = []
        for u in urls:
            # 1. 先按 Qt 官方方法拿一次（Linux/mac 通常 OK）
            path = u.toLocalFile()
            # 2. Windows 下中文/空格目录 toLocalFile() 可能为空 → 手动解析
            if not path:
                raw = u.toString()          # file:///C:%5C%E4%B8%AD%E6%96%87%20dir
                if raw.startswith("file:///"):
                    path = urllib.parse.unquote(raw)[8:]   # 去掉 file:///
                    # 去掉 Windows 下多余的 '/'  （/D:/xxx → D:/xxx）
                    if len(path) >= 3 and path[0] == '/' and path[2] == ':':
                        path = path[1:]
            # 3. 只要路径真实存在就收（文件或文件夹）
            if pathlib.Path(path).exists():
                local_files.append(path)

        if local_files:
            self.files_dropped.emit(local_files)
            # print(local_files)
            e.acceptProposedAction()

# -------------------- 抽象槽位 --------------------
class BaseSlot(QWidget):
    """流水线框架：队列+拖放+线程调度"""
    task_finished = pyqtSignal(list)   # 把处理完的路径抛给下游
    update_state = pyqtSignal(str)
    def __init__(self, name: str):
        super().__init__()
        self.running_flag = True
        self.name = name
        self._queue = []
        self._worker = None
        self.slot_lock = threading.Lock()
        self._init_ui()

        self.update_state.connect(self.update_ui)


        self._worker = Worker(self)
        self._worker.finished.connect(self._on_worker_done)
        self._worker.start()

    # ---- UI ----
    def _init_ui(self):
        box = QGroupBox(self.name)
        lay = QVBoxLayout(box)
        self.list = DroppableList()
        self.list.files_dropped.connect(self.append_files)
        lay.addWidget(self.list)
        self.label = QLabel("当前流程:未开始")
        # self.btn.clicked.connect(self._process_one)
        lay.addWidget(self.label)
        main = QVBoxLayout(self)
        main.addWidget(box)

    def update_ui(self,precent):
        self.label.setText('当前流程:'+precent)

    # ---- 公共逻辑 ----
    def append_files(self, files):
        """真正处理单个文件/目录，返回处理后的路径（或任意标识）"""
        raise NotImplementedError

    def _on_worker_done(self, fp):
        self.btn.setEnabled(True)
        self.task_finished.emit(fp)

    # ---- 子类必须实现 ----
    def process(self, slot):
        """真正处理单个文件/目录，返回处理后的路径（或任意标识）"""
        raise NotImplementedError


# -------------------- 通用Worker --------------------
class Worker(QThread):
    finished = pyqtSignal(str)
    def __init__(self, slot: BaseSlot):
        super().__init__()
        self.slot = slot
    def run(self):
        out = self.slot.process(self.slot)   # 调用重载方法
        # self.finished.emit(out)


# -------------------- 三个具体模块 --------------------
class Module1(BaseSlot):
    def __init__(self):
        super().__init__("清理")
    
    def process(self, slot):
        # 示例：把文件/目录复制到 module2_output/
        while slot.running_flag:
            if not self._queue:
                time.sleep(1)
                slot.update_state.emit('全部完成')
            else:
                files = self._queue.pop(0)    
                
                process_data_folders(files)

                split_type(files)

                self.list.takeItem(0)
                # if res == True:
                    #进入下一步
                print('emit !!')
                self.task_finished.emit([files])
        return True          # 把新路径继续往下传
            
    def append_files(self, files):
        for f in files:
            if  os.path.isdir(f):
                with self.slot_lock:
                    self._queue.append(f)
                item_txt = os.path.basename(f)
                if os.path.isdir(f):
                    item_txt = "[DIR] " + item_txt
                self.list.addItem(QListWidgetItem(item_txt))



def simple_compress_with_progress(folder_path, output_path, slot, password=None):
    """简单的压缩函数，带基本进度显示"""
    if not os.path.exists(folder_path):
        print(f"错误：文件夹 {folder_path} 不存在")
        return False
    
    print(f"开始压缩: {folder_path}")
    
    # 统计文件数量
    file_count = 0
    for root, dirs, files in os.walk(folder_path):
        file_count += len(files)
    
    print(f"文件总数: {file_count}")
    
    # 构建命令
    cmd = ['7z', 'a', '-bsp1', output_path, folder_path + '\\']
    if password:
        cmd.extend(['-p' + password])
    
    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True
        )
        
        processed = 0
        
        for line in iter(process.stdout.readline, ''):
            line = line.strip()

            if slot.running_flag == False:
                kill_process_tree(process)
                break

            # 查找进度信息
            if '%' in line:
                # 提取百分比
                percent_match = re.search(r'(\d+)%', line)
                if percent_match:
                    percent = int(percent_match.group(1))
                    
                    # 查找已处理文件数
                    files_match = re.search(r'(\d+)\s+files', line)
                    if files_match:
                        processed = int(files_match.group(1))
                    
                    # 显示进度条
                    bar_length = 30
                    filled = int(bar_length * percent / 100)
                    bar = '█' * filled + '░' * (bar_length - filled)
                    
                    # print(f"\r进度: [{bar}] {percent}% ({processed}/{file_count} 文件)", end='')
                    # precent 
                    slot.update_state.emit(str(percent)+'%')
        
        process.wait()
        
        if process.returncode == 0:
            print("\n✅ 压缩完成!")
            return True
        else:
            print(f"\n❌ 压缩失败，返回码: {process.returncode}")
            return False
            
    except Exception as e:
        print(f"错误: {str(e)}")
        return False

class Module2(BaseSlot):
    def __init__(self):
        super().__init__("压缩")

        self.out_dir = pathlib.Path("module2_output")
        self.out_dir.mkdir(exist_ok=True)
    def process(self, slot):
        # work 会调用这边
        while slot.running_flag:
            if not self._queue:
                #队列为空
                time.sleep(1)
                slot.update_state.emit('全部完成')
            else:
                files = self._queue.pop(0)
                # print('start zip ' , files)
                path = Path(files)
                print(path)
                path = str(path.parent)
                ts = datetime.now().strftime("%y-%m-%d_%H-%M-%S")
                # print(str(ts)+)
                zip_name = f"{ts}.zip"
                
                zfiles = path +zip_name
                # print(path)
                # print(zfiles)
                res = simple_compress_with_progress(files,zfiles,slot)
                
                self.list.takeItem(0)
                if res == True:
                    #进入下一步
                    print('emit !!')
                    self.task_finished.emit([zfiles])
                else:
                    #重新来
                    self._queue.append(files)
                    item_txt = os.path.basename(files)
                    self.list.addItem(QListWidgetItem(item_txt))
        return True          # 把新路径继续往下传

    def append_files(self, files):
        for f in files:
            if  os.path.isdir(f):
                with self.slot_lock:
                    self._queue.append(f)
                item_txt = os.path.basename(f)
                if os.path.isdir(f):
                    item_txt = "[DIR] " + item_txt
                self.list.addItem(QListWidgetItem(item_txt))


def simple_ossutil_send(folder_path , slot):
    """简单的压缩函数，带基本进度显示"""
    # 构建命令
    cmd = ['ossutil.exe', 'cp', folder_path,'oss://irootechwelding/station2/','--bigfile-threshold=104857600'\
    ,'--parallel=3','--job=3' ,'--part-size','100M'
    ]
    
    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True
        )
        
        processed = 0
        
        for line in iter(process.stdout.readline, ''):
            #print(line)
            m = re.search(r'(\d+(?:\.\d+)?)%', line)
            if m:
                percent = float(m.group(1))
                # print(str(percent))        # 0.0
                slot.update_state.emit(str(percent)+'%')

            if slot.running_flag == False:
                kill_process_tree(process)
                break

                    # slot.update_state.emit(str(percent)+'%')
        
        process.wait()
        
        if process.returncode == 0:
            print("\n✅ 上传完成!")
            return True
        else:
            print(f"\n❌ 上传失败，返回码: {process.returncode}")
            return False
            
    except Exception as e:
        print(f"错误: {str(e)}")
        return False




class Module3(BaseSlot):
    def __init__(self):
        super().__init__("上传")
        self.zip_dir = pathlib.Path("module3_zip")
        self.zip_dir.mkdir(exist_ok=True)
    def process(self, slot):
        # 示例：把文件/目录复制到 module2_output/
        while slot.running_flag:
            if not self._queue:
                #队列为空
                time.sleep(1)
                slot.update_state.emit('全部完成')
            else:
                files = self._queue.pop(0)
                # print('start zip ' , files)
                res = simple_ossutil_send(files,slot)
                self.list.takeItem(0)
                if res == False:
                    # 重新塞进去
                    self._queue.append(files)
                    item_txt = os.path.basename(files)
                    self.list.addItem(QListWidgetItem(item_txt))


        return True          # 把新路径继续往下传
        
    def append_files(self, files):
        print('here')
        print(files)
        for f in files:
            if os.path.isfile(f) and f.lower().endswith('.zip') :
                print('access ' , f)
                with self.slot_lock:
                    self._queue.append(f)
                item_txt = os.path.basename(f)
                if os.path.isdir(f):
                    item_txt = "[DIR] " + item_txt
                self.list.addItem(QListWidgetItem(item_txt))




# -------------------- 主窗口 --------------------
class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("上传小工具 station1")
        self.resize(700, 500)
        self._init_ui()
        self._bind_pipeline()

    def _init_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        lay = QHBoxLayout(central)
        # 换成三个不同模块
        self.slot1 = Module1()
        self.slot2 = Module2()
        self.slot3 = Module3()
        lay.addWidget(self.slot1)
        lay.addWidget(self.slot2)
        lay.addWidget(self.slot3)
        self.setAcceptDrops(True)

    def _bind_pipeline(self):
        self.slot1.task_finished.connect(self.slot2.append_files)
        self.slot2.task_finished.connect(self.slot3.append_files)

    # 主窗口拖放默认进到 slot1
    def dragEnterEvent(self, e):
        if e.mimeData().hasUrls():
            e.acceptProposedAction()
    def dropEvent(self, e):
        files = [u.toLocalFile() for u in e.mimeData().urls()]
        self.slot1.append_files(files)

    def closeEvent(self, event):
        self.slot1.running_flag = False
        self.slot1._worker.wait()
        print('thread1 exit')
        self.slot2.running_flag = False
        self.slot2._worker.wait()
        print('thread2 exit')
        self.slot3.running_flag = False
        self.slot3._worker.wait()
        print('thread3 exit')




# -------------------- main --------------------
if __name__ == '__main__':
    app = QApplication(sys.argv)
    w = MainWindow()
    w.show()
    sys.exit(app.exec_())