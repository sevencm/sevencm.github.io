#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 xingcezhenti-main 的 markdown 题库解析为静态刷题站的数据。

输出:
  site/data/meta.json                 分类总览
  site/data/<cat>/index.json          该分类下试卷列表
  site/data/<cat>/<NNNN>.json         每套卷一题组(材料+题目)
  site/img/题目图/...  site/img/公式图/...   引用到的图片(仅被引用的)
"""
import json, os, re, shutil, sys, time

SRC = "../xingcezhenti"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site")

CATS = [
    ("01", "政治理论"), ("02", "常识判断"), ("03", "言语理解与表达"),
    ("04", "数量关系"), ("05", "判断推理"), ("06", "资料分析"),
]

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

def parse_fm(lines):
    fm = {}
    inside = False
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
    with open(path, encoding="utf-8") as f:
        raw = f.read()
    lines = raw.split("\n")
    fm = parse_fm(lines[:20])
    title = ""
    for ln in lines:
        m = RE_TITLE.match(ln)
        if m:
            title = m.group(1).strip()
            break

    materials = {}          # idx -> html text
    cur_mat = None
    questions = []          # dicts
    q = None                # current question under construction
    section = None          # 'stem' | 'options' | 'expl'

    def close_q():
        nonlocal q, section
        if q is not None:
            questions.append(q)
        q = None
        section = None

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
        if q is None:
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
        # body accumulation
        if q is None and cur_mat is not None:
            cur_mat["h"] += ln.rstrip()
        elif section == "stem":
            q["s"] += ("\n" if q["s"] else "") + ln.rstrip()
        elif section == "options" and q["o"]:
            last = sorted(q["o"].keys())[-1]
            q["o"][last] += " " + ln.strip()
        elif section == "expl":
            q["e"] += ("\n" if q["e"] else "") + ln.rstrip()
    close_q()

    # material html: join collected lines
    for mat in materials.values():
        pass
    return title, fm, materials, questions

def main():
    t0 = time.time()
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    img_out = os.path.join(OUT, "img")
    os.makedirs(os.path.join(img_out, "题目图"), exist_ok=True)
    os.makedirs(os.path.join(img_out, "公式图"), exist_ok=True)
    copied = set()
    n_copy = n_miss = 0

    meta = {"cats": []}
    for catid, catname in CATS:
        catdir = os.path.join(SRC, f"{catid}-{catname}")
        files = sorted(f for f in os.listdir(catdir) if f.endswith(".md") and f != "README.md")
        d_out = os.path.join(OUT, "data", catid)
        os.makedirs(d_out, exist_ok=True)
        index = []
        total_q = 0
        noans = 0
        for fi, fname in enumerate(files):
            fpath = os.path.join(catdir, fname)
            title, fm, materials, questions = parse_file(fpath)
            if not questions:
                continue
            # 图片:扫描原文引用并复制,随后改写站内路径
            def rewrite(text):
                return RE_IMG.sub(lambda m: f"img/{m.group(1)}/{m.group(2)}", text)

            blob = json.dumps({
                "id": f"{catid}/{fi:04d}",
                "t": title or fm.get("试卷", fname[:-3]),
                "y": fm.get("年份", ""),
                "r": fm.get("地区", ""),
                "c": catname,
                "ms": [{"i": k, "h": rewrite(v["h"])} for k, v in sorted(materials.items())],
                "qs": [{
                    "i": qq["i"], "qid": qq["qid"], "tp": qq["tp"],
                    "m": qq["m"], "s": rewrite(qq["s"]),
                    "o": {k: rewrite(v) for k, v in qq["o"].items()},
                    "a": qq["a"], "e": rewrite(qq["e"]),
                } for qq in questions],
            }, ensure_ascii=False, separators=(",", ":"))
            # scan images over the original file (before rewrite) for copying
            with open(fpath, encoding="utf-8") as f:
                for m in RE_IMG.finditer(f.read()):
                    kind, fn = m.group(1), m.group(2)
                    if (kind, fn) in copied:
                        continue
                    srcp = os.path.join(SRC, "90-图片", kind, fn)
                    if os.path.isfile(srcp):
                        shutil.copy2(srcp, os.path.join(img_out, kind, fn))
                        copied.add((kind, fn))
                        n_copy += 1
                    else:
                        n_miss += 1
            with open(os.path.join(d_out, f"{fi:04d}.json"), "w", encoding="utf-8") as f:
                f.write(blob)
            nq = len(questions)
            noans += sum(1 for qq in questions if qq["a"] is None)
            total_q += nq
            index.append({"id": f"{catid}/{fi:04d}", "t": title or fm.get("试卷", fname[:-3]),
                          "y": fm.get("年份", ""), "r": fm.get("地区", ""), "n": nq})
        with open(os.path.join(d_out, "index.json"), "w", encoding="utf-8") as f:
            json.dump(index, ensure_ascii=False, separators=(",", ":"), fp=f)
        meta["cats"].append({"id": catid, "name": catname, "exams": len(index), "qs": total_q})
        print(f"[{catid}] {catname}: {len(index)} 卷 / {total_q} 题", flush=True)

    with open(os.path.join(OUT, "data", "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, ensure_ascii=False, fp=f)
    print(f"图片复制 {n_copy} 张, 缺失引用 {n_miss} 张")
    print(f"耗时 {time.time()-t0:.1f}s")

if __name__ == "__main__":
    main()
