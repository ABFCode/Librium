package com.example.springreader.model;

import org.w3c.dom.Document;

/**
 * Represents our OPFDocument
 * @param opfDocument - The document itself
 * @param opfFilePath - It's file path
 */
public record OpfData(Document opfDocument, String opfFilePath){}