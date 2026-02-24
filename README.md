# 云宝新星防御 (Yunbao Nova Defense)

这是一个基于 React + Vite + Tailwind CSS 开发的经典导弹指令风格塔防游戏。

## 部署到 Vercel 指南

### 1. 准备 GitHub 仓库
1. 在 GitHub 上创建一个新的公开或私有仓库。
2. 将此项目的所有代码推送到该仓库：
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin <你的仓库URL>
   git push -u origin main
   ```

### 2. 在 Vercel 上部署
1. 登录 [Vercel](https://vercel.com/)。
2. 点击 **"Add New"** -> **"Project"**。
3. 导入你刚刚创建的 GitHub 仓库。
4. 在 **"Environment Variables"** 部分，添加以下变量：
   - `GEMINI_API_KEY`: 你的 Google AI API Key (从 [Google AI Studio](https://aistudio.google.com/app/apikey) 获取)。
5. 点击 **"Deploy"**。

### 3. 注意事项
- **API Key 安全**: 当前配置会在构建时将 API Key 嵌入到前端代码中。如果这是生产环境，建议通过后端代理调用 API。
- **SPA 路由**: 项目已包含 `vercel.json` 以支持单页应用路由。

## 游戏玩法
- 点击屏幕发射拦截导弹（菜刀样式）。
- 拦截导弹具有自动追踪功能，会飞向最近的敌方火箭。
- 摧毁敌方火箭获得积分，达到 1000 分即可获胜。
- 保护你的城市和炮台不被摧毁。
