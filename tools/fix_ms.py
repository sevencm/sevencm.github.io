#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""（可选补丁）重建已有 data/ 里每套卷的 ms（材料）字段，不重新解析全量数据。

适用场景：只修材料、不想重跑 build_data.py（全量解析含图片复制约 20 分钟）。
正常情况下 build_data.py 已经能正确产出材料，本脚本仅用于修补历史数据。

用法:
  python3 tools/fix_ms.py --src /path/to/xingcezhenti      # 或配置 .env 的 XINGCE_SRC
"""
import argparse
import json
import os
import re

from config import CATS, data_dir, src_root

RE_MAT = re.compile(r"^##\s+材料\s*(\d+)\s*$")
RE_Q = re.compile(r"^#{2,4}\s*第\s*(\d+)\s*题")
RE_HR = re.compile(r"^---+\s*$")
RE_IMG = re.compile(r"\.\./90-图片/(题目图|公式图)/([^)\"\s]+)")


def extract_materials(path):
    """从一篇 md 里取出各材料小节的正文（图片路径改写为站内相对路径）。"""
    mats, cur = {}, None
    with open(path, encoding="utf-8") as f:
        for ln in f:
            ln = ln.rstrip("\n")
            if RE_HR.match(ln):
                cur = None
                continue
            m = RE_MAT.match(ln)
            if m:
                cur = int(m.group(1))
                mats[cur] = ""
                continue
            if RE_Q.match(ln) or ln.startswith("# ") or ln.startswith("> "):
                cur = None
                continue
            if cur is not None:
                mats[cur] += ln
    return {k: RE_IMG.sub(lambda m: f"img/{m.group(1)}/{m.group(2)}", v) for k, v in mats.items()}


def main():
    ap = argparse.ArgumentParser(description="修补已有 data/ 中的材料字段")
    ap.add_argument("--src", help="题库源目录；默认取 XINGCE_SRC 或 .env")
    ap.add_argument("--out", help="产出目录（含 data/）；默认取 XINGCE_OUT 或本仓库根目录")
    args = ap.parse_args()

    SRC = src_root(args.src)
    OUT = data_dir(args.out)

    for catid, name in CATS:
        catdir = os.path.join(SRC, f"{catid}-{name}")
        if not os.path.isdir(catdir):
            print(f"[{catid}] 跳过：源目录不存在 {catdir}")
            continue
        files = sorted(f for f in os.listdir(catdir) if f.endswith(".md") and f != "README.md")
        fixed = 0
        for fi, fname in enumerate(files):
            jpath = os.path.join(OUT, catid, f"{fi:04d}.json")
            if not os.path.isfile(jpath):
                continue
            with open(jpath, encoding="utf-8") as f:
                data = json.load(f)
            ms = extract_materials(os.path.join(catdir, fname))
            data["ms"] = [{"i": k, "h": v} for k, v in sorted(ms.items()) if v.strip()]
            with open(jpath, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
            fixed += 1
        print(f"[{catid}] {name}: {fixed} 卷已更新材料", flush=True)
    print("done")


if __name__ == "__main__":
    main()
