jest.mock('../../../src/config/database', () => ({
    __esModule: true,
    default: require('../helpers/prismaMock').prisma,
}));

const { buildPdf } = require('../../../src/services/certificateService');

// The certificate is a hand-built PDF, so check it is structurally valid:
// readers locate objects through the byte offsets in the xref table.
describe('buildPdf', () => {
    const text = (pdf) => pdf.toString('latin1');

    it('produces a PDF whose startxref points at its xref table', () => {
        const pdf = buildPdf([
            { text: 'CERTIFICATE OF ACHIEVEMENT', size: 26, y: 670 },
        ]);

        expect(text(pdf)).toMatch(/^%PDF-1\.4\n/);
        expect(text(pdf)).toMatch(/%%EOF$/);
        const start = Number(text(pdf).match(/startxref\n(\d+)/)[1]);
        expect(pdf.subarray(start, start + 4).toString()).toBe('xref');
    });

    it('records the true byte offset of every object', () => {
        const pdf = buildPdf([{ text: 'Awarded to', size: 16, y: 575 }]);
        const offsets = [...text(pdf).matchAll(/^(\d{10}) 00000 n $/gm)].map(
            (m) => Number(m[1])
        );

        expect(offsets).toHaveLength(5);
        offsets.forEach((offset, i) => {
            expect(pdf.subarray(offset, offset + 8).toString()).toBe(
                `${i + 1} 0 obj\n`
            );
        });
    });

    it('escapes characters that would end a PDF string early', () => {
        const pdf = buildPdf([{ text: "Name (O'Neil) \\", size: 16, y: 500 }]);
        expect(text(pdf)).toContain("(Name \\(O'Neil\\) \\\\) Tj");
    });

    it("replaces characters the built-in font can't draw, keeping the letters", () => {
        const pdf = buildPdf([{ text: 'Zoë Nkosi', size: 16, y: 500 }]);
        expect(text(pdf)).toContain('(Zoe  Nkosi) Tj');
    });

    it('cuts very long lines so they stay on the page', () => {
        const pdf = buildPdf([{ text: 'x'.repeat(300), size: 12, y: 300 }]);
        expect(text(pdf)).toContain(`(${'x'.repeat(100)}) Tj`);
    });
});
