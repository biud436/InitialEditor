## First launch (unsigned app)

The app is not signed or notarized yet, so your OS blocks it the first time you open it. You can verify the downloads with `SHA256SUMS.txt`.

- **macOS** (Apple Silicon): open the dmg and move InitialEditor to Applications. If the first launch is blocked, click "Open Anyway" in System Settings > Privacy & Security, or run `xattr -dr com.apple.quarantine /Applications/InitialEditor.app` in Terminal.
- **Windows**: SmartScreen blocks the installer. Click "More info", then "Run anyway". The Windows build has no engine executable, so F5 runs the game in the game tab (web engine).
- **Linux**: make the AppImage executable with `chmod +x InitialEditor_*.AppImage`, then run it (requires FUSE 2). Install the deb with `sudo apt install ./InitialEditor_*.deb`.
