import { cleanXmlContent } from './xmlCleaner.js';

describe('xmlCleaner', () => {
    describe('cleanXmlContent', () => {
        describe('invalid character removal', () => {
            it('should remove null bytes', () => {
                const input = 'Hello\x00World';
                const result = cleanXmlContent(input);
                expect(result).toBe('HelloWorld');
            });

            it('should remove all control characters in range 0x00-0x08', () => {
                const input = 'Test\x00\x01\x02\x03\x04\x05\x06\x07\x08Data';
                const result = cleanXmlContent(input);
                expect(result).toBe('TestData');
            });

            it('should remove vertical tab (0x0B)', () => {
                const input = 'Line1\x0BLine2';
                const result = cleanXmlContent(input);
                expect(result).toBe('Line1Line2');
            });

            it('should remove form feed (0x0C)', () => {
                const input = 'Page1\x0CPage2';
                const result = cleanXmlContent(input);
                expect(result).toBe('Page1Page2');
            });

            it('should remove control characters in range 0x0E-0x1F', () => {
                const input = 'Before\x0E\x0F\x10\x1F

After';
                const result = cleanXmlContent(input);
                expect(result).toBe('BeforeAfter');
            });

            it('should remove DEL character (0x7F)', () => {
                const input = 'Text\x7FData';
                const result = cleanXmlContent(input);
                expect(result).toBe('TextData');
            });

            it('should preserve newlines (0x0A)', () => {
                const input = 'Line1\nLine2';
                const result = cleanXmlContent(input);
                expect(result).toBe('Line1\nLine2');
            });

            it('should preserve carriage returns (0x0D)', () => {
                const input = 'Line1\rLine2';
                const result = cleanXmlContent(input);
                expect(result).toBe('Line1\rLine2');
            });

            it('should preserve tabs (0x09)', () => {
                const input = 'Column1\tColumn2';
                const result = cleanXmlContent(input);
                expect(result).toBe('Column1\tColumn2');
            });

            it('should handle multiple invalid characters in one string', () => {
                const input = 'Start\x00Middle\x0B\x0C\x1FEnd\x7F';
                const result = cleanXmlContent(input);
                expect(result).toBe('StartMiddleEnd');
            });
        });

        describe('ampersand escaping', () => {
            it('should escape unescaped ampersands', () => {
                const input = 'Sales & Marketing';
                const result = cleanXmlContent(input);
                expect(result).toBe('Sales &amp; Marketing');
            });

            it('should preserve &amp; entity', () => {
                const input = 'Sales &amp; Marketing';
                const result = cleanXmlContent(input);
                expect(result).toBe('Sales &amp; Marketing');
            });

            it('should preserve &lt; entity', () => {
                const input = 'Value &lt; 100';
                const result = cleanXmlContent(input);
                expect(result).toBe('Value &lt; 100');
            });

            it('should preserve &gt; entity', () => {
                const input = 'Value &gt; 100';
                const result = cleanXmlContent(input);
                expect(result).toBe('Value &gt; 100');
            });

            it('should preserve &quot; entity', () => {
                const input = 'Name is &quot;Test&quot;';
                const result = cleanXmlContent(input);
                expect(result).toBe('Name is &quot;Test&quot;');
            });

            it('should preserve &apos; entity', () => {
                const input = 'It&apos;s working';
                const result = cleanXmlContent(input);
                expect(result).toBe('It&apos;s working');
            });

            it('should preserve numeric character references (decimal)', () => {
                const input = 'Character &#65; here';
                const result = cleanXmlContent(input);
                expect(result).toBe('Character &#65; here');
            });

            it('should preserve numeric character references (hexadecimal)', () => {
                const input = 'Character &#x41; here';
                const result = cleanXmlContent(input);
                expect(result).toBe('Character &#x41; here');
            });

            it('should escape ampersands not part of entities', () => {
                const input = 'A & B & C &amp; D';
                const result = cleanXmlContent(input);
                expect(result).toBe('A &amp; B &amp; C &amp; D');
            });

            it('should escape multiple unescaped ampersands', () => {
                const input = 'One & Two & Three & Four';
                const result = cleanXmlContent(input);
                expect(result).toBe('One &amp; Two &amp; Three &amp; Four');
            });

            it('should handle complex mix of escaped and unescaped ampersands', () => {
                const input = 'Sales &amp; Marketing & Operations &lt; Finance & HR';
                const result = cleanXmlContent(input);
                expect(result).toBe('Sales &amp; Marketing &amp; Operations &lt; Finance &amp; HR');
            });

            it('should not double-escape already escaped ampersands', () => {
                const input = 'Test &amp;amp; Value';
                const result = cleanXmlContent(input);
                expect(result).toBe('Test &amp;amp; Value');
            });
        });

        describe('XML declaration removal', () => {
            it('should remove XML declaration', () => {
                const input = '<?xml version="1.0"?><root>content</root>';
                const result = cleanXmlContent(input);
                expect(result).toBe('<root>content</root>');
            });

            it('should remove XML declaration with encoding', () => {
                const input = '<?xml version="1.0" encoding="UTF-8"?><root>content</root>';
                const result = cleanXmlContent(input);
                expect(result).toBe('<root>content</root>');
            });

            it('should remove XML declaration with standalone attribute', () => {
                const input = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><root>content</root>';
                const result = cleanXmlContent(input);
                expect(result).toBe('<root>content</root>');
            });

            it('should handle XML declaration with whitespace', () => {
                const input = '<?xml version="1.0"?>  \n  <root>content</root>';
                const result = cleanXmlContent(input);
                expect(result).toBe('<root>content</root>');
            });

            it('should not affect content without XML declaration', () => {
                const input = '<root>content</root>';
                const result = cleanXmlContent(input);
                expect(result).toBe('<root>content</root>');
            });

            it('should not remove <?xml if not at start', () => {
                const input = '<root><?xml?></root>';
                const result = cleanXmlContent(input);
                expect(result).toBe('<root><?xml?></root>');
            });
        });

        describe('combined operations', () => {
            it('should apply all cleaning operations together', () => {
                const input = '<?xml version="1.0"?>\x00<root>Sales & Marketing\x0B contains \x7Fdata</root>';
                const result = cleanXmlContent(input);
                expect(result).toBe('<root>Sales &amp; Marketing contains data</root>');
            });

            it('should handle real-world Tableau XML', () => {
                const input = '<?xml version="1.0"?><workbook><datasource name="Sales & Profit\x00" caption="Main Data\x0C"><column name="[Sales]" caption="Sales &amp; Revenue" /></datasource></workbook>';
                const result = cleanXmlContent(input);
                expect(result).toBe('<workbook><datasource name="Sales &amp; Profit" caption="Main Data"><column name="[Sales]" caption="Sales &amp; Revenue" /></datasource></workbook>');
            });

            it('should handle malformed XML with multiple issues', () => {
                const input = '<?xml version="1.0"?>\x01\x02<data attr="A & B\x0B & C" value="Test\x7F &amp; Data\x00" />';
                const result = cleanXmlContent(input);
                expect(result).toBe('<data attr="A &amp; B &amp; C" value="Test &amp; Data" />');
            });
        });

        describe('edge cases', () => {
            it('should handle empty string', () => {
                const result = cleanXmlContent('');
                expect(result).toBe('');
            });

            it('should handle string with only whitespace', () => {
                const input = '   \n\t  ';
                const result = cleanXmlContent(input);
                expect(result).toBe('   \n\t  ');
            });

            it('should handle string with only invalid characters', () => {
                const input = '\x00\x01\x02\x7F';
                const result = cleanXmlContent(input);
                expect(result).toBe('');
            });

            it('should handle string with no issues', () => {
                const input = '<root><element>Clean XML content</element></root>';
                const result = cleanXmlContent(input);
                expect(result).toBe('<root><element>Clean XML content</element></root>');
            });

            it('should handle very long strings efficiently', () => {
                const longContent = 'A'.repeat(10000);
                const input = `<root>${longContent}</root>`;
                const result = cleanXmlContent(input);
                expect(result).toBe(input);
                expect(result.length).toBe(input.length);
            });

            it('should handle unicode characters', () => {
                const input = '<root>Hello 世界 🌍</root>';
                const result = cleanXmlContent(input);
                expect(result).toBe('<root>Hello 世界 🌍</root>');
            });

            it('should handle mixed content with unicode and invalid chars', () => {
                const input = '<root>Hello\x00 世界\x0B 🌍\x7F</root>';
                const result = cleanXmlContent(input);
                expect(result).toBe('<root>Hello 世界 🌍</root>');
            });
        });
    });
});
