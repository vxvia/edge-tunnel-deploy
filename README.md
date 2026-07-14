# EdgeTunnel 一键部署

本工具帮助你在 Cloudflare 上一键部署 EdgeTunnel Worker，包含自动修改源码（强制启用 ECH）、创建 KV 命名空间、写入密钥等操作。

## 快速部署

1. **克隆或下载本仓库**
2. 在 [Cloudflare Pages](https://dash.cloudflare.com/) 中创建新项目，连接你的 GitHub 仓库
3. 构建设置：
   - 框架预设：`None`
   - 构建命令：留空
   - 输出目录：留空
4. （可选）在 Pages 项目“设置 → 环境变量”中添加变量：
   - 变量名：`AAA`，值为你的教程链接（如需在页面顶部显示“订阅获取教程”按钮）
5. 保存并部署，访问分配的 `.pages.dev` 域名即可使用

## 本地开发

如果你有 Node.js 环境，可使用 Wrangler 本地运行：

```bash
npx wrangler pages dev .
