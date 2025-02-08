package com.example.springreader.utility;

import com.example.springreader.model.OpfData;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import javax.swing.text.html.Option;
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

            //A list of maps, each map will have a title, contentPath, and the index of the chapter
            List<Map<String,String>> tocList = new ArrayList<>();

            for(int i =0; i < navPoints.getLength(); i++){
                Element navPoint = (Element) navPoints.item(i);
                String chapterTitle = "";

                NodeList navLabels = tocDocument.get().getElementsByTagName("navLabel");

                chapterTitle = navLabels.item(i).getTextContent();
                //log.info("chapterTitle is : {}", chapterTitle);

                NodeList contentList = navPoint.getElementsByTagName("content");
                String contentSrc = "";

                //log.info("ContestList length is: {}", contentList.getLength());


                if(contentList.getLength() > 0){
                    contentSrc = contentList.item(0).getAttributes().getNamedItem("src").getTextContent();
                    //log.info("ContentSrc is : {}", contentSrc);
                }

                String index = String.valueOf(i);

                //log.info("Index is : {}", index);
                Map<String, String> tocMap = new HashMap<>();

                //Title index and path of the chapter
                tocMap.put("title", chapterTitle);
                tocMap.put("contentSrc", contentSrc);
                tocMap.put("index", index);
                tocList.add(tocMap);

            }
            response.put("toc", tocList);

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
            Document opfDocument;
            String opfFilePath;
            if(opfData.isPresent()){
                opfDocument = opfData.get().getOpfDocument();
                opfFilePath = opfData.get().getOpfFilePath();
            }
            else{
                log.error("Failed to receive OPFDocument");
                return response;
            }

            NodeList manifestItems;

            String tocHref = "";
            for( int i = 0; i < manifestItems.getLength(); i++){
                String mediaType = manifestItems.item(i).getAttributes().getNamedItem("media-type").getTextContent();
                //only our toc.ncx has this media type
                if(mediaType.equals("application/x-dtbncx+xml")){
                    tocHref = manifestItems.item(i).getAttributes().getNamedItem("href").getTextContent();
                    break;
                }
            }


            if(tocHref.isEmpty()){
                log.info("Could not find toc.ncx");
                //Do something
            }
            else {
            }

            //Have to fix the path as our chapterHref is giving a relative path to the OEBPS directory
            //ZipEntry needs path from the root of the Zip
            String chapterPath = "";
            if(Paths.get(opfFilePath).getParent() != null){
                chapterPath = Paths.get(opfFilePath).getParent().resolve(chapterHref).toString();
            }
            else{
                chapterPath = chapterHref;
            }



            //log.info("Our final chapter 1 path " + chapter1Path);

            //Need to replace all of our backslashes with forward ones in order for our ZipEntry class to work.
            chapterPath = chapterPath.replace("\\", "/");

            ZipEntry chapterZipEntry = zipFile.getEntry(chapterPath);
            //ZipEntry testPath = zipFile.getEntry("OEBPS/229714655232534212_11-h-1.htm.html");


            log.info(chapterZipEntry.toString());

            //Read the chapter file
            String chapter1ContentHTML = new String(zipFile.getInputStream(chapterZipEntry).readAllBytes(), StandardCharsets.UTF_8);
            //log.info(chapter1Content);
            chapterContent = Jsoup.parse(chapter1ContentHTML).text();
            response.put("chapterContent", chapterContent);

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
