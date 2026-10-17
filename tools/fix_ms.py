#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""修复 site/data 下每套卷的 ms(材料) 字段:重新从 md 提取材料正文。"""
import json, os, re

SRC = "../xingcezhenti"
OUT = "./site/data"

CATS = [("01", "政治理论"), ("02", "常识判断"), ("03", "言语理解与表达"),
        ("04", "数量关系"), ("05", "判断推理"), ("06", "资料分析")]

RE_MAT = re.compile(r"^##\s+材料\s*(\d+)\s*$")
RE_Q = re.compile(r"^#{2,4}\s*第\s*(\d+)\s*题")
RE_HR = re.compile(r"^---+\s*$")
RE_IMG = re.compile(r"\.\./90-图片/(题目图|公式图)/([^)\"\\s]+)")

def extract_materials(path):
    mats = {}
    cur = None
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

for catid, name in CATS:
    catdir = os.path.join(SRC, f"{catid}-{name}")
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
            json.dump(data, ensure_ascii=False, separators=(",", ":"), fp=f)
        fixed += 1
    print(f"[{catid}] {name}: {fixed} 卷已更新材料", flush=True)
print("done")
