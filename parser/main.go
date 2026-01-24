package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
)

type healthResponse struct {
	Status string `json:"status"`
	Time   string `json:"time"`
}

type errorResponse struct {
	Error string `json:"error"`
}

type parseResponse struct {
	FileName string `json:"fileName"`
	FileSize int64  `json:"fileSize"`
	Message  string `json:"message"`
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/parse", handleParse)

	server := &http.Server{
		Addr:              ":8081",
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Println("Librium parser service listening on :8081")
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server failed: %v", err)
	}
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, healthResponse{
		Status: "ok",
		Time:   time.Now().UTC().Format(time.RFC3339),
	})
}

func handleParse(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, errorResponse{
			Error: "method not allowed",
		})
		return
	}

	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{
			Error: "invalid multipart form",
		})
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{
			Error: "missing file",
		})
		return
	}
	defer file.Close()

	size := header.Size
	writeJSON(w, http.StatusOK, parseResponse{
		FileName: header.Filename,
		FileSize: size,
		Message:  "parser stub - no content extracted yet",
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
