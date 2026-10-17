[← 返回 README](../../README.md)

# ⚙️ 设置

常规设置存放在可执行文件旁的 `settings/settings.json`，各账号专属数据则在 `settings/accounts/<steamID>.json`。几乎全部都能在应用程序的「设置」页面和各功能自己的页面上调整，没有必要手动编辑文件。「设置」页面上的修改只有在按下「保存」后才会套用，运行中的任务会在几秒内采用新设置。

> **切勿分享 `settings/` 文件夹。** 里面有你的 Steam 会话令牌，光凭它就足以使用你的账号。

| 键值 | 默认 | 作用 |
|---|---|---|
| `boostMaxGames` | `32` | 时数提升同时开启几款游戏 |
| `boostSync` | `false` | 把选定的游戏拉到相同的总时数 |
| `fetchAvgWithPrice` | `true` | 取得价格时一并取得成交平均价 |
| `pauseFarmOnBoost` | `false` | 时数提升或拟真模式运行时暂停卡牌收集 |
| `bulkSellLimit` | `50` | 批量出售按此数量分批；`0` 表示一直上架直到 Steam 停止 |
| `priceDropThreshold` | `10` | 低于 Steam 24 小时平均价多少百分比视为跌价 |
| `reconnectPolicy` | `unlimited` | 断线后重新连线：`unlimited`（不限）、`10`、`3` 或 `off`（关闭） |
| `sessionTimeout` | `never` | 闲置这么多分钟后关闭所有会话；运行中的任务不算闲置 |
| `theme` | `dark` | 配色主题：`dark`、`midnight`、`white` |
| `language` | `en` | 界面语言：`tr`、`en`、`de`、`es`、`zh`、`ru` |

[配置参考](./TUTORIAL_ZH.md#️-配置参考)涵盖了值得了解的键；其余的对应设置页面上的其他控件。
