package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	spine "github.com/ABFCode/Spine"
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
	Sections []sectionPayload `json:"sections"`
	Chunks   []chunkPayload `json:"chunks"`
	Metadata metadataPayload `json:"metadata"`
	Warnings []warningPayload `json:"warnings"`
}

type sectionPayload struct {
	Title      string `json:"title"`
	OrderIndex int    `json:"orderIndex"`
}

type chunkPayload struct {
	SectionOrderIndex int    `json:"sectionOrderIndex"`
	ChunkIndex        int    `json:"chunkIndex"`
	StartOffset       int    `json:"startOffset"`
	EndOffset         int    `json:"endOffset"`
	WordCount         int    `json:"wordCount"`
	Content           string `json:"content"`
}

type metadataPayload struct {
	Title    string   `json:"title"`
	Authors  []string `json:"authors"`
	Language string   `json:"language"`
}

type warningPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Path    string `json:"path"`
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
	temp, err := os.CreateTemp("", "librium-*.epub")
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{
			Error: "failed to create temp file",
		})
		return
	}
	defer func() {
		_ = temp.Close()
		_ = os.Remove(temp.Name())
	}()

	if _, err := io.Copy(temp, file); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{
			Error: "failed to buffer epub",
		})
		return
	}

	cfg := spine.DefaultConfig()
	cfg.Strict = false
	cfg.Fallbacks.GenerateTOC = true
	cfg.Chunking = spine.ChunkingOptions{Mode: spine.ChunkByParagraph}
	parser := spine.NewParser(cfg)
	book, parseErr := parser.ParseFile(temp.Name())
	if book == nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{
			Error: "failed to parse epub",
		})
		return
	}
	defer book.Close()

	sectionsInfo := buildSections(book)
	chunks := buildChunkPayloads(book, sectionsInfo)
	sections := make([]sectionPayload, 0, len(sectionsInfo))
	for _, section := range sectionsInfo {
		sections = append(sections, sectionPayload{
			Title:      section.Title,
			OrderIndex: section.OrderIndex,
		})
	}

	message := "parsed"
	if parseErr != nil {
		message = "parsed with warnings: " + parseErr.Error()
	}
	writeJSON(w, http.StatusOK, parseResponse{
		FileName: header.Filename,
		FileSize: size,
		Message:  message,
		Sections: sections,
		Chunks:   chunks,
		Metadata: metadataPayload{
			Title:    book.Metadata.Title,
			Authors:  book.Metadata.Authors,
			Language: book.Metadata.Language,
		},
		Warnings: mapWarnings(book.Warnings),
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

type sectionInfo struct {
	Title      string
	OrderIndex int
	AnchorHref string
}

type sectionAnchor struct {
	SectionIndex int
	ChunkIndex   int
}

func buildSections(book *spine.Book) []sectionInfo {
	if book == nil {
		return nil
	}
	sections := []sectionInfo{}
	if len(book.TOC) > 0 {
		flattenTOC(book.TOC, &sections)
	}
	if len(sections) == 0 {
		for i, item := range book.Spine {
			label := item.Href
			if label == "" {
				label = "Section " + itoa(i+1)
			}
			sections = append(sections, sectionInfo{
				Title:      label,
				OrderIndex: i,
				AnchorHref: item.Href,
			})
		}
	}
	for i := range sections {
		sections[i].OrderIndex = i
		if sections[i].Title == "" {
			sections[i].Title = "Section " + itoa(i+1)
		}
	}
	return sections
}

func flattenTOC(items []spine.TOCItem, out *[]sectionInfo) {
	for _, item := range items {
		href := item.Href
		if href == "" && item.Target != nil {
			href = item.Target.Href
		}
		*out = append(*out, sectionInfo{
			Title:      item.Label,
			OrderIndex: len(*out),
			AnchorHref: href,
		})
		if len(item.Children) > 0 {
			flattenTOC(item.Children, out)
		}
	}
}

func buildChunkPayloads(book *spine.Book, sections []sectionInfo) []chunkPayload {
	if book == nil {
		return nil
	}
	chunks, err := book.Chunks(spine.ChunkingOptions{Mode: spine.ChunkByParagraph})
	if err != nil {
		return nil
	}
	if len(sections) == 0 {
		sections = []sectionInfo{{Title: "Section 1", OrderIndex: 0}}
	}

	chunkIndexByID := map[string]int{}
	for i, chunk := range chunks {
		chunkIndexByID[chunk.ID] = i
	}

	anchors := buildSectionAnchors(book, sections, chunkIndexByID)

	chunkCounters := map[int]int{}
	payloads := make([]chunkPayload, 0, len(chunks))
	for i, chunk := range chunks {
		sectionIndex := resolveSectionIndex(i, anchors)
		chunkIndex := chunkCounters[sectionIndex]
		chunkCounters[sectionIndex] = chunkIndex + 1
		payloads = append(payloads, chunkPayload{
			SectionOrderIndex: sectionIndex,
			ChunkIndex:        chunkIndex,
			StartOffset:       chunk.StartOffset,
			EndOffset:         chunk.EndOffset,
			WordCount:         countWords(chunk.Text),
			Content:           chunk.Text,
		})
	}
	return payloads
}

func buildSectionAnchors(book *spine.Book, sections []sectionInfo, chunkIndexByID map[string]int) []sectionAnchor {
	if book == nil {
		return nil
	}
	anchors := make([]sectionAnchor, 0, len(sections))
	for _, section := range sections {
		if section.AnchorHref == "" {
			continue
		}
		ref, ok := book.ResolveAnchor(section.AnchorHref)
		if !ok {
			continue
		}
		chunkIdx, ok := chunkIndexByID[ref.ChunkID]
		if !ok {
			continue
		}
		anchors = append(anchors, sectionAnchor{
			SectionIndex: section.OrderIndex,
			ChunkIndex:   chunkIdx,
		})
	}
	if len(anchors) == 0 && len(sections) > 0 {
		anchors = append(anchors, sectionAnchor{SectionIndex: 0, ChunkIndex: 0})
	}
	return anchors
}

func resolveSectionIndex(chunkIndex int, anchors []sectionAnchor) int {
	if len(anchors) == 0 {
		return 0
	}
	best := anchors[0].SectionIndex
	bestChunk := anchors[0].ChunkIndex
	for _, anchor := range anchors {
		if anchor.ChunkIndex <= chunkIndex && anchor.ChunkIndex >= bestChunk {
			best = anchor.SectionIndex
			bestChunk = anchor.ChunkIndex
		}
	}
	return best
}

func mapWarnings(warnings []spine.Warning) []warningPayload {
	if len(warnings) == 0 {
		return nil
	}
	out := make([]warningPayload, 0, len(warnings))
	for _, warning := range warnings {
		out = append(out, warningPayload{
			Code:    warning.Code,
			Message: warning.Message,
			Path:    warning.Path,
		})
	}
	return out
}

func countWords(text string) int {
	count := 0
	inWord := false
	for _, r := range text {
		if r == ' ' || r == '\n' || r == '\t' || r == '\r' {
			if inWord {
				inWord = false
			}
			continue
		}
		if !inWord {
			count++
			inWord = true
		}
	}
	return count
}

func itoa(value int) string {
	if value == 0 {
		return "0"
	}
	buf := make([]byte, 0, 12)
	for value > 0 {
		digit := value % 10
		buf = append(buf, byte('0'+digit))
		value /= 10
	}
	for i, j := 0, len(buf)-1; i < j; i, j = i+1, j-1 {
		buf[i], buf[j] = buf[j], buf[i]
	}
	return string(buf)
}
