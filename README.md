# Grand Brawl Arena（海贼大乱斗）

Three.js 网页 3D 乱斗游戏，向 PS2《One Piece Grand Battle》的玩法和画面风格靠拢。**所有角色、场地都是原创**，不使用任何《海贼王》版权角色、名称或素材。无需安装依赖（Three.js r180 在 `vendor/`）。

- 仓库：https://github.com/ziyang0621/grand-brawl-arena ，当前工作分支 `touch-controls`（其他分支：`grand-battle-style`）
- 在线试玩（Claude Artifact，最新版本随每次改动重新发布）：https://claude.ai/artifact/9EdGnDu6DsdakPJZVRUuQK
- 更详细的历史与设计决策见 `PROGRESS.md`（按版本倒序的开发日志，文件顶部是最新状态和接手须知）

## 运行与测试

```sh
npm start          # 本地服务器，默认 http://127.0.0.1:4173/three-preview.html （端口用 PORT=4180 修改）
npm test           # node --test tests/*.test.js ，241 项；最近验证与偶发失败见 PROGRESS.md
```

Node.js 20+。`serve.js` 只公开**白名单**内的文件：新增 `.js` 模块必须加进 `serve.js` 的白名单，否则浏览器会 404。
调试：URL 加 `?debug=1` 会暴露 `window.__brawl`（world、keys、`run(seconds,fps,render)`、`action(code)`、camera、renderer），截图脚本靠它驱动游戏。触屏设备或 `?touch=1` 显示虚拟按键。

## 玩法概览

- 选人 / 选场画面 → VS 演出 → 三局两胜（每局 99 秒），有 ROUND / FIGHT / K.O.、必杀切入、K.O. 慢镜头。
- **6 个角色**：红帆（海盗剑士）、蓝潮（港口守卫）、铁拳（水手拳师）、火哨（炮手狙击）、灶火（踢技厨师）、云雀（气象航海士）。招式、防御姿势（每人不同的 guard）、脸型和发型各不相同。
- **3 个场地**（布局、地形、机关都不同）：风车港（弹跳网、炮击、巨浪）、沙之王都（流沙、落石、沙暴）、冬樱雪岛（冰面、滚地雪球、雪崩）。另有隐藏的 `classic` 场地供测试。危险物出现前都有预警（红圈、发射器、屏幕边缘提示）。
- **模式**：单挑（对战斗 AI 或静止练习）、三命模式、**四人乱斗**（你 + 3 CPU）、**2v2 组队**（你 + CPU 队友 vs 2 CPU）、跳台练习、**2 人 P2P 联机**（PeerJS 房间码，房主为权威端）。四人乱斗与 2v2 只支持单机。
- **可破坏布景**（桅杆 / 石柱 / 冰柱）、木桶 / 木箱 / 宝箱（不同掉落池）、道具：炸弹、毒瓶、病毒瓶、冰冻瓶、肉、啤酒、**强化武器**（金色水晶，攻击 +35% 持续 10 秒；每个角色自己的武器发光，不再只是木刀）。毒 / 病毒 / 冰冻瓶落地会形成各自的地面效果（见 `arena-clouds.js`）。
- AI 会用高台和梯子（`climbTo` / `routeDeck`）、争抢道具、躲避红圈、使用必杀。

### 操作

| 键盘 | 触屏 | 作用 |
| --- | --- | --- |
| WASD / 方向键 | 左下摇杆（先轻点再按住 = 奔跑） | 移动；双击方向键奔跑 |
| 空格 | 跳 | 二段跳（第二跳是空中蹬一下并带冲击环，没有空翻） |
| J | 攻击 | 三段连击；移动 + J 为角色专属移动技 |
| U / W+U | 重击 / 上挑 | 上挑后可跳起空中追击，第三下空中攻击砸地 |
| I | 抓 | 抓人 / 举箱，J 前投、U 高投，被抓连按 J/U/I 挣脱 |
| K | 道具 | 使用道具 |
| L / Shift+L / R+L | 技 | 一 / 二 / 三级必杀（先蓄力，地面圈显示范围，可被打断） |
| R（按住） | 防 | 只挡正面近战，侧后方正常受伤；U 重击可破防 |
| Shift | 闪 | 闪避 |
| 落地前按方向 + 空格 | — | 被击飞时受身翻滚 |
| Q | 朝向辅助 | 近身自动朝向开 / 关 |

## 代码结构

| 文件 | 职责 |
| --- | --- |
| `arena-core.js` | **独立、确定性的战斗模拟**（固定步长 `STEP=1/120`）：世界 / 角色状态、伤害、必杀、道具、机关、AI（`due()` 带抖动的计时器、`aiTarget`）、回合流程、四人乱斗与队伍。不依赖 DOM / Three.js，测试直接跑它 |
| `arena-roster.js` | 角色数据 `CHARACTERS`、场地数据 `STAGES`（平台、梯子、地形区、箱子、布景、机关）——模拟与渲染共用 |
| `arena.js` | 渲染循环、输入、HUD、选人、特效（effects 列表）、预警、镜头；`animateFighter` 负责所有角色动画 |
| `arena-models.js` | 每个角色的模型（`BUILDERS`）：躯干、带**膝 / 肘关节**的四肢（`leg.userData.knee`、`arm.userData.elbow`）、手和握持物；`STATURE` 与 `silhouette` 层负责角色整体身材差异；状态特效、头像渲染 |
| `arena-tailoring.js` | 连续蒙皮四肢、躯干/裙装曲面与贴体衣片；用程序生成的低分辨率纹理和 toon 渐变表现布料、皮革、金属、木头与肤色；冻结姿势的残影几何；`syncCostume` 在动画结束后同步骨骼 |
| `arena-crew.js` | 场外背景船员（水手点炮、岛民扔雪球）的模型与动作，只做画面表现，不影响模拟 |
| `arena-posing.js` | 游戏与检视页共用的待战/战斗姿势：蓄力/命中/收招、腰肩发力、肘膝弯曲、持枪/盾牌方向；只改渲染骨骼，不写战斗状态 |
| `character-study.html` | 本机人物检视页：正侧背面、表情/脸部贴图；普攻/移动攻击/重击的三个动作阶段，以及格挡/举起/必杀姿势 |
| `arena-face.js` | 头部与脸：雕刻头形、Canvas 画的表情贴图（只在状态变化时重画）、一缕缕头发、每人眼型 / 眉 / 鼻 / 标志 |
| `arena-guards.js` | 每个角色独有的防御造型 |
| `arena-stage.js` | 场地的三维布景构建 |
| `arena-pieces.js` | 可破坏布景的几何与倒塌 |
| `arena-clouds.js` | 毒 / 病毒 / 冰冻地面效果 |
| `arena-gfx.js` | 卡通着色（三阶渐变、随色相偏移的阴影、边缘光）、墨线描边 `ink()`、特效精灵 |
| `arena-touch.js` | 触屏虚拟按键 |
| `arena-session.js` | 联机输入有效期与再战规则 |
| `arena.css` | 界面样式 |
| `three-preview.html` | 入口页；`arena.js?v=N`、`arena.css?v=N` 的版本号在改动后必须手动加一，避免浏览器缓存（当前 `arena.js?v=74`） |

### 人物美术实现与接手步骤

- 目标是 PS2 时代的低多边形动漫格斗人物：大而清楚的角色剪影、分层服饰、少量手绘式明暗与硬朗轮廓。模型由 Three.js 几何和运行时生成的纹理构成，不依赖外部角色模型或贴图，也不使用原作角色素材。
- 场景层级为 `root → body → silhouette`。游戏位置、碰撞与动作倾斜作用于 `root/body`；`silhouette` 统一缩放头、衣服、蒙皮骨骼、武器、盾和状态效果。各人比例在 `arena-models.js` 的 `STATURE` 设置为 `[x, y, z]`。不要单独拉伸头、手臂或武器，否则关节和握持会分离。修改后同步检查头顶标签与 `renderPortraits()` 的头像取景。
- 角色部件由 `BUILDERS[角色ID]` 组合。改造/新增角色时复用 `torso()`、`limbs()`、`headGroup()` 与服装几何；将 `CHARACTERS` 中现有的原创角色数据作为配色/身材输入。肩肘和膝盖分别是分组关节；手持武器挂在肘下的 `weaponMount`。
- `articulateWaist()` 会把躯干、头、衣服和手臂放到骨盆以上的 `upper` 组，腿仍留在骨盆层。`arena-posing.js` 负责腰肩和关节姿势；`arena.js` 完成每帧姿势后调用 `syncSurface()`，令衣袖/裤腿蒙皮跟随骨骼。若改变父子层级，要检查绑定矩阵、装备方向和 `syncSurface()` 时机。
- `arena-tailoring.js` 的 `profileGeometry()` 用截面环生成连续曲面，支持封口、UV 和蒙皮权重；`tailoredTorso()`、`clothPanel()`、`skirtGeometry()`、`bladeGeometry()` 分别用于躯干、裁片、裙装和刀刃。`costumeMaterial(color, kind)` 按 kind 共享程序纹理/材质；增加材质类型时更新 `paintedMap()`，避免给每个网格另建高分辨率贴图或无必要的绘制调用。
- 面部画布、发帽与发束集中在 `arena-face.js`；眼、眉、鼻、嘴随表情状态更新。脸部编辑需用人物检视页核对正面和四分之三角度、默认/出招/大喊表情，并确认游戏第一帧的脸没有缺失。
- 先读 `PROGRESS.md` 顶部的最新版本记录与已知限制，再浏览 `tests/face-surface.test.js`、`tests/tailoring.test.js`、`tests/posing.test.js` 和 `tests/roster.test.js`。检视页是 `character-study.html`，可比较六人正侧背面、待战、各攻击阶段、格挡、举起、手/鞋近景；游戏入口是 `three-preview.html`。每次加模块也要更新 `serve.js` 白名单和 HTML 资源版本号。

## 开发约定（其他 AI / 开发者请先看）

1. 规则写在 `arena-core.js`，不要写进渲染循环；改战斗规则要同时改 / 加 `tests/` 里的测试。
2. 模拟必须确定性（联机靠房主权威 + 快照）：新增角色字段要考虑快照同步和 `nextRound` 重置（曾因 `nextRound` 丢掉 `team` 导致第二回合 CPU 站着不动，已有回归测试）。
3. 改角色骨架（`limbs()`、`weaponMount()`）后，攻击 / 必杀 / 防御姿势都要目检：`arena-posing.js` 设置肩肘/膝关节，`animateFighter` 完成状态动画后调用 `syncSurface` 同步蒙皮；不要把出招时的肘膝统一归零。
4. 动画：走路 / 奔跑的膝肘弯曲、空中分相姿势（起跳拉伸 → 上升抬膝 → 最高点蜷身展臂 → 下落备战）、二段跳蹬空、落地屈膝，都在 `animateFighter` 中，用指数平滑（`m.air`）避免突变。
5. 平衡测试（`tests/balance.test.js`）：6 角色单挑胜率约 41–61%，乱斗约 19–32%；改数值后要重跑。
6. 视觉验证靠 Playwright + `?debug=1`（Chromium 已预装，不要运行 `playwright install`）；截图脚本不在仓库里。
7. 不要用真实《海贼王》角色 / 素材；风格参考可以，角色必须原创。

## 已知问题与待办

- 连续关节、衣片剪裁、手鞋、材质、表情、腰肩体态、帽裙和武器造型持续更新（资源 v72）；攻击 / 必杀等姿势仍需逐角色完整目检，脸部与服装的手绘细节还要继续对照参考图打磨。
- 强化武器期间所有角色的近战距离统一加长到 3.25，对拳套 / 火枪等可能不合适，可按角色调整。
- 手机端性能未实测；联机仍只有 1v1，没有断线重连。
- 抓投、受击动画仍是程序化旋转，可以更自然。
- 尚未合并到主分支，`touch-controls` 领先 `origin/main`（GitHub 上 main 仍是旧版本）。
