# Opencode with my patches

## List of `patches/common`

- `001-ctrl-enter` – submit WebUI and Desktop messages by `Ctrl-Enter` instead of `Enter`
- `003-markdown-code-scrollbar` – show horizontal scrollbar in code blocks instead of hiding it
- `004-retry-overload-cap` – cap overload retry delay to 11s and treat certificate errors as retryable
- `007-unarchive-sessions` – add support for unarchiving sessions
- `008-user-message-markdown` – render user messages as markdown instead of plain pre-wrap text
- `009-timestamp-24h` – show message timestamps in 24h format with ISO-like date
- `010-timeout-continue` – auto recover session after timeout error
- `011-mcp-auto-reconnect` – auto reconnect disconnected mcp servers
- `012-mcp-status-display` – backport of MCP servers showing fix

### Retired

- `002-local-webui` – show local WebUI in `opencode web` instead of `app.opencode.ai` (already in upstream)

### Pending

- `005-server-message-id` – fix double model response on clock skew: probably fixed in upstream somehow
- `006-tmux-clipboard` – workaround of builtin copy in TUI inside tmux window: stopped using tui, probably won't update

## List of issues

- none yet

## Make release

```bash
git checkout master && git pull
git tag -fm $(git branch --sho) v1.15.13p0 && git push --force origin $(git describe)
```
