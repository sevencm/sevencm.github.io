#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""清理选项文本里残留的 ✅ / ❌ 答案标记（题库导出时带来的）。

用法:
  python3 tools/strip_marks.py            # 处理本仓库 data/
  python3 tools/strip_marks.py --out DIR  # 处理指定产出目录下的 data/
"""
import argparse
import glob
import json
import os

from config import data_dir

MARKS = ("✅", "❌")


def main():
    ap = argparse.ArgumentParser(description="清除选项中的答案标记")
    ap.add_argument("--out", help="产出目录（含 data/）；默认取 XINGCE_OUT 或本仓库根目录")
    args = ap.parse_args()

    data_root = data_dir(args.out)
    n = 0
    for path in sorted(glob.glob(os.path.join(data_root, "*", "????.json"))):
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        changed = False
        for q in d.get("qs", []):
            for k, v in list(q.get("o", {}).items()):
                if any(mk in v for mk in MARKS):
                    for mk in MARKS:
                        v = v.replace(mk, "")
                    q["o"][k] = v.rstrip()
                    changed = True
        if changed:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
            n += 1
    print(f"已清理 {n} 个文件中的答案标记")


if __name__ == "__main__":
    main()
