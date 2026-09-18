# Opencode with my patches

## List of `patches/common`

- `001-ctrl-enter` – submit WebUI and Desktop messages by `Ctrl-Enter` instead of `Enter`
- `003-markdown-code-scrollbar` – show horizontal scrollbar in code blocks instead of hiding it
- `004-retry-overload-cap` – cap overload retry delay to 11s and treat certificate errors as retryable
- `007-unarchive-sessions` – add support for unarchiving sessions
- `008-user-message-markdown` – render user messages as markdown instead of plain pre-wrap text
- `009-timestamp-24h` – show message timestamps in 24h format with ISO-like date
- `010-infinite-retry-with-context` – auto recover session after timeout error
- `011-mcp-auto-reconnect` – auto reconnect disconnected mcp servers
- `012-mcp-status-display` – backport of MCP servers showing fix

### Retired

- `002-local-webui` – show local WebUI in `opencode web` instead of `app.opencode.ai` (already in upstream)

### Pending

- `005-server-message-id` – fix double model response on clock skew: probably fixed in upstream somehow
- `006-tmux-clipboard` – workaround of builtin copy in TUI inside tmux window: stopped using tui, probably won't update

## List of `patches/_pi-web/patches`

- `001-prompt-send-chord` – new "Ctrl+Enter sends message" Enter-key preference: Enter/Shift+Enter always insert a line break, Ctrl+Enter (⌘+Enter on macOS) sends
- `002-chat-card-disclosure` – configurable disclosure (`none`/`live`/`last`/`all`) for thinking, skill, and tool-result/details/diff transcript cards
  - `ui.disclosure.thinking` – `"none"` (default) | `"live"` | `"last"` | `"all"`
  - `ui.disclosure.skillInvocation` – `"none"` (default) | `"live"` | `"last"` | `"all"`
  - `ui.disclosure.toolResult` – `"none"` (default) | `"live"` | `"last"` | `"all"`
  - `ui.disclosure.toolDetails` – `"none"` (default) | `"live"` | `"last"` | `"all"`
  - `ui.disclosure.toolDiff` – `"none"` | `"live"` | `"last"` | `"all"` (default)
- `003-events-group-disclosure` – configurable disclosure (`live`/`last`/`all`) for the summarizing events group card, without auto-collapsing it after work finishes
  - `ui.disclosure.eventsGroup` – `"live"` (default) | `"last"` | `"all"` (`"none"` is not accepted)

```json
{
  "ui": {
    "disclosure": {
      "thinking": "all",
      "skillInvocation": "none",
      "toolResult": "last",
      "toolDetails": "none",
      "toolDiff": "all",
      "eventsGroup": "last"
    }
  }
}
```

- `004-panel-collapse-persistence` – persist navigation/workspace panel collapsed state across tab reloads
- `005-function-key-shortcuts` – allow lone function keys (`F1`-`F24`) as shortcut activators, not just Ctrl/Cmd/Alt chords

## List of issues

- none yet

## Make release

```bash
git checkout master && git pull
git tag -fm $(git branch --sho) v1.15.13p1 && git push --force origin $(git describe)
```
