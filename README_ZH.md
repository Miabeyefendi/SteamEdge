<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/logo-dark.svg">
  <img src="./assets/logo.svg" width="120" alt="SteamEdge">
</picture>

# SteamEdge

**不必开启 Steam 客户端，也能收集集换式卡牌、累积游玩时数并管理成就。**

[![授权：AGPL v3](https://img.shields.io/badge/%E6%8E%88%E6%9D%83-AGPL_v3-A78BFA?style=for-the-badge&logo=gnu&logoColor=white)](./LICENSE)
[![版本](https://img.shields.io/github/v/release/Miabeyefendi/SteamEdge?style=for-the-badge&color=F59E0B&label=%E7%89%88%E6%9C%AC)](https://github.com/Miabeyefendi/SteamEdge/releases/latest)
[![平台](https://img.shields.io/badge/Windows-1E293B?style=for-the-badge&logo=windows&logoColor=white)](#-安装)
[![状态](https://img.shields.io/badge/%E7%8A%B6%E6%80%81-%E7%BB%B4%E6%8A%A4%E4%B8%AD-22C55E?style=for-the-badge)](#)
[![作者](https://img.shields.io/badge/%E4%BD%9C%E8%80%85-Miabeyefendi-0EA5E9?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Miabeyefendi)

[English](./README.md) · [Türkçe](./README_TR.md) · [Español](./README_ES.md) · **简体中文** · [Русский](./README_RU.md)

[安装](#-安装) · [功能](#-功能重点) · [使用](#-快速开始) · [教程](./TUTORIAL_ZH.md) · [更新记录](./CHANGELOG.md)

<a href="https://github.com/Miabeyefendi/SteamEdge/releases/latest">
  <img src="./assets/btn-download.svg" height="52" alt="下载最新版本">
</a>
<a href="./TUTORIAL_ZH.md">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/btn-tutorial-dark.svg">
    <img src="./assets/btn-tutorial.svg" height="52" alt="閱读教程">
  </picture>
</a>

</div>

---

## ✨ 功能重点

- **卡牌收集** - 讓游戏显示为「游玩中」以掉落集换式卡牌。共五種模式，其中一種知道 Steam 必須等游戏累积满兩小时才会开始掉卡。
- **时数提升** - 同时最多开启 32 款游戏，并可选择时数同步，把选定的游戏拉到相同的总时数。
- **成就管理** - 直接从 Steam 协定读取真实的锁定与解锁状态，然后批次解锁或重新锁定。
- **擬真模式** - 保持单一游戏开启，并将成就由最常见到最稀有依序分散在整个时段解锁，讓个人文件看起来像真的玩过。
- **库存与市集** - 真实成交记录、挂单簿、批次平均价与販售，全部以你的钱包货币显示。
- **多账号** - 多个账号同时连线，各自在背景运行，切换时不会遺失进度。
- **不需要 Steam 客户端** - 直接使用 Steam 自己的网络协定。客户端从不启动，也不需要。
- **免安装** - 解压缩即可运行。沒有安装程序，不写登录档，所有资料都放在运行档旁边。

---

## 📦 安装

### 系统需求

| | |
|---|---|
| 作业系统 | Windows 10 以上，64 位元 |
| Steam 账号 | 已设置 Steam 兩步骤验证，手机或电子郵件皆可 |
| 磁碟空间 | 解压缩后約 320 MB |
| Steam 客户端 | 不需要，也不会使用 |

### 技術組成

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
3. 运行 `SteamEdge.exe`。沒有任何安装步骤，也不会在该文件夹之外写入任何东西。

</details>

---

## 🚀 快速开始

```bash
npm start
```

首次启动会出现登录畫面。用 Steam 手机应用程序掃描 QR 碼，或切换到密碼分页输入账号密碼与 Steam 兩步骤验证碼。除了运行档旁 `settings/` 内的一組工作阶段权杖之外，不会保存任何东西。

登录之后，「总览」会显示正在运行的工作与可用的功能。开启**卡牌收集**，重新整理清单，选择模式并按下开始。其余的可以等你读完[教程](./TUTORIAL_ZH.md)再说。

---

## ⚙️ 设置

一般设置存放在运行档旁的 `settings/settings.json`，各账号专屬资料則在 `settings/accounts/<steamID>.json`。全部都能在应用程序的「设置」页面调整，沒有必要手动编辑文件。

> **切勿分享 `settings/` 文件夹。** 裡面有你的 Steam 工作阶段权杖，光憑它就足以使用你的账号。

| 键值 | 默认 | 作用 |
|---|---|---|
| `boostMaxGames` | `32` | 时数提升同时开启幾款游戏 |
| `boostSync` | `false` | 把选定的游戏拉到相同的总时数 |
| `fetchAvgWithPrice` | `true` | 取得价格时一併取得成交平均价 |
| `pauseFarmOnBoost` | `false` | 时数提升启动时停止卡牌收集 |
| `sessionTimeout` | `never` | 閒置这麼多分钟后中断连线 |
| `uiLang` | `tr` | 界面语言：`tr`、`en`、`de`、`es`、`zh` |

所有键值都记载于[配置参考](./TUTORIAL_ZH.md#️-配置参考)。

---

## 📖 文件

- [**教程**](./TUTORIAL_ZH.md) - 每项功能、每个设置的完整说明
- [**更新记录**](./CHANGELOG.md) - 每个版本改了什麼
- [**参与貢獻**](./CONTRIBUTING.md) - 如何提交修改
- [**安全性**](./SECURITY.md) - 如何私下回报安全漏洞

---

## 🧭 开发计畫

- [ ] Steam 聊天整合。引擎已能接收讯息并自动回覆，缺的是界面。
- [ ] 俄文界面，与文件的语言一致。
- [ ] 其余页面依设计稿重建，一个版本一页。
- [x] 擬真模式已依设计稿重建
- [x] 以物品为单位的市集佇列，价格与平均价一併取得

以上都不是承諾。这是个人专案，優先顺序改变时这份清单也会跟著改。

---

## ❓ 常见问题

<details>
<summary><b>需要开著 Steam 客户端嗎？</b></summary>

不需要。SteamEdge 直接使用 Steam 自己的网络协定。客户端从不启动，开著也不会有任何差别。

</details>

<details>
<summary><b>账号会被封锁嗎？</b></summary>

挂机游戏与透过协定解锁成就是許多工具都在做的事，Valve 从未公开表态。但这不代表安全。風險由你自行承擔。決定之前请先閱读下方的免責聲明。

</details>

<details>
<summary><b>为什麼价格沒有换算成我的货币？</b></summary>

它本来就是。价格由 Steam 以你的钱包货币提供，并原封不动显示。换算等于自行编造匯率，而编造的数字比沒有数字更糟。

</details>

<details>
<summary><b>某个成就解锁不了，为什麼？</b></summary>

有些成就由游戏伺服器写入而非客户端，Steam 不允許任何客户端更动。SteamEdge 会从結构描述辨识这类成就并略过，而不是反覆尝试失败。另有少数游戏根本不透过这个协定保存统计资料，此时你会看到 `0 / N`，这无法处理。

</details>

<details>
<summary><b>更新后无法运作，该怎麼辦？</b></summary>

请先看教程的[故障排查](./TUTORIAL_ZH.md#-故障排查)，再查看 `cache/steamedge.log` 日志。若仍无法运作，请开立问题反馈并附上该日志。

</details>

---

## 🤝 参与貢獻

歡迎貢獻。请先閱读 [CONTRIBUTING.md](./CONTRIBUTING.md) 与
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。提交貢獻即表示你同意以 AGPL-3.0
授权你的作品。

<div align="center">
<a href="https://github.com/Miabeyefendi/SteamEdge/issues/new?template=bug_report.yml">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/btn-report-bug-dark.svg">
    <img src="./assets/btn-report-bug.svg" height="52" alt="回报问题">
  </picture>
</a>
<a href="https://github.com/Miabeyefendi/SteamEdge/stargazers">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/btn-star-dark.svg">
    <img src="./assets/btn-star.svg" height="52" alt="为这个儲存库加星">
  </picture>
</a>
</div>

---

## 🛡️ 安全性

发现安全漏洞了嗎？请勿开立公开的问题反馈，改依 [SECURITY.md](./SECURITY.md)
中的私下回报流程处理。

---

## 📜 授权

本专案採用 **GNU Affero 通用公共授权条款第 3 版（AGPL-3.0）**，并搭配
[NOTICE](./NOTICE) 文件中的補充条款。摘要如下：

- 你可以免費使用、研究、修改、再散布本软件，甚至用它获利，**前提是**你必須
  依 AGPL-3.0 持续提供完整原始碼，包含任何託管、SaaS 或网络型态的使用
  （AGPL 第 13 条），并保留下方的作者标示。
- 若要将本作品用于闭源或专有产品，或作为封闭的 SaaS 營运，你需要**另行取得
  書面商业授权**，该授权可能包含权利金或營收分潤。详见 [NOTICE](./NOTICE)
  第 8 节，并与我聯络。

### 作者标示（必要）

依 AGPL-3.0 第 7(b) 条，下列标示必須在本专案的任何副本、分支或部署中，
以可见且未经修改的形式保留：

> **Miabeyefendi (Mustafa Ihsan Albayrak)** - https://github.com/Miabeyefendi

### 免責聲明

本软件以「现状」提供，不附任何形式的保证。你完全自行承擔运行風險，并須自行
負責一切使用行为，包括遵守本软件所互动之任何第三方平台的服务条款。Valve 与
Steam 与作者并无隸屬关係，亦未为本专案背書；其名称与商标屬于各自所有人。
在適用法律允許的最大範圍内，作者对账号封锁、资料遺失或任何其他損害概不負責。
完整条款请见 [LICENSE](./LICENSE) 与 [NOTICE](./NOTICE) 文件。

---

## 📬 聯络方式

- GitHub：[@miabeyefendi](https://github.com/Miabeyefendi)
- 商业授权或營收分潤事宜，请透过我的 GitHub 个人文件与我聯络。
