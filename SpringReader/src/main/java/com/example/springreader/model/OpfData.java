package com.example.springreader.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import org.w3c.dom.Document;

@Data
@AllArgsConstructor
public class OpfData {
    private final Document opfDocument;
    private final String opfFilePath;

}
