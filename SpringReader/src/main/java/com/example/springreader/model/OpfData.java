package com.example.springreader.model;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.w3c.dom.Document;

@Getter
@RequiredArgsConstructor
public class OpfData {
    private final Document opfDocument;
    private final String opfFilePath;
}
