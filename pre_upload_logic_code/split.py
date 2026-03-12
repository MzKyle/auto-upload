from pathlib import Path

import xml.etree.ElementTree as ET
from pathlib import Path
import shutil
from typing import Union
# import Tuple
from typing import Union, Tuple  # 添加 Tuple 导入


def debug_move(src, dst):
    """
    调试移动操作，查看实际发生了什么
    """
    src_path = Path(src).resolve()
    dst_path = Path(dst).resolve()
    
    print(f"源路径：{src_path}")
    print(f"目标路径：{dst_path}")
    print(f"源设备：{src_path.stat().st_dev}")
    print(f"目标设备：{dst_path.parent.stat().st_dev if dst_path.parent.exists() else 'N/A'}")
    print(f"是否同设备：{src_path.stat().st_dev == dst_path.parent.stat().st_dev if dst_path.parent.exists() else 'Unknown'}")
    
    src_exists_before = src_path.exists()
    print(f"\n移动前源文件存在：{src_exists_before}")
    
    try:
        result = shutil.move(str(src_path), str(dst_path))
        print(f"shutil.move 返回值：{result}")
    except Exception as e:
        print(f"移动失败：{e}")
        return
    
    src_exists_after = src_path.exists()
    dst_exists = Path(result).exists()
    
    print(f"\n移动后源文件存在：{src_exists_after}")
    print(f"目标文件存在：{dst_exists}")
    
    if src_exists_after and dst_exists:
        print("⚠️  警告：原文件仍在，可能是跨设备复制后删除失败")
    elif not src_exists_after and dst_exists:
        print("✓ 移动成功")
    elif src_exists_after and not dst_exists:
        print("❌ 移动失败，文件未变化")




def split_path(path: Union[str, Path]) -> Tuple[str, str]:
    """
    将路径拆分为 (父目录, 当前文件夹/文件名)
    
    Args:
        path: 输入路径，如 "D:\2026-02-25-one-2mm\14-05-30_teleop"
    
    Returns:
        (父目录路径, 当前名称) 元组
    
    Examples:
        >>> split_path(r"D:\2026-02-25-one-2mm\14-05-30_teleop")
        ('D:\\2026-02-25-one-2mm', '14-05-30_teleop')
        
        >>> split_path("D:\\2026-02-25-one-2mm")
        ('D:\\', '2026-02-25-one-2mm')
    """
    p = Path(path).resolve()
    parent_path = str(p.parent)
    name = p.name
    return (parent_path, name)

def read_xml_basic(file_path):
    """
    基础 XML 读取方法
    """
    try:
        # 解析 XML 文件
        tree = ET.parse(file_path)
        root = tree.getroot()
        
        # print(f"✓ 成功解析：{file_path}")
        # print(f"  根标签：{root.tag}")
        # print(f"  根属性：{root.attrib}")
        
        return  root
        
    except ET.ParseError as e:
        # print(f"❌ XML 格式错误：{e}")
        return None
    except FileNotFoundError:
        # print(f"❌ 文件不存在：{file_path}")
        return None



def create_project_structure(base_path, structure):
    """
    根据结构字典批量创建文件夹
    """
    for folder_name, subfolders in structure.items():
        current_path = Path(base_path) / folder_name
        current_path.mkdir(parents=True, exist_ok=True)
        # print(f"✓ 创建：{current_path}")
        
        # 递归创建子文件夹
        if isinstance(subfolders, dict):
            create_project_structure(current_path, subfolders)
        elif isinstance(subfolders, list):
            for sub in subfolders:
                (current_path / sub).mkdir(parents=True, exist_ok=True)
                # print(f"  ✓ 创建子文件夹：{current_path / sub}")

def get_tag_values_basic(root, tag_name):
    """
    基础方法：查找单个或多个标签
    """
    # print(f"🔍 查找标签：<{tag_name}>")
    
    # 1. find() - 查找第一个匹配的子元素
    first_elem = root.find(f'.//{tag_name}')  # .// 表示递归查找
    # if first_elem is not None:
    #     print(f"  ✓ 第一个匹配：{first_elem.text}")
    
    # 2. findall() - 查找所有匹配的子元素（返回列表）
    all_elems = root.findall(f'.//{tag_name}')
    values = [elem.text for elem in all_elems]
    # print(f"  ✓ 所有匹配（{len(all_elems)}个）：{values}")
    
    # 3. findtext() - 直接获取文本（不存在返回默认值）
    text = root.findtext(f'.//{tag_name}', default='N/A')
    # print(f"  ✓ 直接获取文本：{text}")
    
    return values

def check_file_exists(file_path):
    """
    检测文件是否存在（最推荐的方式）
    """
    path = Path(file_path)
    
    # 检测路径是否存在（文件或文件夹）
    if path.exists():
        #print(f"✓ 路径存在：{path}")
        
        # 进一步判断是文件还是文件夹
        if path.is_file():
            return True
        elif path.is_dir():
            return False
    else:
        return False

def traverse_directory(path, pattern=None):
    """
    遍历文件夹，返回所有文件和子文件夹
    
    Args:
        path: 要遍历的目录路径
        pattern: 可选，文件匹配模式，如 "*.py", "*.txt"
    """
    folders = []
    target_path = Path(path)
    
    if not target_path.exists():
        #print(f"❌ 路径不存在：{path}")
        return []
    
    #print(f"\n📂 遍历目录：{target_path.absolute()}\n")
    
    # 遍历所有内容
    for item in target_path.iterdir():
        if item.is_dir():
            #print(f"📁 [文件夹] {item.name}")
            folders.append(path+'\\'+item.name)
    return folders




def split_type(path):
    f = traverse_directory(path)

    # 定义项目结构
    project_structure = {
            "vla": ["1mm", "1-2mm", "2mm", "3mm"],
            "teleop": ["1mm", "1-2mm","2mm","3mm"],
            "RL":["1mm", "1-2mm", "2mm", "3mm"],
            "unknown":[],
    }
    
    create_project_structure(path,project_structure)

    for i in f:
        # str 
        file_name = i + "\\annotation\\segment_timestamps.xml"
        if check_file_exists(file_name):
            failed = False
            b_min = 0 
            b_max = 0 
            data_type = ''
            quality_type = ''
            root = read_xml_basic(file_name)
            if root:
                res = get_tag_values_basic(root,'data_spec_min')
                if len(res) != 1:
                    failed = True
                else:
                    b_min = int(res[0])
                
                res = get_tag_values_basic(root,'data_spec_max')

                if len(res ) != 1:
                    failed = True
                else:
                    b_max = int(res[0])

                res = get_tag_values_basic(root,'data_type')
                if len(res) !=1:
                    failed = True 
                else:
                    data_type = str(res[0])
                res = get_tag_values_basic(root,'quality_type')
                if len(res ) != 1 :
                    failed = True
                else:
                    quality_type = str(res[0])
            else:
                failed = True
            #print(b_min , b_max , data_type,quality_type)
            parent , file_name = split_path(i)
            base = parent
            if failed:
                base = base + '\\unknown\\'
                #shutil.move(str(i), parent+ '\\unknown\\'+file_name)
            else:
                if quality_type == 'bad':
                    base = base + '\\RL\\'
                else:
                    if 'teleop' in data_type:
                        base = base + '\\teleop\\'
                    else:
                        base = base + '\\vla\\'
                
                if b_min == 1 and b_max == 1:
                    base = base + '1mm\\'
                elif b_min == 1 and b_max == 2:
                    base = base + '1-2mm\\'
                elif b_min == 2 and b_max == 2:
                    base = base + '2mm\\'
                elif b_min == 3 and b_max == 3 :
                    base = base +   '3mm\\'
            # print(str(i))
            # print(base+file_name)
            debug_move(str(i), base+file_name)