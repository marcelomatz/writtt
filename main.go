package main

import (
	"embed"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"writtt/backend/storage"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

type FileLoader struct {
	frontendAssets http.FileSystem
}

func NewFileLoader(assetsFs embed.FS) *FileLoader {
	return &FileLoader{
		frontendAssets: http.FS(assetsFs),
	}
}

// ServeHTTP intercepts requests for "/attachments/" and serves local files
func (h *FileLoader) ServeHTTP(res http.ResponseWriter, req *http.Request) {
	if strings.HasPrefix(req.URL.Path, "/attachments/") {
		// req.URL.Path is already URL-decoded by net/http, so spaces and
		// other encoded chars are already resolved. Use it directly.
		filename := strings.TrimPrefix(req.URL.Path, "/attachments/")
		path := filepath.Join(storage.GetAppDir(), "attachments", filename)

		// Security: resolve the canonical path and verify it stays inside
		// the attachments directory (defends against path traversal).
		attachDir := filepath.Clean(filepath.Join(storage.GetAppDir(), "attachments"))
		resolvedPath := filepath.Clean(path)
		if !strings.HasPrefix(resolvedPath, attachDir+string(filepath.Separator)) {
			res.WriteHeader(http.StatusBadRequest)
			res.Write([]byte("Bad Request"))
			return
		}

		data, err := os.ReadFile(path)
		if err != nil {
			res.WriteHeader(http.StatusNotFound)
			res.Write([]byte("Not Found"))
			return
		}

		// Set content type based on extension
		ext := filepath.Ext(filename)
		mimeType := "application/octet-stream" // Default
		switch strings.ToLower(ext) {
		case ".jpg", ".jpeg":
			mimeType = "image/jpeg"
		case ".png":
			mimeType = "image/png"
		case ".gif":
			mimeType = "image/gif"
		case ".svg":
			mimeType = "image/svg+xml"
		case ".pdf":
			mimeType = "application/pdf"
		}

		res.Header().Set("Content-Type", mimeType)
		res.Write(data)
		return
	}
	// Fallback to serving embedded frontend assets
	http.FileServer(h.frontendAssets).ServeHTTP(res, req)
}

func main() {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:     "Writtt",
		Width:     1500,
		Height:    850,
		Frameless: true,
		AssetServer: &assetserver.Options{
			Assets:  assets,
			Handler: NewFileLoader(assets),
		},
		BackgroundColour: &options.RGBA{R: 0, G: 0, B: 0, A: 0}, // Transparent background to allow glassmorphism
		Mac: &mac.Options{
			WebviewIsTransparent: true,
			WindowIsTranslucent:  true,
		},
		Windows: &windows.Options{
			WebviewIsTransparent:              true,
			WindowIsTranslucent:               true,
			BackdropType:                      windows.Mica,
			DisableFramelessWindowDecorations: false,
		},
		OnStartup: app.startup,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
