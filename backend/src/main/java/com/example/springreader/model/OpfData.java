package com.example.springreader.model;

import org.w3c.dom.Document;

/**
 * Represents the parsed data from an EPUB's OPF file.
 * This includes the parsed XML document and path information needed to resolve relative paths within the EPUB.
 *
 * @param opfDocument The parsed XML Doc object representing the OPF file content.
 * @param opfFilePath The path to the OPF file within the EPUB archive.
 * @param opfParent   The parent directory path of the OPF file within the EPUB archive, used for resolving relative paths.
 */
public record OpfData(Document opfDocument, String opfFilePath, String opfParent) {}