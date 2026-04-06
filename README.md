# MediaSort

A keyboard-driven media sorter built with Tauri 2 + vanilla JS.

## Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) 18+
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Linux**: `sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`

## Setup

```bash
# 1. Install JS dependencies
npm install

# 2. Run in development mode (hot-reload)
npm run dev

# 3. Build a distributable bundle
npm run build
```

## Architecture

```
mediasort/
├── ui/                   # Frontend — plain HTML/CSS/JS, no framework
│   ├── index.html
│   ├── style.css
│   └── app.js            # All screen logic (home / setup / sort)
├── src-tauri/
│   ├── src/
│   │   ├── main.rs       # Entry point
│   │   └── lib.rs        # All Tauri commands
│   ├── capabilities/
│   │   └── default.json  # Tauri v2 permissions
│   ├── tauri.conf.json
│   └── Cargo.toml
├── Cargo.toml            # Workspace root
└── package.json
```

## Tauri Commands (Rust → JS)

| Command | Description |
|---|---|
| `pick_folder()` | Native OS folder picker dialog |
| `scan_media(folder)` | Recursively find all media files |
| `move_file(src, dest_dir)` | Move file, handles name collisions |
| `save_project(project)` | Persist project JSON to app data dir |
| `load_project(id)` | Load a project by UUID |
| `list_projects()` | List all saved projects |
| `delete_project(id)` | Remove a project (files untouched) |

## Project JSON Format

```json
{
  "id": "uuid-v4",
  "name": "Summer 2024",
  "source_folder": "/Users/you/Photos/Summer",
  "current_index": 42,
  "destinations": [
    { "name": "Keep",  "path": "/Users/you/Keep",  "keystroke": "E" },
    { "name": "Trash", "path": "/Users/you/Trash", "keystroke": "D" }
  ],
  "media_files": ["/path/to/img1.jpg", "…"],
  "history": [["/original/path", "/moved/to/path"]]
}
```

## Keyboard Shortcuts (Sort Screen)

| Key | Action |
|---|---|
| Configured key (e.g. `E`) | Move current file to that destination |
| `←` Arrow Left | Undo last move |
| `→` Arrow Right | Skip file (no move) |

## Supported Formats

**Images:** jpg, jpeg, png, gif, webp, bmp, tiff, heic, heif, avif, svg, ico, raw, cr2, cr3, nef, arw, dng, orf, rw2  
**Video:** mp4, mov, avi, mkv, webm, m4v, flv, wmv, mpg, mpeg, 3gp  
**Audio:** mp3, m4a, wav, flac, ogg, aac