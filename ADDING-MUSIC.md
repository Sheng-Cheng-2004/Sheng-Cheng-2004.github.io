# 唱片柜的使用与维护

打开 Misc，点击唱片柜，在原有半透明面板中管理音乐。房间的排版保持不变。

## 在网页上管理

1. 点击「Edit」，输入自己的六位 PIN。一次解锁后可连续编辑。
2. 解锁后面板滚到末尾，出现「＋ Add a record」。
3. 点击加号，可直接搜索歌名、歌手并选择 Apple Music 地区；也可以点击「Browse Apple Music」，在新标签页选好单曲、复制分享链接，返回唱片柜粘贴并查找。外部 Apple Music 页面不会自动把选择结果传回本站，因此使用单曲分享链接导入。
4. 搜索结果的「＋」把歌曲加入柜尾，自动保存封面、歌手、专辑、试听和 Apple Music 链接。已收藏的同一歌曲不能重复添加。没有试听的歌曲不会列入可添加结果。
5. 每张唱片最右侧的「↑」「↓」调整收藏和播放顺序，「×」删除。最近一次删除可点击「Undo」恢复。
6. 点击「Done」、关闭唱片柜、选择唱片返回房间或离开网页，会锁定编辑功能。再次编辑需要 PIN。单次会话最长 24 小时。

成功的修改保存在 Cloudflare，其他设备和访客重新进入页面时读取相同收藏。保存失败会明确提示，不会把失败的操作显示成成功。两个页面同时编辑发生冲突时，会载入最新列表，请重新操作。

## 播放

- 进入 Misc 后，按保存的顺序把第一张唱片放在架上，等待用户点击播放。
- 一首试听结束后自动播放下一首，末尾回到第一首。
- 点击柜内另一张唱片立即切换，之后从该唱片后面继续。
- 排序后队列立即采用新顺序。删除当前唱片时转到后继并保留播放或暂停状态；删空后清空唱片架并禁用播放。
- 播放的是 Apple Music 试听；完整歌曲通过 Apple Music 链接收听。如果系统阻止连续播放，可点击播放按钮继续。

## 部署信息

- 网站保留 GitHub Pages 托管。
- 服务地址：`https://sheng-record-cabinet.record-service.workers.dev`
- `record-config.js` 只保存公开服务地址；`record-service/` 包含 Worker 源码与配置。
- PIN 仅存在 Cloudflare 的 `CABINET_PIN` 密钥中，不在前端、仓库或浏览器存储中。编辑令牌只留在当前页面内存，服务端保存令牌摘要。
- 使用 SQLite-backed Durable Object 持久保存收藏、修订号、会话摘要和 PIN 尝试次数。同一来源 IP 连续错误五次后限制十五分钟。
- 搜索从浏览器直接连接 Apple 官方 JSONP 接口，避免云端查询受到地区限制；收藏写入仍须经服务端验证会话。
- `records.js` 是初始备用收藏。首次保存后以 Cloudflare 为准，包含已经保存的空列表；后续添加歌曲无需修改代码。

首次或依赖更新后，在项目根目录安装部署工具：

```powershell
npm --prefix record-service ci
```

项目内自带 Node 22 和 Wrangler，不修改系统 Node。在 `record-service` 目录执行以下命令重新部署：

```powershell
.\node_modules\node\bin\node.exe .\node_modules\wrangler\bin\wrangler.js login
.\node_modules\node\bin\node.exe .\node_modules\wrangler\bin\wrangler.js deploy
```

设置或更换 PIN 时运行以下命令，在隐藏输入提示中输入新的六位数字，不要把 PIN 写进文件：

```powershell
.\node_modules\node\bin\node.exe .\node_modules\wrangler\bin\wrangler.js secret put CABINET_PIN
```

更换网站域名时更新 `wrangler.toml` 的 `ALLOWED_ORIGINS` 并部署。更换 Worker 地址时同步修改 `record-config.js`，与网站一起发布。保留 Worker 名称、Durable Object 类和绑定名称可保留原有收藏。

当前同时允许正式网站、`http://127.0.0.1:5500` 与 `http://localhost:5500` 访问，支持 VS Code Live Server 预览。其他来源仍被拒绝。读取失败会显示英文短提示和「Retry」，重新打开唱片柜也会尝试恢复连接。

## 本地检查

```powershell
npm test
npm run preview
```

预览地址：`http://127.0.0.1:4173/misc.html`。预览使用独立、临时的唱片柜，测试 PIN 为 `123456`。关闭服务后测试数据清空，不会更改线上收藏。预览脚本仅对本机请求覆盖服务地址，生产配置保持不变。

参考：[Apple 曲目查询接口](https://performance-partners.apple.com/search-api)、[Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)、[Cloudflare 密钥配置](https://developers.cloudflare.com/workers/configuration/secrets/)。
