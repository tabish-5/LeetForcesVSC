[![Leet-Forces Banner](https://img.shields.io/badge/Leet%20Forces-LeetCode%20%2B%20Codeforces-blue?style=for-the-badge&logo=vscode)](https://github.com/tabish-5/LeetForcesVSC)

<h2 align="center">Leet-Forces for VS Code</h2>

<p align="center">
  <em>
    LeetCode
    · Codeforces
  </em>
  <br />
  <em>
    Change
    · Test
    · Submit
    · Description
  </em>
  <br />
  <em>
    12 shared languages
    · SecretStorage auth
  </em>
</p>

<p align="center">
  <a href="https://github.com/tabish-5/LeetForcesVSC/actions?query=branch%3Amain">
    <img alt="CI Status" src="https://img.shields.io/github/check-runs/tabish-5/LeetForcesVSC/main?style=flat-square&label=CI"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=spy48.leet-forces">
    <img alt="VS Code Marketplace" src="https://img.shields.io/vscode-marketplace/v/spy48.leet-forces?style=flat-square&label=marketplace"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=spy48.leet-forces">
    <img alt="Installs" src="https://img.shields.io/vscode-marketplace/d/spy48.leet-forces?style=flat-square"></a>
  <a href="https://github.com/tabish-5/LeetForcesVSC#badge">
    <img alt="code style: cp-runner" src="https://img.shields.io/badge/code_style-cp-runner-ff69b4.svg?style=flat-square"></a>
  <br/>
  <a href="https://github.com/tabish-5/LeetForcesVSC">
    <img alt="GitHub" src="https://img.shields.io/badge/GitHub-181717?style=flat-square&logo=github"></a>
</p>

## Intro

> *LeetCode + Codeforces, unified.*

A port of the Java `CPRunner` terminal tool, rebuilt as a first-class VS Code extension. Open a folder, click the 🏁 icon in the Activity Bar, and your entire competitive-programming workflow — change, test, submit, and read — lives inside the editor.

```
┌─────────────────────────────────────────────────────┐
│  🏁 Leet-Forces                                     │
│                                                     │
│  Change ──► Test ──► Submit ──► Description         │
│                                                     │
│  LeetCode  ·  Codeforces  ·  12 shared languages    │
└─────────────────────────────────────────────────────┘
```

Leet-Forces can be run from the **Activity Bar** once you open a folder, or triggered through the command palette (`Ctrl+Shift+P` → *CP Runner: Change Problem*).

---

**[Documentation](https://github.com/tabish-5/LeetForcesVSC)**

[Why](#-why-leet-forces) ·
[Features](#-features) ·
[Install](#-install) ·
[Settings](#-settings)

**[Marketplace](https://marketplace.visualstudio.com/items?itemName=spy48.leet-forces)**

---

## 🚀 Why Leet-Forces?

| Before | After |
|--------|-------|
| 🕐 Switch tabs between browser, editor, terminal, and problem page | ⌨️ One keystroke to change problems |
| 🧪 Manually copy sample I/O into your compiler | ✅ Auto-run examples + saved failed cases locally |
| 📋 Scrolling the problem page for the statement | 📖 Rendered description panel beside your code |
| 🔐 Credentials scattered across files | 🔒 Live in VS Code SecretStorage — never in the workspace |
| 💔 Retesting failed submissions by hand | 🤖 Submit, then auto-capture the verdict and re-test failing cases |

---

## ✨ Features

### 🔄 Change Problem
Enter a **number**, **slug**, or **URL** — LeetCode or Codeforces.

- **`n`** / **`p`** — next / previous problem
- **`d`** — LeetCode daily challenge
- Smart URL parsing for both platforms

### 🧪 Test
| Platform | How it runs |
|----------|-------------|
| **LeetCode** | Runs on LeetCode's own judge — examples + your saved failed cases |
| **Codeforces** | Compiles and runs samples + custom tests locally (needs your compiler on `PATH`) |

### 📤 Submit
| Platform | Behavior |
|----------|----------|
| **LeetCode** | Submits directly and saves failing cases for later re-testing |
| **Codeforces** | Copies code to clipboard, opens the submit page, and tracks the verdict. Optionally posts directly via `cprunner.codeforces.submitMode`. |

### 📖 Description
Problem statements render as a **panel beside the editor** — read, scroll, and code without leaving your flow.

### 🌐 Languages
**12 languages shared by both sites.** Choose with *Choose Language* or set `cprunner.language`.

### 🔐 Auth
Logins live in **VS Code SecretStorage**, not in the workspace. An old `.cprunner/auth.json` is imported automatically once.

---

## 📦 Install

### 🧪 Best way to test it: install on VS Code (RECOMMENDED)

The fastest, most realistic way to try Leet-Forces is to install it directly in your own VS Code — it runs exactly as your users will experience it.

**Build from source and install:**
```bash
# 1. clone the repository
git clone https://github.com/tabish-5/LeetForcesVSC.git
cd LeetForcesVSC

# 2. install dependencies
npm i

# 3. package the extension
npm i -g @vscode/vsce
vsce package
# → leet-forces-1.0.0.vsix

# 4. install the .vsix into VS Code
code --install-extension leet-forces-1.0.0.vsix
```

> Published on the VS Code Marketplace as **Leet-Forces** (`Leet-Forces-0.1.1.vsix`).

### 🛠️ Development host
Press **F5** in this folder to run it inside a VS Code development host — no install needed while iterating on the source.

---

## ⚙️ Settings

| Setting | Description |
|---------|-------------|
| `cprunner.language` | Default language for both sites (12 shared) |
| `cprunner.codeforces.submitMode` | Post directly to Codeforces, or copy-to-clipboard + open submit page |

---

## ⌨️ Quick Reference

| Key | Action |
|-----|--------|
| `n` | Next problem |
| `p` | Previous problem |
| `d` | LeetCode daily challenge |

---

## 📜 Changelog

### 1.0.0
- Initial release of Leet-Forces for VS Code
- LeetCode + Codeforces support
- Local Codeforces testing, direct LeetCode submission
- Rendered description panel
- SecretStorage-backed authentication

---

## 🤝 Contributing

Pull requests welcome! Please open an issue first to discuss any substantial change.

---

## 📜 License

<details>
<summary><b>MIT License</b> — click to view</summary>

Copyright (c) 2026 CP Runner contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
</details>

---

<div align="center">

**🏁 Made with ⌨️ for competitive programmers, by a competitive programmer.**

</div>