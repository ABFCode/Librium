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
 * A collection of methods for handling parsing epubs.
 * Can parse the metadata from a novel, right now just title/author/toc.
 *
 * As well as extract plain text chapter contents with simple formatting
 */
@Slf4j //Creates a static log for me to use
public class EpubParser {



    /**
     * This method is used parsing and extracting metadata from EPUB files.
     *
     * It provides methods for extracting book titles, authors, table of contents,
     * and chapter content files from the EPUB file structure.
     *
     * The table of contents is processed into a structure.
     * including each chapter's title, file path, and position(index)
     *
     * Full metadata structure:
     * {
     *   "title": "Book Title",
     *   "author": "Author Name",
     *   "toc": {
     *     "contentFiles": [
     *       {
     *         "filePath": "chapter1.html",
     *         "chapters": [
     *           { "chapterTitle": "Chapter 1", "anchor": "ch1", "index": 0 },
     *           { "chapterTitle": "Chapter 2", "anchor": "ch2", "index": 1 }
     *         ]
     *       },
     *       {
     *         "filePath": "chapter2.html",
     *         "chapters": [
     *           { "chapterTitle": "Chapter 3", "anchor": "ch3", "index": 2 }
     *         ]
     *       }
     *     ]
     *   }
     * }
     *
     *
     * @param epubFile the epub to extract the metadata from
     * @return a hashmap structure as shown above
     *
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
            throw new EpubProcessingException("Invalid Zip/Epub file: " + epubFile.getName() + "\n" + e);
        }
        return response;
    }

    /**
     * Parses the content of a specific chapter from an epub file.
     *
     * Needs to be completely redone. Likely using the ToC we built from parseMeta.
     * As it is now we load the entire novel each time we want to fetch a chapter.
     *
     * Extracts simple text content of a specified chapter from its headings
     * and paragraphs elements from an epub file.
     *
     * If an anchor is present in the chapter's content reference, it will use it to extract content starting from the specified anchor until
     * the next anchor, otherwise:
     * If no anchor is provided, it extracts all text content of the chapter.
     *
     *
     * @param epubFile     The epub file to parse.
     * @param filePath file path of the html where our chapter is inside the epub archive
     * @param anchor anchor of our chapter content in the file
     * @return A map containing the parsed chapter content under the key "chapterContent".
     *         In case of errors or unique behavior, return an empty map.
     */
    public static String parseContent(Path epubFile, String filePath, String anchor) throws EpubProcessingException, IOException{
        if(epubFile == null){
            throw new IllegalArgumentException("epubFile cannot be null");
        }
        if(filePath == null || filePath.isBlank()){
            throw new IllegalArgumentException("filePath cannot be null or blank");
        }
        String chapterContent = "";
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
     * Parses an XML file from the given InputStream and returns an Optional containing the parsed Document.
     *
     * @param input the InputStream representing the XML to be parsed
     * @return an Optional containing the parsed Document, or an empty Optional if parsing fails
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
     * Retrieves the OPF document from the provided zip file.
     *
     * This method extracts and parses the OPF document located within an EPUB file
     * by finding the container.xml file and then fetching the OPF document from information given on the container
     *
     * @param zipFile the zip file representing the EPUB
     * @return an Optional containing the extracted OPF data, or an empty Optional if
     * the OPF document is not found or cannot be parsed
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
     * Retrieves the toc (table of contents) file from a ZIP file, based on some metadata of an opf document.
     *
     *
     * @param zipFile our epub file represented as java ZipFile
     * @param opfDocument the OPF document of the eBook, which gives us a lot of metadata on the book, relevant to us
     *                    is the toc.ncx path
     * @param opfFilePath the file path of the OPF document within the archive
     * @return an Optional containing the TOC document if found,
     *         or an empty Optional if not found or an error occurs
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
     * Gets the ToC from our metadata map
     * @param meta Our finished metadata map that we return from parseMeta
     * @return Our custom EpubToc object (which is a list of contentFiles, where each contentFile is a list of chapters)
     */
    public static EpubToc getToc(Map<String, Object> meta) {
        return (EpubToc) meta.get("toc");
    }

    /**
     * Gets our book title our meta map
     * @param meta Our finished metadata map that we return from parseMeta
     * @return A string with the title
     */
    public static String getTitle(Map<String, Object> meta) {
        return (String) meta.get("title");
    }

    /**
     * Gets our author for our book from the meta hashmap
     * @param meta Our finished metadata map that we return from parseMeta
     * @return A string author
     */
    public static String getAuthor(Map<String, Object> meta){
        return (String) meta.get("author");
    }

}
