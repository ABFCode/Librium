package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log"
	"mime"
	"net/http"
	"os"
	"path"
	"sort"
	"strings"
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
	SectionBlocks []sectionBlocksPayload `json:"sectionBlocks,omitempty"`
	Metadata metadataPayload `json:"metadata"`
	Warnings []warningPayload `json:"warnings"`
	Cover    *coverPayload `json:"cover,omitempty"`
	Images   []imagePayload `json:"images,omitempty"`
}

type sectionPayload struct {
	Title      string `json:"title"`
	OrderIndex int    `json:"orderIndex"`
	Depth      int    `json:"depth"`
	ParentOrderIndex *int   `json:"parentOrderIndex,omitempty"`
	Href       string `json:"href,omitempty"`
	Anchor     string `json:"anchor,omitempty"`
}

type chunkPayload struct {
	SectionOrderIndex int    `json:"sectionOrderIndex"`
	ChunkIndex        int    `json:"chunkIndex"`
	StartOffset       int    `json:"startOffset"`
	EndOffset         int    `json:"endOffset"`
	WordCount         int    `json:"wordCount"`
	Content           string `json:"content"`
}

type sectionBlocksPayload struct {
	SectionOrderIndex int `json:"sectionOrderIndex"`
	Blocks            []blockPayload `json:"blocks"`
}

type blockPayload struct {
	Kind      string `json:"kind"`
	Level     int    `json:"level,omitempty"`
	Ordered   bool   `json:"ordered,omitempty"`
	ListIndex int    `json:"listIndex,omitempty"`
	Inlines   []inlinePayload `json:"inlines,omitempty"`
	Table     *tablePayload `json:"table,omitempty"`
	Figure    *figurePayload `json:"figure,omitempty"`
	Anchors   []string `json:"anchors,omitempty"`
}

type inlinePayload struct {
	Kind   string `json:"kind"`
	Text   string `json:"text,omitempty"`
	Href   string `json:"href,omitempty"`
	Src    string `json:"src,omitempty"`
	Alt    string `json:"alt,omitempty"`
	Width  int    `json:"width,omitempty"`
	Height int    `json:"height,omitempty"`
	Emph   bool   `json:"emph,omitempty"`
	Strong bool   `json:"strong,omitempty"`
}

type tablePayload struct {
	Rows []tableRowPayload `json:"rows"`
}

type tableRowPayload struct {
	Cells []tableCellPayload `json:"cells"`
}

type tableCellPayload struct {
	Inlines []inlinePayload `json:"inlines"`
	Header  bool            `json:"header,omitempty"`
}

type figurePayload struct {
	Images  []inlinePayload `json:"images"`
	Caption []inlinePayload `json:"caption"`
}

type metadataPayload struct {
	Title    string   `json:"title"`
	Authors  []string `json:"authors"`
	Language string   `json:"language"`
	Publisher string  `json:"publisher"`
	PublishedAt string `json:"publishedAt"`
	Series string `json:"series"`
	SeriesIndex string `json:"seriesIndex"`
	Subjects []string `json:"subjects"`
	Identifiers []identifierPayload `json:"identifiers"`
}

type warningPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Path    string `json:"path"`
}

type coverPayload struct {
	ContentType string `json:"contentType"`
	Data        string `json:"data"`
}

type imagePayload struct {
	Href        string `json:"href"`
	ContentType string `json:"contentType,omitempty"`
	Data        string `json:"data"`
	Width       int    `json:"width,omitempty"`
	Height      int    `json:"height,omitempty"`
}

type identifierPayload struct {
	ID     string `json:"id"`
	Scheme string `json:"scheme"`
	Value  string `json:"value"`
	Type   string `json:"type"`
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
	cfg.Chunking = spine.ChunkingOptions{Mode: spine.ChunkBySize, MaxChars: 2000}
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
	chunks := buildChunkPayloads(book, sectionsInfo, cfg.Chunking)
	sectionBlocks, images := buildSectionBlocks(book, sectionsInfo)
	sections := make([]sectionPayload, 0, len(sectionsInfo))
	for _, section := range sectionsInfo {
		sections = append(sections, sectionPayload{
			Title:      section.Title,
			OrderIndex: section.OrderIndex,
			Depth:      section.Depth,
			ParentOrderIndex: section.ParentOrderIndex,
			Href:       section.Href,
			Anchor:     section.Anchor,
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
		SectionBlocks: sectionBlocks,
		Metadata: buildMetadata(book.Metadata),
		Warnings: mapWarnings(book.Warnings),
		Cover:    buildCover(book),
		Images:   images,
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
	Depth      int
	ParentOrderIndex *int
	Href       string
	Anchor     string
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
		flattenTOC(book.TOC, &sections, 0, nil)
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
				Depth:      0,
				Href:       item.Href,
			})
		}
	}
	for i := range sections {
		sections[i].OrderIndex = i
		if sections[i].Title == "" {
			sections[i].Title = "Section " + itoa(i+1)
		}
		if sections[i].AnchorHref != "" {
			href, anchor := splitHrefAnchor(sections[i].AnchorHref)
			sections[i].Href = href
			sections[i].Anchor = anchor
		}
	}
	return sections
}

func splitHrefAnchor(href string) (string, string) {
	if href == "" {
		return "", ""
	}
	for i := 0; i < len(href); i++ {
		if href[i] == '#' {
			if i+1 < len(href) {
				return href[:i], href[i+1:]
			}
			return href[:i], ""
		}
	}
	return href, ""
}

func flattenTOC(items []spine.TOCItem, out *[]sectionInfo, depth int, parentOrderIndex *int) {
	for _, item := range items {
		href := item.Href
		if href == "" && item.Target != nil {
			href = item.Target.Href
		}
		hrefOnly, anchor := splitHrefAnchor(href)
		*out = append(*out, sectionInfo{
			Title:      item.Label,
			OrderIndex: len(*out),
			AnchorHref: href,
			Depth:      depth,
			ParentOrderIndex: parentOrderIndex,
			Href:       hrefOnly,
			Anchor:     anchor,
		})
		if len(item.Children) > 0 {
			currentIndex := len(*out) - 1
			parentIndex := currentIndex
			flattenTOC(item.Children, out, depth+1, &parentIndex)
		}
	}
}

func buildChunkPayloads(book *spine.Book, sections []sectionInfo, opts spine.ChunkingOptions) []chunkPayload {
	if book == nil {
		return nil
	}
	chunks, err := book.Chunks(opts)
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

func buildMetadata(meta spine.Metadata) metadataPayload {
	subjects := make([]string, 0, len(meta.Subjects))
	for _, subject := range meta.Subjects {
		if subject.Value != "" {
			subjects = append(subjects, subject.Value)
		}
	}
	identifiers := make([]identifierPayload, 0, len(meta.Identifiers))
	for _, ident := range meta.Identifiers {
		identifiers = append(identifiers, identifierPayload{
			ID:     ident.ID,
			Scheme: ident.Scheme,
			Value:  ident.Value,
			Type:   ident.Type,
		})
	}
	return metadataPayload{
		Title:       meta.Title,
		Authors:     meta.Authors,
		Language:    meta.Language,
		Publisher:   meta.Publisher,
		PublishedAt: meta.PubDate,
		Series:      meta.Series,
		SeriesIndex: meta.SeriesIndex,
		Subjects:    subjects,
		Identifiers: identifiers,
	}
}

func buildCover(book *spine.Book) *coverPayload {
	if book == nil {
		return nil
	}
	cover, err := book.Cover()
	if err != nil {
		if errors.Is(err, spine.ErrNoCover) {
			return nil
		}
		return nil
	}
	if len(cover.Bytes) == 0 {
		return nil
	}
	return &coverPayload{
		ContentType: cover.ContentType,
		Data:        base64.StdEncoding.EncodeToString(cover.Bytes),
	}
}

type sectionTarget struct {
	SectionIndex int
	SpineIndex   int
	BlockIndex   int
	BaseHref     string
}

func buildSectionBlocks(book *spine.Book, sections []sectionInfo) ([]sectionBlocksPayload, []imagePayload) {
	if book == nil || len(sections) == 0 {
		return nil, nil
	}

	spineIndexByHref := map[string]int{}
	for i, item := range book.Spine {
		spineIndexByHref[item.Href] = i
	}

	targets := []sectionTarget{}
	for _, section := range sections {
		if section.AnchorHref != "" {
			if ref, ok := book.ResolveAnchor(section.AnchorHref); ok {
				baseHref := ""
				if ref.SpineIndex >= 0 && ref.SpineIndex < len(book.Spine) {
					baseHref = book.Spine[ref.SpineIndex].Href
				}
				targets = append(targets, sectionTarget{
					SectionIndex: section.OrderIndex,
					SpineIndex:   ref.SpineIndex,
					BlockIndex:   ref.BlockIndex,
					BaseHref:     baseHref,
				})
				continue
			}
		}
		if section.Href != "" {
			if idx, ok := spineIndexByHref[section.Href]; ok {
				targets = append(targets, sectionTarget{
					SectionIndex: section.OrderIndex,
					SpineIndex:   idx,
					BlockIndex:   0,
					BaseHref:     section.Href,
				})
			}
		}
	}

	if len(targets) == 0 {
		return nil, nil
	}

	targetsBySpine := map[int][]sectionTarget{}
	for _, target := range targets {
		targetsBySpine[target.SpineIndex] = append(targetsBySpine[target.SpineIndex], target)
	}

	blocksBySpine := map[int][]spine.Block{}
	for spineIndex := range targetsBySpine {
		blocks, err := book.Blocks(spineIndex)
		if err != nil {
			continue
		}
		blocksBySpine[spineIndex] = blocks
	}

	imageMap := map[string]imagePayload{}
	sectionBlocks := map[int][]blockPayload{}

	for spineIndex, list := range targetsBySpine {
		blocks, ok := blocksBySpine[spineIndex]
		if !ok {
			continue
		}
		sort.Slice(list, func(i, j int) bool {
			if list[i].BlockIndex == list[j].BlockIndex {
				return list[i].SectionIndex < list[j].SectionIndex
			}
			return list[i].BlockIndex < list[j].BlockIndex
		})
		for i, target := range list {
			start := target.BlockIndex
			if start < 0 {
				start = 0
			}
			if start > len(blocks) {
				start = len(blocks)
			}
			end := len(blocks)
			for j := i + 1; j < len(list); j++ {
				if list[j].BlockIndex > start {
					end = list[j].BlockIndex
					break
				}
			}
			if end < start {
				end = start
			}
			slice := blocks[start:end]
			payloadBlocks := make([]blockPayload, 0, len(slice))
			for _, block := range slice {
				payloadBlocks = append(payloadBlocks, convertBlock(block, target.BaseHref, book, imageMap))
			}
			if len(payloadBlocks) > 0 {
				sectionBlocks[target.SectionIndex] = payloadBlocks
			}
		}
	}

	sectionPayloads := make([]sectionBlocksPayload, 0, len(sectionBlocks))
	for _, section := range sections {
		if blocks, ok := sectionBlocks[section.OrderIndex]; ok {
			sectionPayloads = append(sectionPayloads, sectionBlocksPayload{
				SectionOrderIndex: section.OrderIndex,
				Blocks:            blocks,
			})
		}
	}

	images := make([]imagePayload, 0, len(imageMap))
	for _, payload := range imageMap {
		images = append(images, payload)
	}
	sort.Slice(images, func(i, j int) bool { return images[i].Href < images[j].Href })

	return sectionPayloads, images
}

func convertBlock(block spine.Block, baseHref string, book *spine.Book, images map[string]imagePayload) blockPayload {
	payload := blockPayload{
		Kind:    blockKindString(block.Kind),
		Level:   block.Level,
		Ordered: block.Ordered,
		ListIndex: block.ListIndex,
		Anchors: block.Anchors,
	}
	if len(block.Inlines) > 0 {
		payload.Inlines = convertInlines(block.Inlines, baseHref, book, images)
	}
	if block.Table != nil {
		payload.Table = convertTable(block.Table, baseHref, book, images)
	}
	if block.Figure != nil {
		payload.Figure = convertFigure(block.Figure, baseHref, book, images)
	}
	return payload
}

func convertTable(table *spine.Table, baseHref string, book *spine.Book, images map[string]imagePayload) *tablePayload {
	if table == nil {
		return nil
	}
	rows := make([]tableRowPayload, 0, len(table.Rows))
	for _, row := range table.Rows {
		cells := make([]tableCellPayload, 0, len(row.Cells))
		for _, cell := range row.Cells {
			cells = append(cells, tableCellPayload{
				Inlines: convertInlines(cell.Inlines, baseHref, book, images),
				Header:  cell.Header,
			})
		}
		rows = append(rows, tableRowPayload{Cells: cells})
	}
	return &tablePayload{Rows: rows}
}

func convertFigure(fig *spine.Figure, baseHref string, book *spine.Book, images map[string]imagePayload) *figurePayload {
	if fig == nil {
		return nil
	}
	return &figurePayload{
		Images:  convertInlines(fig.Images, baseHref, book, images),
		Caption: convertInlines(fig.Caption, baseHref, book, images),
	}
}

func convertInlines(inlines []spine.Inline, baseHref string, book *spine.Book, images map[string]imagePayload) []inlinePayload {
	out := make([]inlinePayload, 0, len(inlines))
	for _, inline := range inlines {
		payload := inlinePayload{
			Kind:   inlineKindString(inline.Kind),
			Text:   inline.Text,
			Href:   inline.Href,
			Src:    inline.Src,
			Alt:    inline.Alt,
			Emph:   inline.Emph,
			Strong: inline.Strong,
		}
		if inline.Kind == spine.InlineImage {
			resolved := resolveResourceHref(baseHref, inline.Src)
			if resolved != "" {
				payload.Src = resolved
				ensureImagePayload(book, resolved, images)
				if meta, ok := images[resolved]; ok {
					payload.Width = meta.Width
					payload.Height = meta.Height
				}
			}
		}
		out = append(out, payload)
	}
	return out
}

func blockKindString(kind spine.BlockKind) string {
	switch kind {
	case spine.BlockParagraph:
		return "paragraph"
	case spine.BlockHeading:
		return "heading"
	case spine.BlockListItem:
		return "list_item"
	case spine.BlockQuote:
		return "blockquote"
	case spine.BlockPre:
		return "pre"
	case spine.BlockHorizontalRule:
		return "hr"
	case spine.BlockTable:
		return "table"
	case spine.BlockFigure:
		return "figure"
	default:
		return "paragraph"
	}
}

func inlineKindString(kind spine.InlineKind) string {
	switch kind {
	case spine.InlineText:
		return "text"
	case spine.InlineEmphasis:
		return "emphasis"
	case spine.InlineStrong:
		return "strong"
	case spine.InlineLink:
		return "link"
	case spine.InlineImage:
		return "image"
	case spine.InlineCode:
		return "code"
	default:
		return "text"
	}
}

func resolveResourceHref(baseHref, src string) string {
	if src == "" {
		return ""
	}
	clean := strings.TrimSpace(src)
	lower := strings.ToLower(clean)
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") || strings.HasPrefix(lower, "data:") || strings.HasPrefix(lower, "//") {
		return ""
	}
	if strings.Contains(clean, "#") {
		clean = strings.SplitN(clean, "#", 2)[0]
	}
	if strings.Contains(clean, "?") {
		clean = strings.SplitN(clean, "?", 2)[0]
	}
	clean = strings.TrimPrefix(clean, "./")
	clean = strings.TrimPrefix(clean, "/")
	if baseHref != "" {
		baseDir := path.Dir(baseHref)
		clean = path.Join(baseDir, clean)
	}
	clean = path.Clean(clean)
	return clean
}

func ensureImagePayload(book *spine.Book, href string, images map[string]imagePayload) {
	if book == nil || href == "" {
		return
	}
	if _, ok := images[href]; ok {
		return
	}
	r, err := book.OpenResource(href)
	if err != nil {
		return
	}
	defer r.Close()
	data, err := io.ReadAll(r)
	if err != nil || len(data) == 0 {
		return
	}
	contentType := mime.TypeByExtension(path.Ext(href))
	if contentType == "" {
		contentType = http.DetectContentType(data)
	}
	width, height := decodeImageDimensions(data)
	images[href] = imagePayload{
		Href:        href,
		ContentType: contentType,
		Data:        base64.StdEncoding.EncodeToString(data),
		Width:       width,
		Height:      height,
	}
}

func decodeImageDimensions(data []byte) (int, int) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return 0, 0
	}
	return cfg.Width, cfg.Height
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
