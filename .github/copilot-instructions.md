# Nogonad Photo Organizer - AI Coding Instructions

## Project Overview
Local-first photo viewer/organizer built with Next.js 16, focusing on HDR rendering and EXIF metadata transparency. Runs entirely on the user's local machine with no cloud dependencies.

**⚠️ Built entirely with vibe coding** - prioritize working solutions over perfect architecture.

## Critical Architecture Patterns

### File System Access Pattern
- Uses **local Windows file paths** (e.g., `C:\Users\Photos` or UNC `\\server\share`)
- User enters paths via input, NOT file picker API (for direct directory access)
- Thumbnails stored in `{folder}/${NPO_FOLDER}/${THUMBNAILS_FOLDER}/` subdirectory
- Config constants in [config.ts](../config.ts)

### API Routes Design
All API routes in `app/api/*/route.ts` are POST-based and handle server-side file operations:

1. **[app/api/image/route.ts](../app/api/image/route.ts)**: 
   - `action: 'start'` → initiates thumbnail generation, returns image count
   - `action: 'progress'` → polls generation progress (500ms interval)
   - Uses in-memory `progressStore` Map for cross-request state tracking
   - Background processing via `setTimeout(() => { watcher.start(); watcher.stop() }, 0)`

2. **[app/api/exif/route.ts](../app/api/exif/route.ts)**:
   - Requires `folderPath` + `fileName` (NOT full path)
   - Calls `exiftool` CLI via [controllers/exiftool.ts](../controllers/exiftool.ts)
   - Returns parsed JSON EXIF data or 500 error

### External Dependencies

#### exiftool (REQUIRED)
- Must be in system PATH
- Called via `child_process.spawn('exiftool', ['-json', '-n', imagePath])`
- Flags: `-json` (output), `-n` (numeric values for programmatic parsing)
- See [controllers/exiftool.ts](../controllers/exiftool.ts) for implementation

#### Image Processing
- **sharp** library for thumbnail generation (240px width, aspect-preserved)
- **chokidar** for file watching (disabled during thumbnail batch processing)
- Supported formats: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`

### Controller Layer Pattern
Controllers in `controllers/` handle business logic:

- **[ImageWatcher](../controllers/image-processor.ts)**: File watcher class with lifecycle methods
  - `start()` → processes existing images + watches for changes
  - `stop()` → closes watcher
  - Ignores files in `_npo/thumbs/` folder
  - Uses `awaitWriteFinish` (2s stability) to prevent processing partial writes
  - Event handlers: `onThumbnailCreated`, `onThumbnailDeleted`, `onError`

- **[exiftool.ts](../controllers/exiftool.ts)**: Wrapper for exiftool CLI
  - `runExifTool(imagePath)` → returns raw JSON string
  - `getExifJson(imagePath)` → returns parsed object
  - Rejects if `exiftool` exits with non-zero code

## Frontend Patterns

### State Management (No External Library)
Single page component ([app/page.tsx](../app/page.tsx)) manages all state with React hooks:
- `imageFiles: ImageData[]` → current folder's images + thumbnail paths
- `activeIndex` → currently displayed image (arrow key navigation)
- `isProcessing` + `progress` → thumbnail generation UI
- `pathHistory` → localStorage-persisted recent paths (max 20)

### EXIF Display Logic
Extensive formatting functions in [app/page.tsx](../app/page.tsx):
- `formatAperture()`, `formatExposureTime()`, `formatISO()` → camera settings
- `formatDate()` → converts EXIF "YYYY:MM:DD HH:MM:SS" to localized display
- `formatFlash()` → interprets numeric bitfield (`v & 0x1`)
- `isHDR()` → detects HDR via `DirectoryItemSemantic` array or `HDREditMode`
- All formatters return `null` for missing data (graceful degradation)

### Image Path Construction
```typescript
thumbnailPath: `/api/image?folderPath=${encodeURIComponent(thumbFolder)}&fileName=${encodeURIComponent(thumbName)}`
originalPath: `/api/image?folderPath=${encodeURIComponent(folder)}&fileName=${encodeURIComponent(name)}`
```
Note: GET endpoint for serving images is handled by Next.js implicit file serving.

## Development Workflow

### Running the App
```bash
npm run dev      # Development server (port 3000)
npm run build    # Production build
npm run start    # Production server
npm run lint     # ESLint check
```

### Prerequisites Checklist
- Node.js 22.x+
- **exiftool in PATH** (verify with `exiftool -ver`)
- Windows environment (file path handling assumes Windows)

### Testing Locally
1. Use a folder with actual photos (not the `_npo/thumbs` folder)
2. First load generates thumbnails → progress bar UI
3. Subsequent loads use cached thumbnails → instant display
4. Test keyboard navigation (← →) and EXIF panel toggle

## TypeScript Configuration
- Path alias: `@/*` maps to project root (see [tsconfig.json](../tsconfig.json))
- Strict mode enabled
- Import examples: `import CONFIG from '@/config'`, `import ImageWatcher from '@/controllers/image-processor'`

## Common Pitfalls
1. **exiftool not found**: Ensure `exiftool` is in system PATH, not just in project
2. **Thumbnail path issues**: Always join paths server-side and encode URI components client-side
3. **Progress polling**: Remember to clear intervals and set safety timeouts (60s in code)
4. **EXIF null handling**: Always check for null/undefined before formatting (use `?.` and `??`)
5. **File watching**: Disable watcher after batch processing to avoid double-processing

## HDR Support
- Modern browser engines render HDR images natively via `<img>` tags
- EXIF detection: Check `DirectoryItemSemantic` array for "gainmap" or `HDREditMode === 1`
- Display indicated in color profile section: "X bits/channel - HDR"
