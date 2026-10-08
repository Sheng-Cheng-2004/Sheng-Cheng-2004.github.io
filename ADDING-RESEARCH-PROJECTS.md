# 如何更新 Research 页面上的项目

Research 页的项目数据统一放在 [`data/research-projects.js`](data/research-projects.js)。通常只需要编辑这个文件；不需要把项目内容写进 `research.html`。页面会按照数组中的先后顺序显示项目。

## 新增一个项目

1. 打开 `data/research-projects.js`，在 `window.RESEARCH_PROJECTS = [` 与最后的 `];` 之间，复制一个现有项目对象，粘贴到你希望它出现的位置。
2. 改写字段。每个项目用 `{ ... }` 包起来，项目之间用逗号隔开。文字要放在英文引号 `"..."` 里；文字内部如果有英文双引号，写成 `\"`。
3. 如果有 PDF，把文件放到 `assets/papers/`，然后将 `pdf` 写成相对于网站根目录的路径，例如 `"assets/papers/my-paper.pdf"`。
4. 保存后刷新 `research.html`，检查标题、作者、按钮和摘要展开效果。

可以直接参考这个模板：

```js
{
  id: "my-new-paper", // 简短且不重复的标识
  title: "My New Paper",
  authors: [
    "Coauthor One",
    { name: "Sheng Cheng", featured: true }, // featured: true 会加粗姓名
  ],
  meta: "Working Paper",
  date: "October 2026",
  abstract: "Write the abstract here. It will wrap naturally on the page.",
  description: "Optional short description.",
  pdf: "assets/papers/my-paper.pdf",
  links: [
    { label: "Code", url: "https://github.com/example/project" },
    { label: "Slides", url: "assets/papers/my-slides.pdf" },
  ],
},
```

把这个对象放在列表末尾时，记得前一个项目结尾也需要有逗号。想让新项目排在最上面，就把它放在列表开头。

## 字段怎么用

| 字段 | 用途 |
| --- | --- |
| `id` | 给项目一个易辨认的唯一名称；建议只用小写字母和连字符。 |
| `title` | 项目标题。 |
| `authors` | 作者列表。普通作者写成字符串；需要加粗的姓名写成 `{ name: "...", featured: true }`。 |
| `meta` | 作者和日期之间的类型文字，会显示为斜体，例如 `Undergraduate Thesis`。 |
| `date` | 年份或日期，例如 `2026`、`May, 2026`。 |
| `abstract` | 有内容时才显示 Abstract 按钮；留空 `""` 就不会显示。 |
| `pdf` | 有 PDF 路径时显示 View Paper 按钮；没有 PDF 可留空 `""`。 |
| `links` | 其他按钮；每项写 `label`（按钮文字）和 `url`（目标地址）。没有就用 `[]`。 |
| `description` | 可选的简短描述；没有可以省略或留空。 |

网站内文件链接使用 `assets/` 开头的路径；站外链接使用完整的 `https://` 地址。新增链接后，请点一下按钮确认目标能打开。如果 PDF 文件名有变化，也要同步修改 `pdf` 路径。

摘要较长时，可以像现有第一篇论文那样把句子写成字符串数组，最后用 `.join(" ")` 连接；这只让数据文件更容易编辑，网页上仍显示为正常段落。
