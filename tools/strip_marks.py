#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""清除选项文本里残留的 ✅ 答案标记(题库导出时带来的)。"""
import json, os, glob

OUT = "./site/data"
n = 0
for path in glob.glob(os.path.join(OUT, "*", "????.json")):
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    changed = False
    for q in d["qs"]:
        for k, v in list(q["o"].items()):
            if "✅" in v or "❌" in v:
                q["o"][k] = v.replace("✅", "").replace("❌", "").rstrip()
                changed = True
    if changed:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(d, ensure_ascii=False, separators=(",", ":"), fp=f)
        n += 1
print(f"已清理 {n} 个文件中的答案标记")
