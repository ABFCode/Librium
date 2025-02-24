package com.example.springreader.utility;

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
import java.nio.file.Paths;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

@Slf4j //Creates a static log for me to use
public class EpubParser {

    public static Map<String, Object> parseMeta(File epubFile){
        Map<String, Object> response = new HashMap<>();

        try(ZipFile zipFile = new ZipFile(epubFile)){
            Optional<OpfData> opfData = getOpfDocument(zipFile);

            if(opfData.isEmpty()){
                log.error("Failed to get OPFData");
                return response;
            }
            Document opfDocument = opfData.get().getOpfDocument();
            String opfFilePath = opfData.get().getOpfFilePath();


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


            //Outer map: Key: File path, Value: A list of maps, each map representing a chapter in the file
            //Inner map: Key: Title, ContentSrc, anchor, index
            Map<String, List<Map<String, String>>> tocOuterMap = new LinkedHashMap<>();

            for(int i = 0; i < navPoints.getLength(); i++){
                Element navPoint = (Element) navPoints.item(i);
                String chapterTitle = navPoint.getElementsByTagName("navLabel").item(0).getTextContent();

                NodeList contentList = navPoint.getElementsByTagName("content");

                if(contentList.getLength() > 0){
                    String rawSrc = contentList.item(0).getAttributes().getNamedItem("src").getTextContent();
                    int hashIndex = rawSrc.indexOf("#");
                    String filePath = (hashIndex != -1) ? rawSrc.substring(0, hashIndex) : rawSrc;
                    String anchor = (hashIndex != -1) ? rawSrc.substring(hashIndex + 1) : "";

                    Map<String, String> tocInnerMap = new HashMap<>();
                    tocInnerMap.put("chapterTitle", chapterTitle);
                    tocInnerMap.put("anchor", anchor);
                    tocInnerMap.put("filePath", filePath);
                    tocInnerMap.put("index", String.valueOf(i));

                    tocOuterMap.computeIfAbsent(filePath, k -> new ArrayList<>()).add(tocInnerMap);
                }
            }


            //A list of maps, each map will have a title, contentPath, and the index of the chapter
//            List<Map<String,String>> tocList = new ArrayList<>();
//
//            for(int i =0; i < navPoints.getLength(); i++){
//                Element navPoint = (Element) navPoints.item(i);
//                String chapterTitle = "";
//
//                NodeList navLabels = tocDocument.get().getElementsByTagName("navLabel");
//
//                chapterTitle = navLabels.item(i).getTextContent();
//                //log.info("chapterTitle is : {}", chapterTitle);
//
//                NodeList contentList = navPoint.getElementsByTagName("content");
//                String contentSrc = "";
//
//                //log.info("ContestList length is: {}", contentList.getLength());
//
//
//                if(contentList.getLength() > 0){
//                    contentSrc = contentList.item(0).getAttributes().getNamedItem("src").getTextContent();
//                    //log.info("ContentSrc is : {}", contentSrc);
//                }
//
//                String index = String.valueOf(i);
//
//                //log.info("Index is : {}", index);
//                Map<String, String> tocMap = new HashMap<>();
//
//                //Title index and path of the chapter
//                tocMap.put("title", chapterTitle);
//                tocMap.put("contentSrc", contentSrc);
//                tocMap.put("index", index);
//                tocList.add(tocMap);
//
//            }
            response.put("toc", tocOuterMap);

        }
        catch (Exception e){
            log.error("Error opening epub", e);
        }



        return response;
    }

    public static Map<String, Object> parseContent(File epubFile, int chapterIndex) {
        Map<String, Object> response = new HashMap<>();
        String chapterContent = "";


        try(ZipFile zipFile = new ZipFile(epubFile)) {
            System.out.println("Epub file opened");


            Optional<OpfData> opfData = getOpfDocument(zipFile);
            if(opfData.isEmpty()){
                log.error("Failed to get OPFData");
                return response;
            }
            Document opfDocument = opfData.get().getOpfDocument();
            String opfFilePath = opfData.get().getOpfFilePath();

            Optional<Document> tocDocument = getToc(zipFile, opfDocument, opfFilePath);
            if(tocDocument.isEmpty()){
                log.error("Could not receive TocDocument");
                return response;
            }


            NodeList contentList = tocDocument.get().getElementsByTagName("content");
            //log.info("contentList length is: " + String.valueOf(contentList.getLength()));
            //log.info("Check chapter: " + contentList.item(chapterIndex).getAttributes().getNamedItem("src").getTextContent());

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
            if (Paths.get(opfFilePath).getParent() != null) {
                chapterPath = Paths.get(opfFilePath).getParent()
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



    private static Optional<Document> parseXML(InputStream input) {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        try {
            return Optional.of(factory.newDocumentBuilder().parse(input));
        } catch (Exception e) {
            System.out.println("Error parsing the XML file," + e);
            return Optional.empty();
        }
    }

    private static Optional<OpfData> getOpfDocument(ZipFile zipFile){
        try{
            ZipEntry containerEntry = zipFile.getEntry("META-INF/container.xml");

            Optional<Document> containerDocument = parseXML(zipFile.getInputStream(containerEntry));
            if(containerDocument.isPresent()){

                NodeList containerRootFiles = containerDocument.get().getElementsByTagName("rootfile");

                String opfFilePath = containerRootFiles.item(0).getAttributes().getNamedItem("full-path").getTextContent();

                ZipEntry opfEntry = zipFile.getEntry(opfFilePath);
                Optional<Document> opfDocument = parseXML(zipFile.getInputStream(opfEntry));
                if(opfDocument.isPresent()){
                    return Optional.of(new OpfData(opfDocument.get(), opfFilePath));
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
            String tocPath = "";
            if(Paths.get(opfFilePath).getParent() != null){
                tocPath = Paths.get(opfFilePath).getParent().resolve(tocHref).toString();
            }
            else{
                tocPath = tocHref;
            }
            log.info("tocPath is: " + tocPath);

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

}
