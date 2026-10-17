#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""判断题修复:源库里选项为占位符「- （选项）[]」的判断题(A=正确/B=错误),
补上「正确/错误」选项、清理题干残留占位符,并将题型标记为「判断题」。"""
import glob, json, os, re

OUT = "./data"
fixed = 0
files_changed = 0

for path in sorted(glob.glob(os.path.join(OUT, "*", "????.json"))):
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    changed = False
    for q in d["qs"]:
        if q["o"]:
            continue
        stem = re.sub(r"\n*-\s*（选项）\[\]\s*$", "", q["s"]).rstrip()
        if stem != q["s"]:
            q["s"] = stem
            changed = True
        if q["a"] in ("A", "B"):
            q["o"] = {"A": "正确", "B": "错误"}
            q["tp"] = "判断题"
            changed = True
            fixed += 1
    if changed:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(d, ensure_ascii=False, separators=(",", ":"), fp=f)
        files_changed += 1

print(f"补全判断题 {fixed} 道,涉及 {files_changed} 个文件")
