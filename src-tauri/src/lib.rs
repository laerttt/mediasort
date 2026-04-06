use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

// ── Data Models ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Destination {
    pub name: String,
    pub path: String,
    pub keystroke: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub source_folder: String,
    pub current_index: usize,
    pub destinations: Vec<Destination>,
    pub media_files: Vec<String>,
    pub history: Vec<(String, String, usize)>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn projects_dir() -> PathBuf {
    let base = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("mediasort").join("projects")
}

fn is_media(path: &Path) -> bool {
    let exts = [
        "jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "heic", "heif", "avif",
        "svg", "ico", "mp4", "mov", "avi", "mkv", "webm", "m4v", "flv", "wmv", "mpg", "mpeg",
        "3gp", "mp3", "m4a", "wav", "flac", "ogg", "aac", "raw", "cr2", "cr3", "nef", "arw",
        "dng", "orf", "rw2",
    ];
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| exts.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

// ── Tauri Commands ────────────────────────────────────────────────────────────

#[tauri::command]
async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_folder(move |p| {
        let _ = tx.send(p.map(|fp| fp.to_string()));
    });
    Ok(rx.recv().unwrap_or(None))
}

#[tauri::command]
fn scan_media(folder: String) -> Result<Vec<String>, String> {
    let mut files: Vec<String> = WalkDir::new(&folder)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file() && is_media(e.path()))
        .map(|e| e.path().to_string_lossy().to_string())
        .collect();
    files.sort();
    Ok(files)
}

#[tauri::command]
fn move_file(src: String, dest_dir: String) -> Result<String, String> {
    let src_path = Path::new(&src);
    let filename = src_path.file_name().ok_or("Invalid source path")?;
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let dest_path = resolve_collision(Path::new(&dest_dir).join(filename));
    fs::rename(&src_path, &dest_path).map_err(|e| e.to_string())?;
    Ok(dest_path.to_string_lossy().to_string())
}

fn resolve_collision(mut path: PathBuf) -> PathBuf {
    if !path.exists() { return path; }
    let stem = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
    let ext = path.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    let parent = path.parent().unwrap().to_path_buf();
    let mut i = 1u32;
    loop {
        path = parent.join(format!("{}_{}{}", stem, i, ext));
        if !path.exists() { return path; }
        i += 1;
    }
}

#[tauri::command]
fn save_project(project: Project) -> Result<(), String> {
    let dir = projects_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(&project).map_err(|e| e.to_string())?;
    fs::write(dir.join(format!("{}.json", project.id)), json).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_project(id: String) -> Result<Project, String> {
    let json = fs::read_to_string(projects_dir().join(format!("{}.json", id)))
        .map_err(|e| e.to_string())?;
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_projects() -> Result<Vec<Project>, String> {
    let dir = projects_dir();
    if !dir.exists() { return Ok(vec![]); }
    let mut projects = vec![];
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.path().extension().and_then(|e| e.to_str()) == Some("json") {
            let json = fs::read_to_string(entry.path()).map_err(|e| e.to_string())?;
            if let Ok(p) = serde_json::from_str::<Project>(&json) {
                projects.push(p);
            }
        }
    }
    projects.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(projects)
}

#[tauri::command]
fn delete_project(id: String) -> Result<(), String> {
    let file = projects_dir().join(format!("{}.json", id));
    if file.exists() { fs::remove_file(file).map_err(|e| e.to_string())?; }
    Ok(())
}

// ── App Entry ─────────────────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            pick_folder,
            scan_media,
            move_file,
            save_project,
            load_project,
            list_projects,
            delete_project,
        ])
        .run(tauri::generate_context!())
        .expect("error running mediasort");
}