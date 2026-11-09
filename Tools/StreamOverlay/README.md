# Stream Overlay - D2BotNG console on stream

`console-overlay.html` shows D2BotNG's console like a stream chat box: a red "BOT CONSOLE" panel, one line per message, each bot's name in its own colour, newest at the bottom. It reads the console live from D2BotNG on this PC (the same feed D2BotNG's own window uses). Nothing is sent anywhere.

## Add it in Streamlabs (or OBS)

1. Start D2BotNG.
2. **+** (Add Source) > **Browser Source** > Add Source.
3. Tick **Local file** and pick `console-overlay.html` (this folder).
4. **Width 480, Height 600** (any size works; for a different spot, match its shape).
5. Done. Drag it where you want it. The little BOT light glows red while it's connected.

If D2BotNG isn't running it says "Waiting for D2BotNG..." and connects by itself when it starts.

## Change the look

Open `console-overlay.html` in Notepad. The **SETTINGS** block at the top explains every option:

| Setting | Default | What it does |
|---|---|---|
| `theme` | `"panel"` | `"panel"` red panel with a title, `"chat"` just outlined text, `"box"` each line on a dark box |
| `title` | `"BOT CONSOLE"` | Panel title (`""` = no title bar) |
| `size` | `16` | Text size |
| `max` | `16` | Most lines at once (fewer if they don't fit) |
| `fade` | `0` | Seconds before a line fades out like chat (`0` = stays) |
| `profiles` | `""` | Only these bots, e.g. `"SCL-PAL,SCL-SORC"` |
| `names` | `""` | Nicer names on stream, e.g. `"SCL-PAL:Paladin,SCL-SORC:Sorceress"` |
| `system` / `party` | `true` | Show D2BotNG's own messages / party mode's `[Party]` lines |
| `time` | `false` | Time in front of each line |
| `hide` | accounts, keys, proxies... | Lines matching this are never shown |
| `server` / `password` | `127.0.0.1:5000` | Only if you changed D2BotNG's server settings |

After saving, right-click the source in Streamlabs > **Refresh**.

You can also add settings to the address instead of editing the file: untick **Local file** and use `file:///C:/path/to/console-overlay.html?size=18&fade=60`.

**Preview without bots:** open the file in Chrome with `?demo=1` on the end.

## Privacy

Lines with accounts, passwords, CD keys, key names, realm-down keys, proxies and muling are hidden by default (`hide`). Check the overlay once before you go live, and add anything else you don't want shown to `hide`.
