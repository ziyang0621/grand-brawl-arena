# Grand Brawl 项目进度

这是一款使用 Three.js 制作的网页版 3D 乱斗游戏原型，目标是做出类似《One Piece Grand Battle》风格的港口竞技场：角色可以移动、跳跃、攻击、格挡、抓取、投摔、使用道具，并支持朋友通过房间码联机。

## 当前状态

- 当前版本：`v10` / 页面资源版本：`arena.js?v=22`
- 主要玩法：3D 港口地图、绿色高台、楼梯、箱子、空投道具、战斗 AI、三命模式
- 联机方式：PeerJS 房间码联机，房主负责主要游戏状态同步
- 自动化测试：36 项通过
- 当前 Git 提交：`6710b65 feat: expand 3d grand brawl combat prototype`
- GitHub 远程仓库：`https://github.com/ziyang0621/grand-brawl-arena.git`

## 已实现功能

### 战斗

- `J`：轻攻击和三段连斩
- `U`：重攻击、破防；空中按 `U` 会变成坠落重击
- `I`：抓取，流程是抓住、抱起、短暂停顿、投摔
- `R`：按住防御，刚按下的短时间内可以完美反击
- `Space`：跳跃和二段跳
- `Shift`：闪避；中毒或冻伤时不能闪避
- `L`：消耗能量使用旋风斩
- 命中停顿、击退、倒地、起身、震屏、伤害数字和击中特效
- 空中攻击和不同高度的攻击判定
- 强攻击可以打破防御，抓取可以绕过防御

### 道具

箱子可以用 `J` 打开，打开后会掉落随机道具。角色靠近掉落物会自动拾取；道具通过 `K` 使用。

- 炸弹：立即爆炸，可以伤到投掷者自己
- 毒瓶：制造毒雾，持续掉血
- 病毒瓶：制造紫色病毒云，持续掉血并减速
- 冰冻瓶：制造蓝色冰雾，减速并禁止闪避
- 啤酒：短时间提高攻击力，人物脸会泛红、双颊变红并轻微摇晃
- 强化木刀：提高攻击力、增加攻击距离，刀身有金色发光效果和金色亮点
- 肉块：恢复生命值；满血时也不会阻止之后拾取其他道具

箱子被打碎后不会永久消失，会等待约 10–17 秒，然后在随机位置从空中落下。

### 人物状态视觉

状态特效不再使用单一的上身彩色圈圈：

- 中毒：绿色气泡围绕人物上升
- 病毒：紫色脉冲结晶斑点
- 冻伤：手脚和身体出现蓝色冰晶
- 炸伤：短暂黑烟和橙色火星
- 啤酒：脸红、双颊变红和轻微醉酒动作
- 强化刀：金色刀刃光、金色残影和移动亮点

双方血条下方会显示状态文字，例如：

- `中毒 2.4s`
- `病毒感染 1.8s`
- `冻伤减速 3.2s`
- `炸伤 0.9s`
- `啤酒强化 6.5s`
- `金色强化刀 8.4s`

## 文件结构

- `index.html`：纯 3D 入口页，会进入 `three-preview.html`
- `three-preview.html`：3D 对战页面
- `arena.js`：Three.js 场景、人物模型、特效、输入、UI、PeerJS 联机逻辑
- `arena-core.js`：与渲染无关的确定性战斗逻辑，适合写测试
- `arena.css`：大厅和 3D 页面样式
- `tests/arena.test.js`：Node 原生测试，覆盖战斗、跳跃、楼梯、道具、状态和联机相关核心逻辑
- `serve.js`：本地静态服务器
- `package.json`：本地启动和测试脚本
- `vendor/three.module.js`、`vendor/three.core.js`：本地 Three.js 文件
- 旧版 2D Canvas 大厅和游戏入口已从网页中移除；当前网页只保留 3D 版本
- `README.md`：项目快速说明

## 本地运行

在 `grand-brawl-arena` 目录运行：

```bash
npm start
```

然后打开：

```text
http://127.0.0.1:4173/index.html
```

直接打开 3D 页面：

```text
http://127.0.0.1:4173/three-preview.html?v=22
```

运行测试：

```bash
node --test tests/arena.test.js
git diff --check
```

当前项目使用的 Node 路径如果系统默认 Node 不可用，可以使用：

```text
/Users/ziyang0621/.nvm/versions/node/v23.6.0/bin/node
```

## 联机测试

1. 打开 3D 页面。
2. 一个人点击“创建 3D 房间”。
3. 把四位房间码发给朋友。
4. 朋友在另一个浏览器打开相同页面，输入房间码并点击“加入 3D 房间”。

之前使用过的临时 Cloudflare 测试地址：

```text
https://particles-diploma-reasonably-lookup.trycloudflare.com/three-preview.html?v=22
```

临时隧道可能失效；如果打不开，需要重新启动静态服务器和 Cloudflare quick tunnel。

## 重要实现约定

- 游戏逻辑优先写在 `arena-core.js`，不要把核心规则直接写进渲染循环。
- `arena-core.js` 使用固定时间步长 `STEP = 1 / 120`。
- 改动战斗规则后，必须同步修改 `tests/arena.test.js`。
- 修改 `arena.js` 或 `arena.css` 后，记得提高 `three-preview.html` 里的 query 版本，避免浏览器缓存旧代码。
- 联机状态会通过世界快照传输，因此新增人物字段时要考虑是否需要同步和重置。
- 不要使用真实《海贼王》角色素材或名称作为最终商业素材；当前只是玩法和气氛参考。

## 已知问题和待优化方向

### 优先级高

1. 抓取和投摔虽然已经有完整流程，但动作仍是程序化旋转，后续应制作更自然的抱起、挣扎和投掷动画。
2. 强化刀的金色发光目前是几何发光层和亮点，后续可以加入真正的刀光拖尾、金色粒子和出刀音效。
3. 需要增加更清晰的角色受击动画：后仰、眩晕、倒地、起身和受身翻滚。
4. 需要优化联机延迟、断线重连、房主离开和双方位置平滑。
5. 当前两个角色主要是颜色不同，后续应加入不同角色属性和专属技能。

### 优先级中

- 增加锁定对手和自动面向功能
- 增加冲刺攻击、上挑、横扫和方向键派生招式
- 增加场景破坏、木桶、炮弹等互动物件
- 增加击飞到墙壁或平台边缘的特殊反应
- 增加胜利慢动作、终结一击和回合倒计时表现
- 增加移动端虚拟按键
- 进一步优化手机屏幕上的血条、状态文字和技能按钮布局

## 最近一次提交和 GitHub 状态

代码已经在本地提交到 `main` 分支，提交为：

```text
6710b65 feat: expand 3d grand brawl combat prototype
```

推送到 GitHub 时遇到本机 GitHub HTTPS 登录问题：

```text
fatal: could not read Username for 'https://github.com': Device not configured
```

因此后续 AI 接手时，需要先完成 GitHub 登录或改用 SSH remote，再执行：

```bash
git push origin main
```

不要执行 `git reset --hard` 或覆盖用户现有修改。先查看：

```bash
git status
git log --oneline -5
git remote -v
```
