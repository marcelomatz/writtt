package adapters

import (
	"encoding/json"
	"fmt"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"
)

var errorInterfaceType = reflect.TypeOf((*error)(nil)).Elem()

// RPCInvokeRequest represents a JSON-RPC style call over the local HTTP fallback endpoint.
type RPCInvokeRequest struct {
	Method string            `json:"method"`
	Args   []json.RawMessage `json:"args"`
}

// HTTPRPCGateway exposes exported facade methods over POST /api/writtt/invoke using reflection
// (eliminating manual switch/case dispatchers) and serves local editor attachments safely.
type HTTPRPCGateway struct {
	methods   map[string]reflect.Value
	attachDir string
}

// NewHTTPRPCGateway inspects target and registers all exported RPC methods except excluded lifecycle hooks.
func NewHTTPRPCGateway(target any, attachDir string, excludedMethods ...string) *HTTPRPCGateway {
	excluded := map[string]bool{
		"Startup":          true,
		"Shutdown":         true,
		"SetWailsRuntime":  true,
		"SetEventEmitter":  true,
		"AttachHTTPRoutes": true,
	}
	for _, name := range excludedMethods {
		excluded[name] = true
	}

	methods := make(map[string]reflect.Value)
	val := reflect.ValueOf(target)
	typ := val.Type()
	for i := 0; i < typ.NumMethod(); i++ {
		m := typ.Method(i)
		if !m.IsExported() || excluded[m.Name] {
			continue
		}
		methods[m.Name] = val.Method(i)
	}

	return &HTTPRPCGateway{
		methods:   methods,
		attachDir: attachDir,
	}
}

// AttachRoutes wires /attachments/ and /api/writtt/invoke onto mux.
func (g *HTTPRPCGateway) AttachRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/attachments/", g.handleAttachment)
	mux.HandleFunc("/api/writtt/invoke", g.handleInvoke)
}

func (g *HTTPRPCGateway) handleAttachment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	rel := strings.TrimPrefix(r.URL.Path, "/attachments/")
	base := filepath.Base(filepath.Clean(rel))
	if rel == "" || base == "." || base == ".." || strings.ContainsAny(rel, `/\`) {
		http.NotFound(w, r)
		return
	}
	fullPath := filepath.Join(g.attachDir, base)
	info, err := os.Stat(fullPath)
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if strings.EqualFold(filepath.Ext(base), ".svg") {
		w.Header().Set("Content-Type", "image/svg+xml")
	} else if ct := mime.TypeByExtension(filepath.Ext(base)); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	http.ServeFile(w, r, fullPath)
}

func (g *HTTPRPCGateway) handleInvoke(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": "POST required"})
		return
	}
	var req RPCInvokeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": err.Error()})
		return
	}
	res, err := g.Invoke(req.Method, req.Args)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": err.Error()})
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"result": res})
}

// Invoke resolves and executes a registered RPC method with automatic JSON argument unmarshaling.
func (g *HTTPRPCGateway) Invoke(method string, rawArgs []json.RawMessage) (any, error) {
	short := strings.TrimSpace(method)
	if idx := strings.LastIndex(short, "."); idx != -1 {
		short = short[idx+1:]
	}
	fn, ok := g.methods[short]
	if !ok {
		return nil, fmt.Errorf("unknown RPC method: %s", method)
	}

	fnType := fn.Type()
	numIn := fnType.NumIn()
	callArgs := make([]reflect.Value, numIn)
	for i := 0; i < numIn; i++ {
		paramType := fnType.In(i)
		if i < len(rawArgs) && len(rawArgs[i]) > 0 && string(rawArgs[i]) != "null" {
			ptr := reflect.New(paramType)
			if err := json.Unmarshal(rawArgs[i], ptr.Interface()); err != nil {
				return nil, fmt.Errorf("invalid argument %d for %s: %w", i, short, err)
			}
			callArgs[i] = ptr.Elem()
		} else {
			callArgs[i] = reflect.Zero(paramType)
		}
	}

	outs := fn.Call(callArgs)
	switch len(outs) {
	case 0:
		return true, nil
	case 1:
		if fnType.Out(0).Implements(errorInterfaceType) {
			if !outs[0].IsNil() {
				return nil, outs[0].Interface().(error)
			}
			return nil, nil
		}
		return outs[0].Interface(), nil
	case 2:
		if fnType.Out(1).Implements(errorInterfaceType) && !outs[1].IsNil() {
			return nil, outs[1].Interface().(error)
		}
		return outs[0].Interface(), nil
	default:
		return outs[0].Interface(), nil
	}
}
