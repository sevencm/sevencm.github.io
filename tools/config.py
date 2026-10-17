#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""公共配置：所有路径都通过「命令行参数 > 环境变量 > .env > 默认值」解析，
代码里不出现任何绝对路径，也不依赖某台机器。

可配置项（见 .env.example）：
  XINGCE_SRC  题库源目录（ERRRC/xingcezhenti 的本地克隆，含 01-政治理论 … 90-图片）
  XINGCE_OUT  产出目录，默认本仓库根目录（脚本所在目录的上一级）
"""
import os
import sys

# 仓库根目录：tools/ 的上一级
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_dotenv(filename=".env"):
    """读取仓库根目录下的 .env（可选）。已存在的环境变量优先，不会被覆盖。"""
    path = os.path.join(ROOT, filename)
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val


def _resolve(value, default=None):
    if value:
        return os.path.abspath(os.path.expanduser(value))
    if default is not None:
        return default
    return None


def src_root(cli=None):
    """题库源目录：--src > XINGCE_SRC > .env > 报错提示"""
    load_dotenv()
    path = _resolve(cli or os.environ.get("XINGCE_SRC"))
    if not path:
        sys.exit(
            "缺少题库源目录。请任选一种方式指定：\n"
            "  1) cp .env.example .env 后填写 XINGCE_SRC=...\n"
            "  2) export XINGCE_SRC=/path/to/xingcezhenti\n"
            "  3) python3 tools/build_data.py --src /path/to/xingcezhenti"
        )
    if not os.path.isdir(path):
        sys.exit(f"题库源目录不存在：{path}")
    return path


def out_root(cli=None):
    """产出目录：--out > XINGCE_OUT > .env > 仓库根目录"""
    load_dotenv()
    return _resolve(cli or os.environ.get("XINGCE_OUT"), ROOT)


def data_dir(cli=None):
    return os.path.join(out_root(cli), "data")


def img_dir(cli=None):
    return os.path.join(out_root(cli), "img")


CATS = [
    ("01", "政治理论"),
    ("02", "常识判断"),
    ("03", "言语理解与表达"),
    ("04", "数量关系"),
    ("05", "判断推理"),
    ("06", "资料分析"),
]
