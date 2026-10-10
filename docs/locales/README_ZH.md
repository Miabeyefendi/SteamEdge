<div align="center">

<img src="../../assets/logo-mark.svg" width="120" alt="SteamEdge">

# SteamEdge

**不必开启 Steam 客户端，也能收集集换式卡牌、累积游玩时数并管理成就。**

[![授权：AGPL v3](https://img.shields.io/badge/%E6%8E%88%E6%9D%83-AGPL_v3-A78BFA?style=for-the-badge&logo=gnu&logoColor=white)](../../LICENSE)
[![版本](https://img.shields.io/github/v/release/Miabeyefendi/SteamEdge?style=for-the-badge&color=F59E0B&label=%E7%89%88%E6%9C%AC)](https://github.com/Miabeyefendi/SteamEdge/releases/latest)
[![平台](https://img.shields.io/badge/Windows-1E293B?style=for-the-badge&logo=windows&logoColor=white)](#-安装)
[![状态](https://img.shields.io/badge/%E7%8A%B6%E6%80%81-%E7%BB%B4%E6%8A%A4%E4%B8%AD-22C55E?style=for-the-badge)](#)
[![作者](https://img.shields.io/badge/%E4%BD%9C%E8%80%85-Miabeyefendi-0EA5E9?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Miabeyefendi)

[English](../../README.md) · [Türkçe](./README_TR.md) · [Español](./README_ES.md) · **简体中文** · [Русский](./README_RU.md)

[安装](#-安装) · [功能](#-功能重点) · [使用](#-快速开始) · [教程](./TUTORIAL_ZH.md) · [更新记录](../../CHANGELOG.md)

<a href="https://github.com/Miabeyefendi/SteamEdge/releases/latest">
  <img src="../../assets/btn-download.svg" height="52" alt="下载最新版本">
</a>
<a href="./TUTORIAL_ZH.md">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../assets/btn-tutorial-dark.svg">
    <img src="../../assets/btn-tutorial.svg" height="52" alt="阅读教程">
  </picture>
</a>

<img src="../../design/screenshots/Overview.png" width="92%" alt="SteamEdge 在不使用 Steam 客户端的情况下收集卡牌、提升时数并管理成就">

</div>

---

## ✨ 功能重点

- **卡牌收集** - 让游戏显示为「游玩中」以掉落集换式卡牌。共七种模式，其中一种知道在掉落受限的账号上，Steam 必须等游戏时长超过某个门槛（通常是两小时）才会开始掉卡。
- **时数提升** - 同时最多开启 32 款游戏，并可选择时数同步，把选定的游戏拉到相同的总时数。
- **成就管理** - 直接从 Steam 协议读取真实的锁定与解锁状态，然后批量解锁或重新锁定。
- **拟真模式** - 保持单一游戏开启，并将成就由最常见到最稀有依次分散在整个时段解锁，让个人资料看起来像真的玩过。
- **库存与市集** - 真实成交记录、挂单簿、批量平均价与出售，全部以你的钱包货币显示。上架价格使用 Steam 自己的手续费计算；批量出售达到 Steam 的账号上限时会停止并说明原因，也可以分批出售。
- **聊天** - 好友列表、对话与发送消息，走的是同一套网络协议。未读数量会显示在标签页上，队列运行时也不会漏掉消息。
- **多账号** - 多个账号同时连接，各自在后台运行，切换时不会丢失进度。统计数据按账号分别保存。
- **主题与语言** - 深色、午夜紫与白色主题，登录画面也一样。土耳其语、英语、德语、西班牙语、繁体中文与俄语。新安装默认使用英语。
- **不需要 Steam 客户端** - 直接使用 Steam 自己的网络协议。客户端从不启动，也不需要。
- **免安装** - 解压缩即可运行。没有安装程序，不写注册表，所有数据都放在可执行文件旁边。

---

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

---

## 📦 安装

### 系统需求

| | |
|---|---|
| 操作系统 | Windows 10 以上，64 位 |
| Steam 账号 | 已设置 Steam 两步验证，手机或电子邮件皆可 |
| 磁盘空间 | 解压缩后约 330 MB |
| Steam 客户端 | 不需要，也不会使用 |

### 技术组成

![Electron](https://img.shields.io/badge/Electron-1E293B?style=for-the-badge&logo=electron&logoColor=A78BFA)
![Node.js](https://img.shields.io/badge/Node.js-1E293B?style=for-the-badge&logo=nodedotjs&logoColor=A78BFA)
![JavaScript](https://img.shields.io/badge/JavaScript-1E293B?style=for-the-badge&logo=javascript&logoColor=A78BFA)

### 安装

```bash
git clone https://github.com/Miabeyefendi/SteamEdge.git
cd SteamEdge
npm install
```

<details>
<summary><b>改用发行版本安装</b></summary>

1. 从[发行页面](https://github.com/Miabeyefendi/SteamEdge/releases/latest)下载最新的 `.rar`。
2. 解压缩到任意位置。请选择你有权限的文件夹，不要放在 `Program Files`。
3. 运行 `SteamEdge.exe`。没有任何安装步骤，也不会在该文件夹之外写入任何东西。
4. 更新时请把新版本解压到一个全新的空文件夹，再把旧文件夹中的 `settings/` 复制过去。在程序开启时直接覆盖旧文件夹会让两个版本的文件混在一起。

</details>

---

## 🚀 快速开始

```bash
npm start
```

首次启动会出现登录画面。用 Steam 手机应用程序扫描 QR 码，或切换到密码标签页输入账号密码与 Steam 两步验证码。除了可执行文件旁 `settings/` 内的一组会话令牌之外，不会保存任何东西。

登录之后，「总览」会显示正在运行的工作与可用的功能。开启**卡牌收集**，刷新列表，选择模式并按下开始。其余的可以等你读完[教程](./TUTORIAL_ZH.md)再说。

---

## ⚙️ 设置

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

---

## 📖 文档

- [**教程**](./TUTORIAL_ZH.md) - 每项功能、每个设置的完整说明
- [**更新记录**](../../CHANGELOG.md) - 每个版本改了什么
- [**参与贡献**](../../CONTRIBUTING.md) - 如何提交修改
- [**安全性**](../../SECURITY.md) - 如何私下回报安全漏洞

---

## 🧭 开发计画

- [x] Steam 聊天：好友列表、对话与发送消息，都在程序内
- [x] 俄文界面，与文件的语言一致
- [x] 拟真模式已依设计稿重建
- [x] 以物品为单位的市集队列，价格与平均价一并取得
- [x] 运行时产生的所有文字都已翻译，各语言都有复数形式 (1.3.0)
- [x] 主题：深色、午夜紫、白色 (1.3.0)
- [x] Electron 41 (1.3.2)
- [x] 默认使用英语，其余界面文字已翻译 (1.3.3)
- [x] 整个代码库改用英语：标识符、注释、元素 id、IPC 通道、设置键与文件名 (1.4.0)
- [ ] 其余页面依设计稿重建，一个版本一页

以上都不是承诺。这是个人项目，优先顺序改变时这份列表也会跟着改。

---

## ❓ 常见问题

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

请确认新版本解压到全新的空文件夹，并且只复制了 `settings/`；覆盖旧文件夹会让两个版本的文件混在一起。请先看教程的[故障排查](./TUTORIAL_ZH.md#-故障排查)，再查看 `cache/steamedge.log` 日志。若仍无法运作，请创建问题反馈并附上该日志。

</details>

---

## 🤝 参与贡献

欢迎贡献。请先阅读 [CONTRIBUTING.md](../../CONTRIBUTING.md) 与
[CODE_OF_CONDUCT.md](../../CODE_OF_CONDUCT.md)。提交贡献即表示你同意以 AGPL-3.0
授权你的作品。

<div align="center">
<a href="https://github.com/Miabeyefendi/SteamEdge/issues/new?template=bug_report.yml">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../assets/btn-report-bug-dark.svg">
    <img src="../../assets/btn-report-bug.svg" height="52" alt="报告问题">
  </picture>
</a>
<a href="https://github.com/Miabeyefendi/SteamEdge/stargazers">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../assets/btn-star-dark.svg">
    <img src="../../assets/btn-star.svg" height="52" alt="为这个仓库加星">
  </picture>
</a>
</div>

---

## 🛡️ 安全性

发现安全漏洞了吗？请勿创建公开的问题反馈，改依 [SECURITY.md](../../SECURITY.md)
中的私下报告流程处理。

---

## 📜 授权

本项目采用 **GNU Affero 通用公共授权条款第 3 版（AGPL-3.0）**，并搭配
[NOTICE](../../NOTICE) 文件中的补充条款。摘要如下：

- 你可以免费使用、研究、修改、再散布本软件，甚至用它获利，**前提是**你必须
  依 AGPL-3.0 持续提供完整原始码，包含任何托管、SaaS 或网络场景的使用
  （AGPL 第 13 条），并保留下方的作者标示。
- 若要将本作品用于闭源或专有产品，或作为封闭的 SaaS 营运，你需要**另行取得
  书面商业授权**，该授权可能包含权利金或收入分成。详见 [NOTICE](../../NOTICE)
  第 8 节，并与我联系。

### 作者标示（必要）

依 AGPL-3.0 第 7(b) 条，下列标示必须在本项目的任何副本、分支或部署中，
以可见且未经修改的形式保留：

> **Miabeyefendi (Mustafa Ihsan Albayrak)** - https://github.com/Miabeyefendi

### 免责声明

本软件以「现状」提供，不附任何形式的保证。你完全自行承担运行风险，并须自行
负责一切使用行为，包括遵守本软件所互动之任何第三方平台的服务条款。Valve 与
Steam 与作者并无隶属关系，亦未为本项目背书；其名称与商标属于各自所有人。
在适用法律允许的最大范围内，作者对账号封锁、数据丢失或任何其他损害概不负责。
完整条款请见 [LICENSE](../../LICENSE) 与 [NOTICE](../../NOTICE) 文件。

---

## 📬 联系方式

- GitHub：[@miabeyefendi](https://github.com/Miabeyefendi)
- 商业授权或收入分成事宜，请通过我的 GitHub 个人文件与我联系。
