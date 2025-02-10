package com.example.springreader.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.w3c.dom.Document;

@Getter
@AllArgsConstructor
public class OpfData {
    private final Document opfDocument;
    private final String opfFilePath;

}
