#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""判断题修复：源库里选项为占位符「- （选项）[]」的判断题（A=正确 / B=错误），
补上「正确 / 错误」选项、清理题干残留占位符，并把题型标记为「判断题」。

用法:
  python3 tools/fix_judge.py            # 处理本仓库 data/
  python3 tools/fix_judge.py --out DIR  # 处理指定产出目录下的 data/
"""
import argparse
import glob
import json
import os
import re

from config import data_dir

RE_PLACEHOLDER = re.compile(r"\n*[-–]?\s*（选项）\[\]\s*$")


def main():
    ap = argparse.ArgumentParser(description="补全判断题选项")
    ap.add_argument("--out", help="产出目录（含 data/）；默认取 XINGCE_OUT 或本仓库根目录")
    args = ap.parse_args()

    data_root = data_dir(args.out)
    fixed = files_changed = 0

    for path in sorted(glob.glob(os.path.join(data_root, "*", "????.json"))):
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        changed = False
        for q in d.get("qs", []):
            # 题干末尾的「（选项）[]」占位符无论是否已补过选项都要清掉
            # （只在确实含占位符时处理，避免无谓改写全部数据文件）
            s = q.get("s", "")
            if "（选项）[]" in s:
                stem = RE_PLACEHOLDER.sub("", s).rstrip()
                if stem != s:
                    q["s"] = stem
                    changed = True
            if q.get("o"):
                continue
            if q.get("a") in ("A", "B"):
                q["o"] = {"A": "正确", "B": "错误"}
                q["tp"] = "判断题"
                changed = True
                fixed += 1
        if changed:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
            files_changed += 1

    print(f"补全判断题 {fixed} 道，涉及 {files_changed} 个文件")


if __name__ == "__main__":
    main()
