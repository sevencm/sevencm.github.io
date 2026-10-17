# 行测刷题 · 2016–2026 真题

**在线练习：<https://sevencm.github.io/>**

纯静态行测刷题网站（GitHub Pages 托管），题库为 2016–2026 年国考 / 省考 / 联考 / 选调行测真题，共 **6 大模块 · 515 套卷 · 58,890 题**，含官方解析与 39,000+ 张题目/公式图片。

> 题库来源：[ERRRC/xingcezhenti](https://github.com/ERRRC/xingcezhenti)（行测真题整理仓库），本站只做解析与练习界面。

## 功能

- 📚 **六大分类**：政治理论 / 常识判断 / 言语理解与表达 / 数量关系 / 判断推理 / 资料分析
- 📖 **按套卷练习**：分类下按试卷选择，支持搜索试卷名 / 地区、按年份筛选
- 🎲 **随机练习**：每个分类可随机抽 20 题连刷
- ⏱️ **模拟考试**：从全部题库或单一模块随机组卷（50/100/120/135 题），倒计时、自动交卷、100 分制判分、回顾整卷、一键加入错题集
- ❌ **错题集**：答错自动收录，错题重练答对自动移出
- ⭐ **收藏题集**：题目页一键收藏
- ☰ **答题卡**：快速跳题，实时标示已答 / 答对 / 答错
- 💾 **进度持久化**：练习进度、错题、收藏保存在浏览器 localStorage，关掉页面下次继续

## 在线访问

[https://sevencm.github.io/](https://sevencm.github.io/)

也可以直接点这里 → <https://sevencm.github.io/>

托管方式：GitHub 用户主页仓库 [`sevencm/sevencm.github.io`](https://github.com/sevencm/sevencm.github.io)，部署在 `main` 分支根目录，推送到 main 后 1–2 分钟自动构建。

本地预览：

```bash
python3 -m http.server 8000
# 打开 http://127.0.0.1:8000
```

后续更新发布：

```bash
git add -A && git commit -m "更新说明"
git push origin main
```

如需部署到别的仓库：

1. 把本目录推到目标仓库（`git remote add origin ...` → `git push -u origin main`）
2. 仓库 **Settings → Pages → Build and deployment**：Source 选 **Deploy from a branch**，Branch 选 **main**、目录 **/ (root)**
3. 访问 `https://<用户名>.github.io/<仓库名>/`

> 手机浏览器同样可用，进度存在各设备的浏览器里。

## 数据管道

题库源数据来自 [ERRRC/xingcezhenti](https://github.com/ERRRC/xingcezhenti)，为 Obsidian markdown（每套卷每模块一篇），由 `tools/` 下脚本转换为按需加载的 JSON：

| 脚本 | 作用 |
|---|---|
| `tools/config.py` | 公共配置：路径统一从命令行参数 / 环境变量 / `.env` 读取，脚本内不写死任何本机路径 |
| `tools/build_data.py` | 全量解析 md → `data/<模块>/index.json` + 每套卷一个 JSON，并抽取引用图片到 `img/` |
| `tools/fix_ms.py` | （可选）只重建已有数据的「材料」字段，不重跑全量解析 |
| `tools/fix_judge.py` | 补全源库中选项为占位符的判断题（A 正确 / B 错误） |
| `tools/strip_marks.py` | 清除选项中残留的 ✅ 答案标记 |

路径配置：复制 `.env.example` 为 `.env`（已被 `.gitignore` 忽略），填入题库源目录即可；也可用环境变量或命令行参数，优先级为 **命令行 > 环境变量 > `.env` > 默认值**。

```bash
cp .env.example .env      # 编辑 XINGCE_SRC=「xingcezhenti 仓库的本地路径」
python3 tools/build_data.py --clean   # 全量重建（约 20 分钟，含图片复制）
python3 tools/fix_judge.py            # 补全判断题选项
python3 tools/strip_marks.py          # 清理答案标记
```

也可完全不用 `.env`，直接：

```bash
python3 tools/build_data.py --src /path/to/xingcezhenti --out .
```

## 目录结构

```
├── index.html / style.css / app.js   # 单页应用（原生 JS，无依赖）
├── .nojekyll                         # 跳过 Jekyll 处理
├── data/
│   ├── meta.json                     # 分类总览
│   └── <01..06>/
│       ├── index.json                # 该模块试卷列表
│       └── NNNN.json                 # 每套卷：材料 + 题目 + 答案 + 官方解析
├── img/题目图/ img/公式图/            # 题面图形与解析公式图
└── tools/                            # 数据管道脚本
```

## 数据说明

- 题库来源仓库：[ERRRC/xingcezhenti](https://github.com/ERRRC/xingcezhenti)，题目为公开整理的行测真题（2016–2026，qid 可回溯原始题库）
- 答案取自官方题库；极少量题目答案缺失（页面会标注"答案缺失"）
- 图片缺失 2 张（源库即为缺失），不影响使用
- 题目与解析版权归原命题机构 / 原整理者，本站仅用于个人学习练习
