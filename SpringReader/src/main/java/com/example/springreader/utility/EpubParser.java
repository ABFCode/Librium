package com.example.springreader.utility;

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
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
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
    public static Map<String, Object> parseMeta(File epubFile){
        Map<String, Object> response = new HashMap<>();

        if (epubFile == null) {
            log.error("epubFile does not exist");
            return response;
        }

        try(ZipFile zipFile = new ZipFile(epubFile)){
            Optional<OpfData> opfData = getOpfDocument(zipFile);

            if(opfData.isEmpty()){
                log.error("Failed to get OPFData");
                return response;
            }
            Document opfDocument = opfData.get().opfDocument();
            String opfFilePath = opfData.get().opfFilePath();


            String title = opfDocument.getElementsByTagName("dc:title").item(0).getTextContent();
            String author = opfDocument.getElementsByTagName("dc:creator").item(0).getTextContent();
            response.put("title", title);
            response.put("author", author);

            Optional<Document> tocDocument = getToc(zipFile, opfDocument, opfFilePath);
            if(tocDocument.isEmpty()){
                log.error("Could not receive TocDocument");
                return response;
            }

            NodeList navPoints = tocDocument.get().getElementsByTagName("navPoint");

            EpubToc toc = new EpubToc();


            for(int i = 0; i < navPoints.getLength(); i++){
                Element navPoint = (Element) navPoints.item(i);
                String chapterTitle = navPoint.getElementsByTagName("navLabel").item(0).getTextContent();

                NodeList contentList = navPoint.getElementsByTagName("content");

                if(contentList.getLength() > 0){
                    String rawSrc = contentList.item(0).getAttributes().getNamedItem("src").getTextContent();
                    //log.info("Raw src: {}", rawSrc);
                    int hashIndex = rawSrc.indexOf("#");
                    String rawFilePath = (hashIndex != -1) ? rawSrc.substring(0, hashIndex) : rawSrc;
                    String filePath = Path.of(opfData.get().opfParent()).resolve(rawFilePath).toString().replace("\\", "/");


                    String anchor = (hashIndex != -1) ? rawSrc.substring(hashIndex + 1) : "";

                    //Find the content file in our toc, or create a new one
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
                    //Add the chapter to the content file
                    contentFile.addChapter(new EpubChapter(chapterTitle, anchor, i, filePath));
                    //log.info("Chapter added to content file: title={}, anchor={}, index={}", chapterTitle, anchor, i);
                }
            }

            response.put("toc", toc);

        }
        catch (ZipException e){
            log.error("Invalid Zip/Epub file: {}", epubFile, e);
        }
        catch (Exception e){
            log.error("Error opening epub", e);
            return response;
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
     * @param chapterIndex The index of the chapter to retrieve
     * @return A map containing the parsed chapter content under the key "chapterContent".
     *         In case of errors or weird behavior, returns an empty map.
     */
    public static Map<String, Object> oldParseContent(File epubFile, int chapterIndex) {
        Map<String, Object> response = new HashMap<>();
        String chapterContent = "";

        if(epubFile == null) {
            log.error("Epub file does not exist");
            return response;
        }


        try(ZipFile zipFile = new ZipFile(epubFile)) {
            System.out.println("Epub file opened");


            Optional<OpfData> opfData = getOpfDocument(zipFile);
            if(opfData.isEmpty()){
                log.error("Failed to get OPFData");
                return response;
            }
            Document opfDocument = opfData.get().opfDocument();
            String opfFilePath = opfData.get().opfFilePath();

            Optional<Document> tocDocument = getToc(zipFile, opfDocument, opfFilePath);
            if(tocDocument.isEmpty()){
                log.error("Could not receive TocDocument");
                return response;
            }


            NodeList contentList = tocDocument.get().getElementsByTagName("content");
            //log.info("contentList length is: " + String.valueOf(contentList.getLength()));
            //log.info("Check chapter: " + contentList.item(chapterIndex).getAttributes().getNamedItem("src").getTextContent());

            if(chapterIndex < 0 || chapterIndex >= contentList.getLength()) {
                log.error("Invalid index {}", chapterIndex);
                return response;
            }


            String rawChapterSrc = contentList.item(chapterIndex).getAttributes().getNamedItem("src").getTextContent();
            log.info(rawChapterSrc);

            int hashIndex = rawChapterSrc.indexOf('#');
            String anchor = "";
            if (hashIndex != -1) {
                anchor = rawChapterSrc.substring(hashIndex + 1);
                rawChapterSrc = rawChapterSrc.substring(0, hashIndex);
            }
            log.info(rawChapterSrc);

            String chapterPath;
            if (Path.of(opfFilePath).getParent() != null) {
                chapterPath = Path.of(opfFilePath).getParent()
                        .resolve(rawChapterSrc)
                        .toString();
            } else {
                // If the OPF is at the root of the zip, just use rawSrc
                chapterPath = rawChapterSrc;
            }


            chapterPath = chapterPath.replace("\\", "/");

            ZipEntry chapterZipEntry = zipFile.getEntry(chapterPath);


            log.info(chapterZipEntry.toString());

            String chapter1ContentHTML = new String(zipFile.getInputStream(chapterZipEntry).readAllBytes(), StandardCharsets.UTF_8);
            //chapterContent = Jsoup.parse(chapter1ContentHTML).text();




            org.jsoup.nodes.Document chapterDocument = Jsoup.parse(chapter1ContentHTML);

            if(!anchor.isEmpty()){
                chapterDocument = Jsoup.parse(chapterDocument.html());

                //Find the element using our anchor as an id
                org.jsoup.nodes.Element anchorElement = chapterDocument.getElementById(anchor);

                if (anchorElement != null) {
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
                    response.put("chapterContent", contentBuilder.toString().trim());
                } else {
                    //There was an anchor, but couldn't find it in our documenet
                    response.put("chapterContent", "Anchor not found: " + anchor);
                }
            } else //No anchor
            {
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
                    }
                }

                response.put("chapterContent", contentBuilder.toString().trim());
            }




        } catch (Exception e) {
            System.out.println("Error opening the epub," + e);
        }
        return response;


    }

    public static String parseContent(Path epubFile, String filePath, String anchor){
        String chapterContent = "";

        try(ZipFile zipFile = new ZipFile(epubFile.toFile())){
            ZipEntry chapterZipEntry = zipFile.getEntry(filePath);

            log.info("Filepath is: {}", filePath);
            if(chapterZipEntry == null){
                log.error("Chapter zip entry not found");
                return "";
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
            } catch (Exception e) {
                throw new RuntimeException(e);
            }

    }
        catch (Exception e){
            log.error("Error opening epub", e);
        }



        return chapterContent;
    }

    public static Optional<Map<String, Object>> extractCoverImage(File epubFile){
        try(ZipFile zipFile = new ZipFile(epubFile)){
            Optional<OpfData> opfData = getOpfDocument(zipFile);
            if(opfData.isEmpty()){
                log.error("Failed to get OPFData");
                return Optional.empty();
            }
            Document opfDocument = opfData.get().opfDocument();
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
                        if(Path.of(opfData.get().opfFilePath()).getParent() != null){
                            coverImagePath = Path.of(opfData.get().opfFilePath()).getParent().resolve(href).toString().replace("\\", "/");
                        }
                        else{
                            coverImagePath = href.replace("\\", "/");
                        }


                        //log.info("Found cover image path at: {}", coverImagePath);

                        ZipEntry coverImageEntry = zipFile.getEntry(coverImagePath);

                        //log.info("Cover image entry: {}", coverImageEntry.getName());
                        if(coverImageEntry != null) {
                            Map<String, Object> response = new HashMap<>();
                            response.put("coverImage", zipFile.getInputStream(coverImageEntry).readAllBytes());
                            response.put("mediaType", mediaType);
                            return Optional.of(response);
                        }

                    }
                }
            }

            return Optional.empty();




        }
        catch (Exception e){
            log.error("Error extracting cover image", e);
            return Optional.empty();
        }
    }



    /**
     * Parses an XML file from the given InputStream and returns an Optional containing the parsed Document.
     *
     * @param input the InputStream representing the XML to be parsed
     * @return an Optional containing the parsed Document, or an empty Optional if parsing fails
     */
    private static Optional<Document> parseXML(InputStream input) {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        try {
            return Optional.of(factory.newDocumentBuilder().parse(input));
        } catch (Exception e) {
            System.out.println("Error parsing the XML file," + e);
            return Optional.empty();
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
    private static Optional<OpfData> getOpfDocument(ZipFile zipFile){
        try{
            ZipEntry containerEntry = zipFile.getEntry("META-INF/container.xml");

            Optional<Document> containerDocument = parseXML(zipFile.getInputStream(containerEntry));
            if(containerDocument.isPresent()){

                NodeList containerRootFiles = containerDocument.get().getElementsByTagName("rootfile");

                String opfFilePath = containerRootFiles.item(0).getAttributes().getNamedItem("full-path").getTextContent();

                ZipEntry opfEntry = zipFile.getEntry(opfFilePath);
                Optional<Document> opfDocument = parseXML(zipFile.getInputStream(opfEntry));

                String opfParentDir = Path.of(opfFilePath).getParent() != null ? Path.of(opfFilePath).getParent().toString() : "";

                if(opfDocument.isPresent()){
                    return Optional.of(new OpfData(opfDocument.get(), opfFilePath, opfParentDir));
                }
                else{
                    return Optional.empty();
                }

            }
            else{
                return Optional.empty();
            }



        }
        catch (Exception e){
            log.error("Error getting OPFDocument", e);
            return Optional.empty();
        }

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
    private static Optional<Document> getToc(ZipFile zipFile, Document opfDocument, String opfFilePath){

        NodeList manifestItems = opfDocument.getElementsByTagName("item");
        String tocHref = "";
        for( int i = 0; i < manifestItems.getLength(); i++){
            String mediaType = manifestItems.item(i).getAttributes().getNamedItem("media-type").getTextContent();
            if(mediaType.equals("application/x-dtbncx+xml")){
                tocHref = manifestItems.item(i).getAttributes().getNamedItem("href").getTextContent();
                break;
            }
        }



        if(tocHref.isEmpty()){
            log.error("Could not find toc.ncx");
            return Optional.empty();
        }
        else{
            //Compute full path
            String tocPath = "";
            if(Path.of(opfFilePath).getParent() != null){
                tocPath = Path.of(opfFilePath).getParent().resolve(tocHref).toString();
            }
            else{
                tocPath = tocHref;
            }
            //log.info("tocPath is: " + tocPath);

            //Dont need to do this if I change to Path instead of File -> future stuff
            tocPath = tocPath.replace("\\", "/");
            ZipEntry tocEntry = zipFile.getEntry(tocPath);
            if(tocEntry == null){
                log.error("TOC not found at: {}", tocPath);
                return Optional.empty();
            }
            else {
                try{
                    Optional<Document> tocDocument = parseXML(zipFile.getInputStream(tocEntry));
                    return tocDocument;
                }
                catch (Exception e){
                    log.error("Error parsing our TocDocument", e);
                    return Optional.empty();
                }

            }
        }
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
