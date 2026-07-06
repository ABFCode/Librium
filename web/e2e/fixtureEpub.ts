import { zipSync, strToU8 } from 'fflate'

// Minimal valid EPUB 3 built in-memory: 3 chapters with enough prose to
// scroll, plus an italics run that guards the parser's whitespace handling.
export function buildFixtureEpub(title = 'E2E Fixture') {
  const chapter = (heading: string, body: string) =>
    `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${heading}</title></head><body><h1>${heading}</h1>${body}</body></html>`
  const para = (text: string) => `<p>${text}</p>`

  const chapters: Array<[string, string, string]> = [
    [
      'c1',
      'Chapter I. The Fixture Begins',
      para('She said, "what <em>are</em> you doing out here?"') +
        Array.from({ length: 30 }, (_, i) =>
          para(
            `Chapter one, paragraph ${i + 2}. Steady prose to give the reader room to scroll, line after line after line.`,
          ),
        ).join(''),
    ],
    [
      'c2',
      'Chapter II. The Middle',
      Array.from({ length: 30 }, (_, i) =>
        para(
          `Chapter two, paragraph ${i + 1}. The unique phrase xylophone-harvest lives in paragraph seven.`.replace(
            'xylophone-harvest lives in paragraph seven',
            i === 6
              ? 'xylophone-harvest lives right here'
              : 'nothing special lives here',
          ),
        ),
      ).join(''),
    ],
    [
      'c3',
      'Chapter III. The End',
      Array.from({ length: 20 }, (_, i) =>
        para(`Chapter three, paragraph ${i + 1}. Winding down now.`),
      ).join(''),
    ],
  ]

  const manifest = chapters
    .map(
      ([id]) =>
        `<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`,
    )
    .join('')
  const spine = chapters.map(([id]) => `<itemref idref="${id}"/>`).join('')
  const navList = chapters
    .map(([id, heading]) => `<li><a href="${id}.xhtml">${heading}</a></li>`)
    .join('')

  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(
      '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
    'OEBPS/content.opf': strToU8(
      `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:uuid:e2e-fixture</dc:identifier><dc:title>${title}</dc:title><dc:creator>E2E</dc:creator><dc:language>en</dc:language><meta property="dcterms:modified">2026-01-01T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${manifest}</manifest><spine>${spine}</spine></package>`,
    ),
    'OEBPS/nav.xhtml': strToU8(
      `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><h1>Contents</h1><ol>${navList}</ol></nav></body></html>`,
    ),
  }
  for (const [id, heading, body] of chapters) {
    files[`OEBPS/${id}.xhtml`] = strToU8(chapter(heading, body))
  }
  return Buffer.from(zipSync(files))
}
