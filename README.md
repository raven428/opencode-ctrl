# Opencode with my patches

## List of `patches/common`

- `ctrl-enter` – submit WebUI and Desktop messages by `Ctrl-Enter` instead of `Enter`
- `local-webui` – show local WebUI in `opencode web` instead of `app.opencode.ai`
- `markdown-code-scrollbar` – show horizontal scrollbar in code blocks instead of hiding it
- `retry-overload-cap` – cap overload retry delay to 11s and treat certificate errors as retryable
- `server-message-id` – fix double model response on clock skew (parentID-based loop exit)
- `tmux-clipboard` – workaround of builtin copy in TUI inside tmux window
- `unarchive-sessions` – add support for unarchiving sessions
- `user-message-markdown` – render user messages as markdown instead of plain pre-wrap text
- `timestamp-24h` – show message timestamps in 24h format with ISO-like date

## List of issues

- version `1.2.20` patches broke tui: won't intercept terminal, able to stop only with multiple ctrl-c
- webUI from separate host message sorting: fixed by `server-message-id` time-based insert in event-reducer

## Make release

```bash
git checkout master && git pull
git tag -fm $(git branch --sho) v1.2.16p8 && git push --force origin $(git describe)
```
