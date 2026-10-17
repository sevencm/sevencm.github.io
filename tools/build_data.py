#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 xingcezhenti 的 markdown 题库解析为静态刷题站的数据。

用法:
  cp .env.example .env            # 填 XINGCE_SRC（题库源目录）
  python3 tools/build_data.py     # 或 --src /path/to/xingcezhenti --out .
  python3 tools/build_data.py --clean   # 重建前清空 data/ 与 img/

输出（默认写到本仓库根目录）:
  data/meta.json                分类总览
  data/<cat>/index.json         该分类下试卷列表
  data/<cat>/<NNNN>.json        每套卷一题组（材料 + 题目 + 答案 + 解析）
  img/题目图/... img/公式图/...  被正文引用到的图片
"""
import argparse
import json
import os
import re
import shutil
import time

from config import CATS, data_dir, img_dir, out_root, src_root

RE_FRONT = re.compile(r"^---\s*$")
RE_FM = re.compile(r'^(\S+):\s*"(.*)"\s*$')
RE_TITLE = re.compile(r"^#\s+(.+)$")
RE_MAT = re.compile(r"^##\s+材料\s*(\d+)\s*$")
RE_Q = re.compile(r"^#{2,4}\s*第\s*(\d+)\s*题\s*<sub>qid\s*([0-9]+)\s*·\s*(.+?)</sub>\s*$")
RE_OPT = re.compile(r"^-\s*\*\*([A-H])\*\*\.\s*(.*)$")
RE_ANS = re.compile(r"^\*\*答案\*\*[：:]\s*(.*)$")
RE_EXPL = re.compile(r"^\*\*官方解析\*\*\s*$")
RE_IMG = re.compile(r'\.\./90-图片/(题目图|公式图)/([^)"\s]+)')
RE_HR = re.compile(r"^---+\s*$")

REWRITE_IMG = lambda text: RE_IMG.sub(lambda m: f"img/{m.group(1)}/{m.group(2)}", text)


def parse_fm(lines):
    """解析文件头部的 YAML front matter（年份 / 地区 / 试卷名）。"""
    fm, inside = {}, False
    for ln in lines:
        if RE_FRONT.match(ln):
            if inside:
                break
            inside = True
            continue
        if inside:
            m = RE_FM.match(ln)
            if m:
                fm[m.group(1)] = m.group(2)
    return fm


def parse_file(path):
    """解析一篇 md，返回 (标题, front matter, 材料 dict, 题目 list)。"""
    with open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")

    fm = parse_fm(lines[:20])
    title = ""
    for ln in lines:
        m = RE_TITLE.match(ln)
        if m:
            title = m.group(1).strip()
            break

    materials = {}   # 材料序号 -> {"i": n, "h": 正文}
    cur_mat = None
    questions = []
    q = None
    section = None   # stem | options | expl

    def close_q():
        nonlocal q, section
        if q is not None:
            questions.append(q)
        q, section = None, None

    for ln in lines:
        if RE_FRONT.match(ln) and len(ln) <= 4:
            continue
        if RE_HR.match(ln):
            if q is not None and section == "expl":
                close_q()
            continue

        m = RE_MAT.match(ln)
        if m:
            close_q()
            cur_mat = {"i": int(m.group(1)), "h": ""}
            materials[cur_mat["i"]] = cur_mat
            section = None
            continue

        m = RE_Q.match(ln)
        if m:
            close_q()
            q = {"i": int(m.group(1)), "qid": m.group(2), "tp": m.group(3).strip(),
                 "m": cur_mat["i"] if cur_mat else None,
                 "s": "", "o": {}, "a": None, "e": ""}
            section = "stem"
            continue

        # 材料小节正文（此时还没进入任何题目）
        if q is None:
            if cur_mat is not None:
                cur_mat["h"] += ln.rstrip()
            continue

        m = RE_OPT.match(ln)
        if m and section in ("stem", "options"):
            section = "options"
            q["o"][m.group(1)] = m.group(2).strip()
            continue

        m = RE_ANS.match(ln)
        if m:
            section = "answer"
            ans = m.group(1).strip()
            q["a"] = None if ("缺" in ans or not ans) else ans.upper().replace("、", "").replace(" ", "")
            continue

        if RE_EXPL.match(ln):
            section = "expl"
            continue

        if section == "stem":
            q["s"] += ("\n" if q["s"] else "") + ln.rstrip()
        elif section == "options" and q["o"] and ln.strip():
            last = sorted(q["o"].keys())[-1]
            q["o"][last] += " " + ln.strip()
        elif section == "expl":
            q["e"] += ("\n" if q["e"] else "") + ln.rstrip()

    close_q()

    # 材料正文去掉空行、改写图片路径
    for mat in materials.values():
        mat["h"] = REWRITE_IMG(mat["h"].strip())
    return title, fm, materials, questions


def copy_images(md_path, src_img_root, img_out, copied):
    """复制该 md 引用到的图片（按 (类别, 文件名) 去重），返回 (复制数, 缺失数)。"""
    n_copy = n_miss = 0
    with open(md_path, encoding="utf-8") as f:
        for m in RE_IMG.finditer(f.read()):
            kind, fn = m.group(1), m.group(2)
            if (kind, fn) in copied:
                continue
            srcp = os.path.join(src_img_root, kind, fn)
            if os.path.isfile(srcp):
                shutil.copy2(srcp, os.path.join(img_out, kind, fn))
                copied.add((kind, fn))
                n_copy += 1
            else:
                n_miss += 1
    return n_copy, n_miss


def main():
    ap = argparse.ArgumentParser(description="行测题库 md → 静态站 JSON")
    ap.add_argument("--src", help="题库源目录（含 01-政治理论 … 90-图片）；默认取 XINGCE_SRC 或 .env")
    ap.add_argument("--out", help="产出目录；默认取 XINGCE_OUT 或本仓库根目录")
    ap.add_argument("--clean", action="store_true", help="重建前清空 data/ 与 img/（不触碰 index.html 等页面文件）")
    args = ap.parse_args()

    t0 = time.time()
    SRC = src_root(args.src)
    OUT = out_root(args.out)
    DATA = data_dir(args.out)
    IMGD = img_dir(args.out)

    if args.clean:
        for d in (DATA, IMGD):
            if os.path.isdir(d):
                shutil.rmtree(d)
                print(f"已清空 {os.path.relpath(d, OUT)}")

    os.makedirs(DATA, exist_ok=True)
    for kind in ("题目图", "公式图"):
        os.makedirs(os.path.join(IMGD, kind), exist_ok=True)

    src_img_root = os.path.join(SRC, "90-图片")
    copied = set()
    n_copy = n_miss = 0
    meta = {"cats": []}

    for catid, catname in CATS:
        catdir = os.path.join(SRC, f"{catid}-{catname}")
        if not os.path.isdir(catdir):
            print(f"[{catid}] 跳过：源目录不存在 {catdir}")
            continue
        files = sorted(f for f in os.listdir(catdir) if f.endswith(".md") and f != "README.md")
        d_out = os.path.join(DATA, catid)
        os.makedirs(d_out, exist_ok=True)

        index, total_q = [], 0
        for fi, fname in enumerate(files):
            fpath = os.path.join(catdir, fname)
            title, fm, materials, questions = parse_file(fpath)
            if not questions:
                continue

            blob = json.dumps({
                "id": f"{catid}/{fi:04d}",
                "t": title or fm.get("试卷", fname[:-3]),
                "y": fm.get("年份", ""),
                "r": fm.get("地区", ""),
                "c": catname,
                "ms": [{"i": k, "h": v["h"]} for k, v in sorted(materials.items()) if v["h"].strip()],
                "qs": [{
                    "i": qq["i"], "qid": qq["qid"], "tp": qq["tp"],
                    "m": qq["m"], "s": REWRITE_IMG(qq["s"]),
                    "o": {k: REWRITE_IMG(v) for k, v in qq["o"].items()},
                    "a": qq["a"], "e": REWRITE_IMG(qq["e"]),
                } for qq in questions],
            }, ensure_ascii=False, separators=(",", ":"))

            c1, c2 = copy_images(fpath, src_img_root, IMGD, copied)
            n_copy += c1
            n_miss += c2

            with open(os.path.join(d_out, f"{fi:04d}.json"), "w", encoding="utf-8") as f:
                f.write(blob)

            nq = len(questions)
            total_q += nq
            index.append({"id": f"{catid}/{fi:04d}", "t": title or fm.get("试卷", fname[:-3]),
                          "y": fm.get("年份", ""), "r": fm.get("地区", ""), "n": nq})

        with open(os.path.join(d_out, "index.json"), "w", encoding="utf-8") as f:
            json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
        meta["cats"].append({"id": catid, "name": catname, "exams": len(index), "qs": total_q})
        print(f"[{catid}] {catname}: {len(index)} 卷 / {total_q} 题", flush=True)

    with open(os.path.join(DATA, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False)
    print(f"图片复制 {n_copy} 张，缺失引用 {n_miss} 张")
    print(f"耗时 {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
