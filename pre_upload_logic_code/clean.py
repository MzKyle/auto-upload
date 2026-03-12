import os
import csv
import json
import re
from datetime import datetime, timedelta

CAMERA_DIR_NAMES = [
    "camera",
    "camera_extra",
    "camera_044030420130",
    "camera_044030420154",
    "camera_044030420182"
]


def process_data_folders(root_dir):
    """
    处理根目录下的所有数据文件夹
    """
    # 遍历根目录下的所有子文件夹（数据文件夹）
    for data_folder in os.listdir(root_dir):
        data_folder_path = os.path.join(root_dir, data_folder)

        # 只处理目录
        if not os.path.isdir(data_folder_path):
            continue

        print(f"开始处理数据文件夹: {data_folder}")

        # 定义各文件夹路径
        welding_state_path = os.path.join(data_folder_path, "welding_state")
        weld_signal_path = os.path.join(welding_state_path, "weld_signal.csv")
        # camera_path = os.path.join(data_folder_path, "camera")
        # camera_extra_path = os.path.join(data_folder_path, "camera_extra")

        # 检查必要的文件和文件夹是否存在
        if not os.path.exists(weld_signal_path):
            print(f"警告: {weld_signal_path} 不存在，跳过此文件夹")
            continue

        # if not os.path.exists(camera_path):
        #     print(f"警告: {camera_path} 不存在，跳过此文件夹")
        #     continue

        # if not os.path.exists(camera_extra_path):
        #     print(f"警告: {camera_extra_path} 不存在，跳过此文件夹")
        #     continue

        # 读取焊接信号文件，获取起弧和收弧时间戳
        start_time, end_time = read_weld_signal(weld_signal_path)

        if start_time is None or end_time is None:
            print(f"警告: 无法获取有效的时间戳，跳过此文件夹")
            continue

        # 计算扩展后的时间范围（前后各5秒，即5000000微秒）
        expand_ms = 5000000
        start_range = start_time - expand_ms
        end_range = end_time + expand_ms

        print(f"时间范围: {start_range} 到 {end_range} (微秒)")

        # print(data_folder_path)
        for _folder in os.listdir(data_folder_path):
            if 'camera_0' in str(_folder):
                print('找到camera目录 ', _folder)
                cam_dir_path = os.path.join(data_folder_path, _folder)
                if os.path.exists(cam_dir_path):
                    clean_images(cam_dir_path, start_range, end_range)
        # for cam_dir_name in CAMERA_DIR_NAMES:
        #     cam_dir_path = os.path.join(data_folder_path, cam_dir_name)
        #     if os.path.exists(cam_dir_path):
        #         print(f"清理相机目录: {cam_dir_path}")
        #         clean_images(cam_dir_path, start_range, end_range)
        #     else:
        #         print(f"提升: {cam_dir_path} 不存在，跳过该清理目录")

        # # 清理camera文件夹
        # clean_images(camera_path, start_range, end_range)

        # # 清理camera_extra文件夹
        # clean_images(camera_extra_path, start_range, end_range)

        print(f"数据文件夹 {data_folder} 处理完成\n")


def read_weld_signal(file_path):
    """读取焊接信号文件，返回(起弧时间戳, 收弧时间戳)：
       起弧=文件中第一个 True 的时间戳；收弧=文件中最后一个 False 的时间戳。"""
    start_time = None   # 第一个 True
    end_time = None     # 最后一个 False

    import re
    # 形如：<ts><空白>data:<空白><True/False>
    pat = re.compile(r'^\s*(\d+)\s+[^:]*:\s*(true|false)\s*$', re.IGNORECASE)

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                s = line.strip()
                if not s:
                    continue

                m = pat.match(s)
                if m:
                    ts = int(m.group(1))
                    val_true = (m.group(2).lower() == 'true')
                else:
                    # 兜底：从整行抓时间戳与布尔字样
                    ts_m = re.search(r'(\d+)', s)
                    val_m = re.search(r'(true|false)', s, re.IGNORECASE)
                    if not ts_m or not val_m:
                        continue
                    ts = int(ts_m.group(1))
                    val_true = (val_m.group(1).lower() == 'true')

                if val_true:
                    if start_time is None:       # 只记录第一个 True
                        start_time = ts
                else:
                    end_time = ts                # 持续更新最后一个 False
    except Exception:
        # 读取/解析异常时，保持None返回，方便上层判断
        pass

    return start_time, end_time


def clean_images(folder_path, start_range, end_range):
    """
    清理文件夹中不在时间范围内的图像文件
    """
    # 统计删除的文件数量
    deleted_count = 0

    # 遍历文件夹中的所有文件
    for filename in os.listdir(folder_path):
        # 只处理jpg文件
        if not filename.lower().endswith('.jpg'):
            continue

        file_path = os.path.join(folder_path, filename)

        # 提取文件名中的时间戳（去除.jpg扩展名）
        try:
            timestamp_str = os.path.splitext(filename)[0]
            timestamp = int(timestamp_str)

            # 检查时间戳是否在范围内
            if timestamp < start_range or timestamp > end_range:
                os.remove(file_path)
                deleted_count += 1

        except ValueError:
            print(f"警告: 文件名 {filename} 不包含有效的时间戳，已跳过")
        except Exception as e:
            print(f"删除文件 {filename} 时出错: {str(e)}")

    print(f"在 {os.path.basename(folder_path)} 中删除了 {deleted_count} 个文件")


# ============================================================
# 数采模式：读取数据文件夹中的时间戳和元信息
# ============================================================

def _parse_date_from_path(path):
    """从路径中提取形如 YYYY-MM-DD 的日期字符串"""
    pat = re.compile(r'(\d{4}-\d{2}-\d{2})')
    for part in reversed(path.replace('\\', '/').split('/')):
        m = pat.match(part)
        if m:
            return m.group(1)
    return None


def _us_to_timestr(date_str, microseconds):
    """将微秒偏移量（相对日期 00:00:00）转换为可读时间字符串"""
    if date_str is None or microseconds is None:
        return None
    try:
        base = datetime.strptime(date_str, "%Y-%m-%d")
        ts = base + timedelta(microseconds=microseconds)
        return ts.strftime("%Y-%m-%d %H:%M:%S.%f")
    except Exception:
        return str(microseconds)


def _read_csv_timestamps(file_path):
    """读取 CSV 文件中第一列的时间戳，返回 (最小值, 最大值, 行数)"""
    ts_min = None
    ts_max = None
    count = 0
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                parts = re.split(r'[,\s]+', line)
                if not parts:
                    continue
                try:
                    ts = int(parts[0])
                except (ValueError, IndexError):
                    continue
                count += 1
                if ts_min is None or ts < ts_min:
                    ts_min = ts
                if ts_max is None or ts > ts_max:
                    ts_max = ts
    except Exception:
        pass
    return ts_min, ts_max, count


def _count_files(folder_path, ext=None):
    """统计文件夹中的文件数量（可选按后缀过滤）"""
    if not os.path.isdir(folder_path):
        return 0
    count = 0
    for f in os.listdir(folder_path):
        if ext and not f.lower().endswith(ext):
            continue
        if os.path.isfile(os.path.join(folder_path, f)):
            count += 1
    return count


def _get_image_timestamp_range(folder_path):
    """从图片文件名（{timestamp_us}.jpg）中提取时间戳范围"""
    ts_min = None
    ts_max = None
    count = 0
    if not os.path.isdir(folder_path):
        return ts_min, ts_max, count
    for filename in os.listdir(folder_path):
        if not filename.lower().endswith('.jpg'):
            continue
        try:
            ts = int(os.path.splitext(filename)[0])
            count += 1
            if ts_min is None or ts < ts_min:
                ts_min = ts
            if ts_max is None or ts > ts_max:
                ts_max = ts
        except ValueError:
            continue
    return ts_min, ts_max, count


def collect_data_info(data_folder_path):
    """
    数采模式：读取单个数据文件夹的所有时间戳和元信息。

    返回 dict:
    {
        "folder_path": str,
        "folder_name": str,
        "date": str | None,            # YYYY-MM-DD
        "session_time": str | None,     # HH-MM-SS (文件夹名)
        "weld_signal": {
            "arc_start_us": int | None,
            "arc_end_us": int | None,
            "arc_start_time": str | None,
            "arc_end_time": str | None,
            "duration_seconds": float | None
        },
        "cameras": [
            {
                "name": str,
                "image_count": int,
                "ts_min_us": int | None,
                "ts_max_us": int | None,
                "ts_min_time": str | None,
                "ts_max_time": str | None
            }
        ],
        "robot_state": {
            "joint_state_rows": int,
            "tool_pose_rows": int,
            "has_calibration": bool
        },
        "control_cmd": {
            "speed_rows": int,
            "freq_rows": int
        },
        "point_cloud_count": int,
        "depth_image_count": int,
        "annotation": {
            "has_xml": bool,
            "data_type": str | None,
            "quality_type": str | None,
            "spec_min": int | None,
            "spec_max": int | None
        },
        "total_file_count": int,
        "total_size_bytes": int
    }
    """
    folder_name = os.path.basename(data_folder_path)
    date_str = _parse_date_from_path(data_folder_path)

    info = {
        "folder_path": os.path.abspath(data_folder_path),
        "folder_name": folder_name,
        "date": date_str,
        "session_time": folder_name,  # 通常是 HH-MM-SS
        "weld_signal": {
            "arc_start_us": None,
            "arc_end_us": None,
            "arc_start_time": None,
            "arc_end_time": None,
            "duration_seconds": None
        },
        "cameras": [],
        "robot_state": {
            "joint_state_rows": 0,
            "tool_pose_rows": 0,
            "has_calibration": False
        },
        "control_cmd": {
            "speed_rows": 0,
            "freq_rows": 0
        },
        "point_cloud_count": 0,
        "depth_image_count": 0,
        "annotation": {
            "has_xml": False,
            "data_type": None,
            "quality_type": None,
            "spec_min": None,
            "spec_max": None
        },
        "total_file_count": 0,
        "total_size_bytes": 0
    }

    # --- 焊接信号 ---
    weld_signal_path = os.path.join(
        data_folder_path, "welding_state", "weld_signal.csv")
    if os.path.exists(weld_signal_path):
        start_ts, end_ts = read_weld_signal(weld_signal_path)
        info["weld_signal"]["arc_start_us"] = start_ts
        info["weld_signal"]["arc_end_us"] = end_ts
        info["weld_signal"]["arc_start_time"] = _us_to_timestr(
            date_str, start_ts)
        info["weld_signal"]["arc_end_time"] = _us_to_timestr(date_str, end_ts)
        if start_ts is not None and end_ts is not None:
            info["weld_signal"]["duration_seconds"] = round(
                (end_ts - start_ts) / 1_000_000, 3)

    # --- 相机目录 ---
    for entry in sorted(os.listdir(data_folder_path)):
        entry_path = os.path.join(data_folder_path, entry)
        if not os.path.isdir(entry_path):
            continue
        # 匹配所有 camera 开头的目录
        if entry.startswith("camera"):
            ts_min, ts_max, img_count = _get_image_timestamp_range(entry_path)
            cam_info = {
                "name": entry,
                "image_count": img_count,
                "ts_min_us": ts_min,
                "ts_max_us": ts_max,
                "ts_min_time": _us_to_timestr(date_str, ts_min),
                "ts_max_time": _us_to_timestr(date_str, ts_max)
            }
            info["cameras"].append(cam_info)

    # --- 机器人状态 ---
    joint_csv = os.path.join(
        data_folder_path, "robot_state", "joint_state.csv")
    if os.path.exists(joint_csv):
        _, _, rows = _read_csv_timestamps(joint_csv)
        info["robot_state"]["joint_state_rows"] = rows

    tool_csv = os.path.join(data_folder_path, "robot_state", "tool_pose.csv")
    if os.path.exists(tool_csv):
        _, _, rows = _read_csv_timestamps(tool_csv)
        info["robot_state"]["tool_pose_rows"] = rows

    calib_csv = os.path.join(
        data_folder_path, "robot_state", "calibration.csv")
    info["robot_state"]["has_calibration"] = os.path.exists(calib_csv)

    # --- 控制指令 ---
    speed_csv = os.path.join(
        data_folder_path, "control_cmd", "control_speed.csv")
    if os.path.exists(speed_csv):
        _, _, rows = _read_csv_timestamps(speed_csv)
        info["control_cmd"]["speed_rows"] = rows

    freq_csv = os.path.join(
        data_folder_path, "control_cmd", "control_freq.csv")
    if os.path.exists(freq_csv):
        _, _, rows = _read_csv_timestamps(freq_csv)
        info["control_cmd"]["freq_rows"] = rows

    # --- 点云 ---
    pc_dir = os.path.join(data_folder_path, "scan_point_cloud")
    info["point_cloud_count"] = _count_files(
        pc_dir, ".bin") + _count_files(pc_dir, ".ply")

    # --- 深度图 ---
    depth_dir = os.path.join(data_folder_path, "camera_depth")
    info["depth_image_count"] = _count_files(
        depth_dir, ".jpg") + _count_files(depth_dir, ".ply")

    # --- 标注 XML ---
    xml_path = os.path.join(
        data_folder_path, "annotation", "segment_timestamps.xml")
    if os.path.exists(xml_path):
        info["annotation"]["has_xml"] = True
        try:
            import xml.etree.ElementTree as ET
            root = ET.parse(xml_path).getroot()
            dt_elem = root.find('.//data_type')
            if dt_elem is not None:
                info["annotation"]["data_type"] = dt_elem.text
            qt_elem = root.find('.//quality_type')
            if qt_elem is not None:
                info["annotation"]["quality_type"] = qt_elem.text
            smin_elem = root.find('.//data_spec_min')
            if smin_elem is not None:
                info["annotation"]["spec_min"] = int(smin_elem.text)
            smax_elem = root.find('.//data_spec_max')
            if smax_elem is not None:
                info["annotation"]["spec_max"] = int(smax_elem.text)
        except Exception:
            pass

    # --- 统计总文件数和总大小 ---
    total_files = 0
    total_size = 0
    for dirpath, _dirnames, filenames in os.walk(data_folder_path):
        for fname in filenames:
            total_files += 1
            try:
                total_size += os.path.getsize(os.path.join(dirpath, fname))
            except OSError:
                pass
    info["total_file_count"] = total_files
    info["total_size_bytes"] = total_size

    return info


def collect_all_data_info(root_dir, output_json=None):
    """
    数采模式：扫描根目录下的所有数据文件夹，汇总元信息。

    参数:
        root_dir:     根目录（如 /mnt/data/2026-03-09）
        output_json:  如果指定，将结果写入该 JSON 文件

    返回:
        list[dict]  每个数据文件夹的 info 字典列表
    """
    results = []

    if not os.path.isdir(root_dir):
        print(f"错误: {root_dir} 不是有效目录")
        return results

    for entry in sorted(os.listdir(root_dir)):
        entry_path = os.path.join(root_dir, entry)
        if not os.path.isdir(entry_path):
            continue

        print(f"[数采模式] 读取: {entry}")
        info = collect_data_info(entry_path)
        results.append(info)

        # 打印摘要
        ws = info["weld_signal"]
        cam_summary = ", ".join(
            f'{c["name"]}({c["image_count"]}张)' for c in info["cameras"]
        )
        print(f"  焊接: 起弧={ws['arc_start_time'] or 'N/A'}, "
              f"收弧={ws['arc_end_time'] or 'N/A'}, "
              f"时长={ws['duration_seconds'] or 'N/A'}s")
        print(f"  相机: {cam_summary or '无'}")
        print(f"  机器人: 关节={info['robot_state']['joint_state_rows']}行, "
              f"末端={info['robot_state']['tool_pose_rows']}行")
        print(f"  文件总计: {info['total_file_count']}个, "
              f"{info['total_size_bytes'] / 1024 / 1024:.1f} MB")
        ann = info["annotation"]
        if ann["has_xml"]:
            print(f"  标注: type={ann['data_type']}, quality={ann['quality_type']}, "
                  f"spec={ann['spec_min']}-{ann['spec_max']}mm")
        print()

    if output_json:
        with open(output_json, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"[数采模式] 结果已写入: {output_json}")

    return results


# process_data_folders('D:\\test')


# if __name__ == "__main__":
#     # # 配置输入的文件夹路径
#     # root_directory_list = [
#     #     # "./2025-10-17" # 可以写好几个路径
#     #     "./2025-11-21",
#     #     "./2025-11-22"
#     #     ]

#     base_root = "."  # 要扫描的根目录，这里用当前目录；如需修改可改成绝对路径
#     root_directory_list = []

#     # 自动搜集所有前缀为 "2025-" 的子目录
#     for name in os.listdir(base_root):
#         path = os.path.join(base_root, name)
#         if os.path.isdir(path) and name.startswith("2026-"):
#             root_directory_list.append(path)


#     for root_directory in root_directory_list:
#         # 检查路径是否存在
#         if not os.path.exists(root_directory):
#             print(f"错误: 路径 {root_directory} 不存在")
#         else:
#             print(f"开始处理根目录: {root_directory}\n")
#             process_data_folders(root_directory)
#             print("所有数据文件夹处理完毕")
