[← 返回 README](../../README.md)

# ✨ 功能重点

- **卡牌收集** - 让游戏显示为「游玩中」以掉落集换式卡牌。共七种模式，其中一种知道在掉落受限的账号上，Steam 必须等游戏时长超过某个门槛（通常是两小时）才会开始掉卡。
- **时数提升** - 同时最多开启 32 款游戏，并可选择时数同步，把选定的游戏拉到相同的总时数。
- **成就管理** - 直接从 Steam 协议读取真实的锁定与解锁状态，然后批量解锁或重新锁定。
- **拟真模式** - 保持单一游戏开启，并将成就由最常见到最稀有依次分散在整个时段解锁，让个人资料看起来像真的玩过。
- **库存与市集** - 真实成交记录、挂单簿、批量平均价与出售，全部以你的钱包货币显示。上架价格使用 Steam 自己的手续费计算；批量出售达到 Steam 的账号上限时会停止并说明原因，也可以分批出售。可在同一页面撤回上架中的项目，并开启补充包。选择器可切换到其他游戏的物品（Counter-Strike 2、Dota 2 等），使用同样的工具。
- **产品序号** - 粘贴一串序号，它们会在后台逐个兑换。达到 Steam 每小时的上限时，队列会等待并自动继续。账号已拥有的序号可以改在你的其他账号上尝试，免费游戏可通过商店链接添加。
- **聊天** - 好友列表、对话与发送消息，走的是同一套网络协议。未读数量会显示在标签页上，队列运行时也不会漏掉消息。
- **多账号** - 多个账号同时连接，各自在后台运行，切换时不会丢失进度。统计数据和各项任务的设置（卡片掉落、Hour Booster、拟真模式、成就及其排程）按账号分别保存，两个账号可以用不同的设置运行。
- **排程、代理与令牌保护** - 集卡和拟真模式可以在指定时段内自动运行，每个账号可以使用自己的 HTTP 或 SOCKS5 代理（登录也有一个），保存的登录令牌也可以用 Windows DPAPI 加密。
- **名单与过滤** - 集卡的永久黑名单和白名单、略过仍在退款期的游戏的过滤、排在列表最前面的收藏游戏，以及库存的 CSV 导出。
- **主题与语言** - 深色、午夜紫与白色主题，登录画面也一样。土耳其语、英语、德语、西班牙语、繁体中文与俄语。新安装默认使用英语。
- **适配你的屏幕** - 版面在 900 x 560 以内都能自适应：列表会换行而不是跑出边缘，窗口变窄时侧边栏会自动收起，窗口变矮时界面会自动变为紧凑。窗口会回到你上次放的位置（前提是那块屏幕仍然存在）。窗口小于 900 x 560 时整页会随之缩放（最小 675 x 420），按钮保持原有形状。
- **模块化** - 关闭你用不到的页面（集卡、时长、库存、成就、密钥、聊天），其余按自己的顺序排列。关闭的页面不会向 Steam 请求任何东西。轻量模式会为较弱的电脑关闭动画和模糊，自动设置会替你选择。小功能（动态方块、最爱星号、「我的上架」与 CSV 按钮）和顶部栏项目（搜索、通知、更新）也可以关闭。
- **从中断处继续** - 应用关闭、电脑关机或应用崩溃时仍在进行的集卡、时数提升或拟真模式，会在账号再次连线后从中断处继续。应用没在运行的时间不计入：剩三小时的提升回来后仍剩三小时。
- **易读且支持键盘** - 80% 到 150% 的界面缩放（也可用 Ctrl + / - / 0），跟随系统对比度设置的高对比主题，对比度至少 4.5 : 1 且不小于 11 像素的文字，以及可用键盘和屏幕阅读器操作的开关与侧边菜单。
- **快速导航** - Ctrl+K 打开命令面板，输入时即可找到页面、设置、账号和当前页面的操作；Ctrl+1 到 Ctrl+9 按编号打开页面，? 列出快捷键，设置有自己的搜索框，并标出你修改和保存过的分区。
- **不需要 Steam 客户端** - 直接使用 Steam 自己的网络协议。客户端从不启动，也不需要。
- **免安装** - 解压缩即可运行。没有安装程序，不写注册表，所有数据都放在可执行文件旁边。

## 📸 截图

<div align="center">

| | |
|:-:|:-:|
| <img src="../../design/screenshots/CardFarming.png" alt="卡牌收集"><br><sub>卡牌收集</sub> | <img src="../../design/screenshots/HourBoostr.png" alt="时长提升"><br><sub>时长提升</sub> |
| <img src="../../design/screenshots/Achievements.png" alt="成就"><br><sub>成就</sub> | <img src="../../design/screenshots/RealisticMode.png" alt="拟真模式"><br><sub>拟真模式</sub> |
| <img src="../../design/screenshots/RealisticModeAdvanced.png" alt="拟真模式，高级"><br><sub>拟真模式，高级</sub> | <img src="../../design/screenshots/Market.png" alt="库存与市集"><br><sub>库存与市场</sub> |
| <img src="../../design/screenshots/Market2.png" alt="市场，订单簿"><br><sub>市场，订单簿</sub> | <img src="../../design/screenshots/Chat.png" alt="Steam 聊天"><br><sub>Steam 聊天</sub> |
| <img src="../../design/screenshots/SettingsGeneral.png" alt="设置"><br><sub>设置</sub> |  |

**主题：深色、午夜紫、白色（设定 > 一般 > 主题）**

| 深色 | 午夜紫 | 白色 |
|---|---|---|
| <img src="../../design/screenshots/themes/overview-dark.png" alt="深色"> | <img src="../../design/screenshots/themes/overview-midnight.png" alt="午夜紫"> | <img src="../../design/screenshots/themes/overview-white.png" alt="白色"> |
| <img src="../../design/screenshots/themes/login-dark.png" alt="深色"> | <img src="../../design/screenshots/themes/login-midnight.png" alt="午夜紫"> | <img src="../../design/screenshots/themes/login-white.png" alt="白色"> |

</div>
