# Opencode with my patches

## List of `patches/common`

- `ctrl-enter` – submit WebUI and Desktop messages by `Ctrl-Enter` instead of `Enter`
- `local-webui` – show local WebUI in `opencode web` instead of `app.opencode.ai`
- `tmux-clipboard` – workaround of builtin copy in TUI inside tmux window
- `server-message-id` – replace client message ID by server for WebUI
- `webui-message-order` – sort messages in WebUI by time created instead of ID

## Make release

```bash
git checkout master && git pull
git tag -fm $(git branch --sho) v1.2.16p4 && git push --force origin $(git describe)
```
