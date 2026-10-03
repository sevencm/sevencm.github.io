# 溜溜数算 · 影像（本地演示版）

这是一个纯静态的中文学习视觉作品集 Demo，只保留两个系列：**汉语拼音**教学卡片与 **Math Teacher** 数学演示。无需 Node、构建工具或数据库，直接用浏览器打开即可。

上线地址：<https://sevencm.github.io/>（GitHub Pages，`master` 分支根目录）。页面、样式、脚本和素材都使用相对路径，部署在域名根目录即可直接访问。

## 本地预览

在本仓库根目录执行：

```bash
python3 -m http.server 8000
```

然后打开 <http://127.0.0.1:8000/>。按 `Ctrl+C` 停止服务。

也可以直接双击 `index.html`，但通过 HTTP 服务预览时，字体和复制提示词的行为更稳定。

## 页面

- `index.html`：首页、两系列筛选、精选作品、短笔记
- `works.html`：拼音与数学两组作品库与筛选
- `work-detail.html?id=pinyin-compounds-tones`：作品详情、提示词复制、参数和视频
- `prompts.html`：当前拼音/数学作品的提示词入口
- `notes.html`：拼音与数学视觉笔记
- `note.html?id=pinyin-tone-placement`：笔记详情页
- `about.html`：项目介绍与素材说明

## 作品数据

作品都在 `app.js` 的 `works` 数组中。每条作品包含：

- `series`：`pinyin` 或 `math-teacher`
- `image`：本地封面，放在 `assets/covers/` 中
- `videoUrl`：可选。填写后详情页会显示带 `controls` 的 `<video>`，并以 `image` 作为 poster
- `note`：已有笔记 id，详情页自动链接到相关笔记

## 当前真实素材

- 拼音卡片：来自 `/workspace/pinyin-daily`，涵盖单韵母、声母、翘舌音、复韵母、鼻韵母和 y/w 拼写规则
- 数学演示：来自 `sin-function-video`、`rmb-learning-video`、`clock-learning-video`
- 本地视频：`sin-function.mp4`、`rmb-learning.mp4`、`clock-learning-zhengdian.mp4`
- 对应封面：均放在 `assets/covers/`

此前不属于这两条学习系列的旧作品及其媒体文件已从 Demo 移除；站点数据、筛选和文案现在只面向拼音与数学。

## 视频

数学演示的 MP4 与封面一起放在仓库里，详情页使用相对路径，例如 `assets/videos/sin-function.mp4`。这样在 `https://sevencm.github.io/` 根目录打开时，视频可以和拼音卡片一样直接播放。

## 目录结构

```text
index.html / works.html / work-detail.html / prompts.html
notes.html / note.html / about.html
styles.css       全站样式与移动端适配
app.js           两个系列、作品数据、筛选和复制功能
assets/covers/*  拼音卡片与数学视频封面
assets/videos/* 本地演示视频
```

## 如何添加作品

1. 打开 `app.js`，在 `works` 数组中复制一条对象并修改 `id`、`title`、`series`、`image`、`tags`、`prompt` 等字段。
2. 把真实封面放进 `assets/covers/`。
3. 数学演示额外填写 `videoUrl`，使用相对路径，例如 `assets/videos/example.mp4`。
4. `note` 字段填写已有笔记 id：`pinyin-tone-placement`、`pinyin-spelling` 或 `math-motion`。
5. 刷新浏览器即可看到新作品；不需要重新构建。
