package com.example.springreader.utility;

import com.example.springreader.exception.EpubProcessingException;
import com.example.springreader.model.EpubChapter;
import com.example.springreader.model.EpubContentFile;
import com.example.springreader.model.EpubToc;
import com.example.springreader.model.OpfData;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.zip.ZipEntry;
import java.util.zip.ZipException;
import java.util.zip.ZipFile;


/**
 * Utility class for parsing EPUB files. Provides static methods to extract
 * metadata (title, author, table of contents), chapter content, and cover images.
 */
@Slf4j //Creates a static log for me to use
public class EpubParser {


    /**
     * Parses the core metadata from an EPUB file, including title, author, and table of contents.
     * Navigates the EPUB structure (container.xml -> OPF -> NCX/TOC) to extract information.
     *
     * @param epubFile the epub to extract the metadata from
     * @return a Map containing extracted metadata ("title", "author", "toc").
     * @throws EpubProcessingException If the EPUB structure is invalid or required files are missing/malformed.
     * @throws IOException If an error occurs reading the EPUB file.
     * @throws IllegalArgumentException If epubFile is null.
     */
    public static Map<String, Object> parseMeta(File epubFile) throws EpubProcessingException, IOException{
        if (epubFile == null) {
            throw new IllegalArgumentException("epubFile cannot be null");
        }

        Map<String, Object> response = new HashMap<>();

        try(ZipFile zipFile = new ZipFile(epubFile)){
            OpfData opfData = getOpfDocument(zipFile);
            Document opfDocument = opfData.opfDocument();
            String opfFilePath = opfData.opfFilePath();


            String title = "Unknown Title";
            NodeList titleNode = opfDocument.getElementsByTagName("dc:title");
            if(titleNode.getLength() == 0 || titleNode.item(0).getTextContent().isBlank()){
                log.warn("Title not found in OPF document");
                response.put("title", title);
            }
            else{
                title = titleNode.item(0).getTextContent();
                response.put("title", title);
            }

            String author = "Unknown Author";
            NodeList authorNode = opfDocument.getElementsByTagName("dc:creator");
            if(authorNode.getLength() == 0 || authorNode.item(0).getTextContent().isBlank()){
                log.warn("Author not found in OPF document");
                response.put("author", author);
            }
            else{
                author = authorNode.item(0).getTextContent();
            }
            response.put("title", title);
            response.put("author", author);

            Document tocDocument = getToc(zipFile, opfDocument, opfFilePath);

            NodeList navPoints = tocDocument.getElementsByTagName("navPoint");
            if(navPoints.getLength() == 0){
                log.error("No navPoints found in toc.ncx for epub: {}", epubFile.getName());
                throw new EpubProcessingException("No navPoints found in toc.ncx");
            }

            EpubToc toc = new EpubToc();


            for(int i = 0; i < navPoints.getLength(); i++){
                Element navPoint = (Element) navPoints.item(i);
                NodeList chapterTitleNode = navPoint.getElementsByTagName("navLabel");
                String chapterTitle = "Unknown Chapter Title";
                if(chapterTitleNode.getLength() == 0 || chapterTitleNode.item(0).getTextContent().isBlank()){
                    log.warn("Chapter title not found in navPoint: {}", navPoint.getAttribute("id"));
                }
                else{
                    chapterTitle = chapterTitleNode.item(0).getTextContent().trim();
                }

                NodeList contentList = navPoint.getElementsByTagName("content");
                if(contentList.getLength() == 0 || contentList.item(0).getAttributes().getNamedItem("src") == null){
                    log.error("Content src not found in navPoint: {}", navPoint.getAttribute("id"));
                    throw new EpubProcessingException("Content src not found in navPoint: " + navPoint.getAttribute("id"));
                }

                String rawSrc = contentList.item(0).getAttributes().getNamedItem("src").getTextContent();
                if(rawSrc.isBlank()){
                    log.error("Content src is blank in navPoint: {}", navPoint.getAttribute("id"));
                    throw new EpubProcessingException("Content src is blank in navPoint: " + navPoint.getAttribute("id"));
                }


                int hashIndex = rawSrc.indexOf("#");
                String rawFilePath = (hashIndex != -1) ? rawSrc.substring(0, hashIndex) : rawSrc;
                String filePath = Path.of(opfData.opfParent()).resolve(rawFilePath).toString().replace("\\", "/");

                String anchor = (hashIndex != -1) ? rawSrc.substring(hashIndex + 1) : "";

                EpubContentFile contentFile = null;
                for (EpubContentFile cf : toc.getContentFiles()) {
                    if (cf.getFilePath().equals(filePath)) {
                        contentFile = cf;
                        break;
                    }
                }

                if (contentFile == null) {
                    contentFile = new EpubContentFile(filePath);
                    toc.addContentFile(contentFile);
                }

                contentFile.addChapter(new EpubChapter(chapterTitle, anchor, i, filePath));

            }

            response.put("toc", toc);

        }
        catch (ZipException e){
            log.error("Invalid Zip/Epub file: {}", epubFile, e);
            throw new EpubProcessingException("Invalid Zip/Epub file: " + epubFile.getName() + "\n" + e.getMessage());
        }
        return response;
    }

    /**
     * Parses and extracts the text content of a specific chapter from an EPUB file.
     * Uses Jsoup to parse the chapter's HTML and extracts text from headings/paragraphs.
     * Handles optional anchors to extract specific sections.
     *
     * @param epubFile Path to the EPUB file on the filesystem.
     * @param filePath The path to the chapter's content file *within* the EPUB archive.
     * @param anchor The optional anchor (ID) within the chapter file to start extraction from. Can be empty.
     * @return A String containing the extracted text content, paragraphs separated by double newlines.
     * @throws EpubProcessingException If the chapter file or anchor cannot be found.
     * @throws IOException If an error occurs reading the EPUB or chapter file.
     * @throws IllegalArgumentException If epubFile or filePath is null or blank.
     */
    public static String parseContent(Path epubFile, String filePath, String anchor) throws EpubProcessingException, IOException{
        if(epubFile == null){
            throw new IllegalArgumentException("epubFile cannot be null");
        }
        if(filePath == null || filePath.isBlank()){
            throw new IllegalArgumentException("filePath cannot be null or blank");
        }
        try(ZipFile zipFile = new ZipFile(epubFile.toFile())){
            ZipEntry chapterZipEntry = zipFile.getEntry(filePath);

            if(chapterZipEntry == null){
                log.error("Chapter zip entry not found for path: {}", filePath);
                throw new EpubProcessingException("Chapter zip entry not found for path: " + filePath);
            }


            try(InputStream chapterInputStream = zipFile.getInputStream(chapterZipEntry)){
                org.jsoup.nodes.Document chapterDocument = Jsoup.parse(chapterInputStream, "UTF-8", filePath);

                if(!anchor.isEmpty()){
                    chapterDocument = Jsoup.parse(chapterDocument.html());

                    //Find the element using our anchor as an id
                    org.jsoup.nodes.Element anchorElement = chapterDocument.getElementById(anchor);

                    if (anchorElement != null) {
                        log.info("Found anchor element: {}", anchorElement.tagName());
                        //Create a StringBuilder to collect all content
                        StringBuilder contentBuilder = new StringBuilder();

                        //If it's a div (container element), process all its children
                        if (anchorElement.tagName().equals("div")) {
                            //Look for a heading, if present.
                            org.jsoup.nodes.Element heading = anchorElement.select("h1, h2, h3, h4, h5, h6").first();
                            if (heading != null) {
                                /**
                                 * ("\n\n") so we can format between paragraphs/headings/etc on front end easily.
                                 */
                                contentBuilder.append(heading.text()).append("\n\n");
                            }

                            //Add all paragraphs
                            for (org.jsoup.nodes.Element p : anchorElement.select("p")) {
                                String pText = p.text().trim();
                                if (!pText.isEmpty()) {
                                    contentBuilder.append(pText).append("\n\n");
                                }
                            }
                        } else {
                            //Add the anchor element itself
                            contentBuilder.append(anchorElement.text()).append("\n\n");

                            //Add all following sibling elements until the next anchor or the end
                            org.jsoup.nodes.Element currentElement = anchorElement;
                            while ((currentElement = currentElement.nextElementSibling()) != null) {
                                //Stop if we hit another anchor element
                                if (currentElement.hasAttr("id")) {
                                    break;
                                }

                                //Check if it's a paragraph element
                                if (currentElement.tagName().equals("p")) {
                                    String paragraphText = currentElement.text().trim();
                                    if (!paragraphText.isEmpty()) {
                                        contentBuilder.append(paragraphText).append("\n\n");
                                    }
                                }
                                //Headings
                                else if (currentElement.tagName().matches("h[1-6]")) {
                                    String headingText = currentElement.text().trim();
                                    if (!headingText.isEmpty()) {
                                        contentBuilder.append(headingText).append("\n\n");
                                    }
                                }
                            }
                        }

                        //Return the text content
                        return contentBuilder.toString().trim();
                    } else {
                        //There was an anchor, but couldn't find it in our documenet
                        return "Anchor not found: " + anchor;
                    }
                } else //No anchor
                {
                    log.info("No anchor provided");
                    chapterDocument.head().remove();



                    StringBuilder contentBuilder = new StringBuilder();

                    //add any headings
                    for (org.jsoup.nodes.Element hElement : chapterDocument.select("h1, h2, h3, h4, h5, h6")) {
                        String hText = hElement.text().trim();
                        if (!hText.isEmpty()) {
                            contentBuilder.append(hText).append("\n\n");
                        }
                    }

                    //add all paragraphs
                    for (org.jsoup.nodes.Element pElement : chapterDocument.select("p")) {
                        String pText = pElement.text().trim();
                        if (!pText.isEmpty()) {
                            contentBuilder.append(pText).append("\n\n");
                            //log.info("Paragraph text: {}", pText);
                        }
                    }

                    return contentBuilder.toString().trim();
                }
            }
        } catch (ZipException e){
            log.error("Invalid Zip/Epub file: {}", epubFile.getFileName(), e);
            throw new EpubProcessingException("Invalid Zip/Epub file: " + epubFile.getFileName() + "\n" + e);
        }
    }

    /**
     * Extracts the cover image data (bytes and media type) from an EPUB file.
     * Searches the OPF manifest for an item identified as the cover image.
     *
     * @param epubFile The EPUB file to extract the cover from.
     * @return An Optional containing a Map with "coverImage" (byte[]) and "mediaType" (String) if found,
     *         otherwise an empty Optional.
     * @throws EpubProcessingException If the EPUB structure is invalid or reading the image fails.
     * @throws IOException If an error occurs reading the EPUB file.
     * @throws IllegalArgumentException If epubFile is null.
     */
    public static Optional<Map<String, Object>> extractCoverImage(File epubFile) throws EpubProcessingException, IOException{
        if(epubFile == null){
            throw new IllegalArgumentException("epubFile cannot be null");
        }

        try(ZipFile zipFile = new ZipFile(epubFile)){
            OpfData opfData = getOpfDocument(zipFile);

            Document opfDocument = opfData.opfDocument();
            NodeList manifestItems = opfDocument.getElementsByTagName("item");

            for(int i = 0; i < manifestItems.getLength(); i++){
                Element item = (Element) manifestItems.item(i);
                String id = item.getAttribute("id");
                String href = item.getAttribute("href");
                String mediaType = item.getAttribute("media-type");

                //some books don't seem to have this attribute (hp)
                String properties = item.getAttribute("properties");


                if(mediaType.equals("image/jpeg") || mediaType.equals("image/png")){
                    String coverImagePath;
                    if(id.toLowerCase().contains("cover") || properties.toLowerCase().contains("cover-image") || href.toLowerCase().contains("cover")){
                        if(Path.of(opfData.opfFilePath()).getParent() != null){
                            coverImagePath = Path.of(opfData.opfFilePath()).getParent().resolve(href).toString().replace("\\", "/");
                        }
                        else{
                            coverImagePath = href.replace("\\", "/");
                        }


                        //log.info("Found cover image path at: {}", coverImagePath);

                        ZipEntry coverImageEntry = zipFile.getEntry(coverImagePath);

                        //log.info("Cover image entry: {}", coverImageEntry.getName());
                        if(coverImageEntry != null) {
                            Map<String, Object> response = new HashMap<>();
                            try(InputStream coverImageStream = zipFile.getInputStream(coverImageEntry)){
                                response.put("coverImage", coverImageStream.readAllBytes());
                                response.put("mediaType", mediaType);
                                return Optional.of(response);
                            }
                            catch (IOException e){
                                log.error("Error reading cover image stream for path: {}", coverImagePath, e);
                                throw new EpubProcessingException("Error reading cover image: " + coverImagePath + e);
                            }
                        }
                        else{
                            log.warn("Cover image entry not found for path: {} despite being listed in OPF document", coverImagePath);
                            throw new EpubProcessingException("Cover image not found for path: " + coverImagePath);
                        }

                    }
                }
            }

            log.warn("No cover image found in epub: {}", epubFile.getName());

            return Optional.empty();

        }
        catch (ZipException e){
            log.error("Invalid Zip/Epub file: {}", epubFile.getName(), e);
            throw new EpubProcessingException("Invalid Zip/Epub file: " + epubFile.getName() + "\n" + e);
        }
    }


    /**
     * Parses an XML InputStream into a W3C Document object.
     *
     * @param input the InputStream representing the XML to be parsed
     * @return The parsed Document object.
     * @throws EpubProcessingException if parsing fails.
     */
    private static Document parseXML(InputStream input) throws EpubProcessingException {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        try {
            return factory.newDocumentBuilder().parse(input);
        } catch (Exception e) {
            log.error("Error parsing XML", e);
            throw new EpubProcessingException("Failed to parse XML: " + e);
        }
    }

    /**
     * Locates and parses the OPF file within the EPUB archive.
     * Reads META-INF/container.xml to find the path to the OPF file.
     *
     * @param zipFile the zip file representing the EPUB
     * @return an OpfData record containing the parsed OPF Document, its path, and its parent directory path.
     * @throws EpubProcessingException If container.xml or the OPF file is missing or invalid.
     * @throws IOException If an error occurs reading from the zip file.
     */
    private static OpfData getOpfDocument(ZipFile zipFile) throws EpubProcessingException, IOException {
        ZipEntry containerEntry = zipFile.getEntry("META-INF/container.xml");
        if (containerEntry == null) {
            throw new EpubProcessingException("Container.xml not found at: META-INF/container.xml");
        }

        Document containerDocument = parseXML(zipFile.getInputStream(containerEntry));

        NodeList containerRootFiles = containerDocument.getElementsByTagName("rootfile");
        if(containerRootFiles.getLength() == 0 || containerRootFiles.item(0).getAttributes().getNamedItem("full-path") == null){
            throw new EpubProcessingException("Invalid container.xml: No rootfile found or full-path attribute not found");
        }

        String opfFilePath = containerRootFiles.item(0).getAttributes().getNamedItem("full-path").getTextContent();


        ZipEntry opfEntry = zipFile.getEntry(opfFilePath);
        if(opfEntry == null){
            throw new EpubProcessingException("OPF file not found at: " + opfFilePath);
        }
        Document opfDocument = parseXML(zipFile.getInputStream(opfEntry));

        String opfParentDir = Path.of(opfFilePath).getParent() != null ? Path.of(opfFilePath).getParent().toString() : "";

        return new OpfData(opfDocument, opfFilePath, opfParentDir);

    }

    /**
     * Locates and parses the TOC (Table of Contents) file (typically NCX) referenced within the OPF manifest.
     *
     * @param zipFile our epub file represented as java ZipFile
     * @param opfDocument the OPF document containing the reference to the TOC file.
     * @param opfFilePath the file path of the OPF document within the archive (for resolving relative paths).
     * @return The parsed TOC Document object.
     * @throws EpubProcessingException If the TOC reference is not found or the TOC file is missing/invalid.
     * @throws IOException If an error occurs reading from the zip file.
     */
    private static Document getToc(ZipFile zipFile, Document opfDocument, String opfFilePath) throws EpubProcessingException, IOException{

        NodeList manifestItems = opfDocument.getElementsByTagName("item");
        String tocHref = "";
        for( int i = 0; i < manifestItems.getLength(); i++){
            String mediaType = manifestItems.item(i).getAttributes().getNamedItem("media-type").getTextContent();
            if(mediaType.equals("application/x-dtbncx+xml")){
                tocHref = manifestItems.item(i).getAttributes().getNamedItem("href").getTextContent();
                break;
            }
        }

        if(tocHref.isBlank()){
            throw new EpubProcessingException("TOC entry reference not found in OPF document.");
        }
        String tocPath;
        Path opfPath =  Path.of(opfFilePath);
        if(Path.of(opfFilePath).getParent() != null){
            tocPath = opfPath.getParent().resolve(tocHref).toString();
        }
        else{
            tocPath = tocHref;
        }

        tocPath = tocPath.replace("\\", "/");


        ZipEntry tocEntry = zipFile.getEntry(tocPath);

        if(tocEntry == null){
            log.error("TOC not found at: {}", tocPath);
            throw new EpubProcessingException("TOC not found at: " + tocPath);
        }

        return parseXML(zipFile.getInputStream(tocEntry));

    }

    /**
     * Helper method to extract the EpubToc object from the metadata map returned by parseMeta.
     *
     * @param meta The metadata map.
     * @return The EpubToc object, or null if not found.
     */
    public static EpubToc getToc(Map<String, Object> meta) {
        return (EpubToc) meta.get("toc");
    }

    /**
     * Helper method to extract the title string from the metadata map returned by parseMeta.
     *
     * @param meta The metadata map.
     * @return The title String, or null if not found.
     */
    public static String getTitle(Map<String, Object> meta) {
        return (String) meta.get("title");
    }

    /**
     * Helper method to extract the author string from the metadata map returned by parseMeta.
     *
     * @param meta The metadata map.
     * @return The author String, or null if not found.
     */
    public static String getAuthor(Map<String, Object> meta){
        return (String) meta.get("author");
    }

}
