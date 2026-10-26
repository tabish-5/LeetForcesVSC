# 🏁 Leet-Forces for VS Code

> *LeetCode + Codeforces, unified.*

A port of the Java `CPRunner` terminal tool, rebuilt as a first-class VS Code extension. Open a folder, click the 🏁 icon in the Activity Bar, and your entire competitive-programming workflow — change, test, submit, and read — lives inside the editor.

```
┌─────────────────────────────────────────────────────┐
│  🏁 Leet-Forces                                     |
│                                                     │
│  Change ──► Test ──► Submit ──► Description         │
│                                                     │
│  LeetCode  ·  Codeforces  ·  12 shared languages    │
└─────────────────────────────────────────────────────┘
```

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

<div align="center">

**🏁 Made with ⌨️ for competitive programmers, by a competitive programmer.**

</div>