package main

import (
	"context"
	"embed"
	"log"
	"net/http"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	appService := NewApp()
	appService.Startup(context.Background())

	apiMux := http.NewServeMux()
	appService.AttachHTTPRoutes(apiMux)
	assetHandler := application.AssetFileServerFS(assets)

	wailsApp := application.New(application.Options{
		Name:        "Writtt",
		Description: "Local-first distraction-free Editorial Studio & Zero-Knowledge Cryptographic Vault",
		Services: []application.Service{
			application.NewService(appService),
		},
		Assets: application.AssetOptions{
			Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if strings.HasPrefix(r.URL.Path, "/api/writtt/") || strings.HasPrefix(r.URL.Path, "/attachments/") {
					apiMux.ServeHTTP(w, r)
					return
				}
				assetHandler.ServeHTTP(w, r)
			}),
		},
		OnShutdown: func() {
			appService.Shutdown()
		},
	})

	appService.SetEventEmitter(func(name string, data any) {
		wailsApp.Event.Emit(name, data)
	})

	mainWin := wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "Writtt - Editorial Studio & Zero-Knowledge Vault",
		Width:            1440,
		Height:           900,
		MinWidth:         880,
		MinHeight:        580,
		Frameless:        true,
		BackgroundColour: application.NewRGBA(9, 9, 11, 255),
		Windows: application.WindowsWindow{
			NonClientRegionSupport: true,
		},
		URL: "/",
	})

	appService.SetWailsRuntime(wailsApp, mainWin)

	if err := wailsApp.Run(); err != nil {
		log.Fatal(err)
	}
}
