# CP Runner for VS Code (LeetCode + Codeforces)

Port of the Java `CPRunner` terminal tool. Open a folder, click the CP Runner icon in the Activity Bar.

- **Change Problem**: number / slug / URL (LeetCode) or `1900A` / URL (Codeforces). `n` / `p` = next / previous, `d` = LeetCode daily.
- **Test**: LeetCode runs on LeetCode's judge (examples + saved failed cases). Codeforces compiles and runs samples + custom tests locally (needs your compiler on PATH).
- **Submit**: LeetCode submits directly and saves failing cases. Codeforces copies code to the clipboard, opens the submit page, and tracks the verdict (or posts directly via the `cprunner.codeforces.submitMode` setting).
- **Description** opens as a rendered panel beside the editor.
- 12 languages shared by both sites: set with *Choose Language* or `cprunner.language`.
- Logins live in VS Code SecretStorage, not in the workspace. An old `.cprunner/auth.json` is imported once.

## Install
    npm i -g @vscode/vsce   # once
    vsce package            # makes cp-runner-1.0.0.vsix
    code --install-extension cp-runner-1.0.0.vsix

Or press F5 in this folder to run it in a development host.
