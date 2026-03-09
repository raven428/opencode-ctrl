# Opencode with my patches

## List of `patches/common`

- `ctrl-enter` – submit WebUI and Desktop messages by `Ctrl-Enter` instead of `Enter`
- `local-webui` – show local WebUI in `opencode web` instead of `app.opencode.ai`
- `tmux-clipboard` – workaround of builtin copy in TUI inside tmux window

## Make release

```bash
git checkout master && git pull
git tag -fm $(git branch --sho) v1.1.53 && git push --force origin $(git describe)
```
