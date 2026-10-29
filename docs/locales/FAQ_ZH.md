[← 返回 README](../../README.md)

# ❓ 常见问题

<details>
<summary><b>需要开着 Steam 客户端吗？</b></summary>

不需要。SteamEdge 直接使用 Steam 自己的网络协议。客户端从不启动，开着也不会有任何差别。

</details>

<details>
<summary><b>账号会被封锁吗？</b></summary>

挂机游戏与通过协议解锁成就是许多工具都在做的事，Valve 从未公开表态。但这不代表安全。风险由你自行承担。决定之前请先阅读下方的免责声明。

</details>

<details>
<summary><b>为什么价格没有换算成我的货币？</b></summary>

它本来就是。价格由 Steam 以你的钱包货币提供，并原封不动显示。换算等于自行编造汇率，而编造的数字比没有数字更糟。

</details>

<details>
<summary><b>某个成就解锁不了，为什么？</b></summary>

有些成就由游戏服务器写入而非客户端，Steam 不允许任何客户端更动。SteamEdge 会从结构描述辨识这类成就并跳过，而不是反复尝试失败。另有少数游戏根本不通过这个协议保存统计数据，此时你会看到 `0 / N`，这无法处理。

</details>

<details>
<summary><b>更新后无法运作，该怎么办？</b></summary>

请确认新版本解压到全新的空文件夹，并且只复制了 `settings/`；覆盖旧文件夹会让两个版本的文件混在一起。请先看教程的[故障排查](./TUTORIAL_ZH.md#-故障排查)，再查看 `logs/` 文件夹中的日志。若仍无法运作，请创建问题反馈并附上这些日志。

</details>
