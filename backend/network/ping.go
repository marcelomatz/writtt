package network

import (
	"net"
	"time"
)

// ScanLocalAI checks if Ollama (or compatible API) is running locally
func ScanLocalAI() bool {
	// standard Ollama port
	address := "127.0.0.1:11434"

	conn, err := net.DialTimeout("tcp", address, 1*time.Second)
	if err != nil {
		return false
	}
	if conn != nil {
		defer conn.Close()
		return true
	}
	return false
}
