import { buildWorkbookFieldContext } from '../../services/workbookFieldContext.js';

const XML = `<workbook>
  <datasources>
    <datasource caption='Orders' name='federated.orders'>
      <connection class='textscan'>
        <relation name='Orders'>
          <columns>
            <column datatype='string' name='Status' role='dimension' />
            <column datatype='string' name='FName' role='dimension' />
          </columns>
        </relation>
        <metadata-records>
          <metadata-record class='column'>
            <attribute name='embedded-connection'><![CDATA[<datasource></datasource>]]></attribute>
            <remote-name>raw_db_col</remote-name>
            <local-name>[Friendly Field]</local-name>
            <local-type>real</local-type>
          </metadata-record>
        </metadata-records>
      </connection>
      <column caption='Firstname' datatype='string' name='[FName]' role='dimension' />
      <column caption='Profit Ratio' datatype='real' name='[Calculation_1]' role='measure'>
        <calculation formula='SUM([Amount]) / 100' />
      </column>
      <column caption='Limit' datatype='integer' name='[Parameter 1]' param-domain-type='range'>
        <calculation formula='10' />
      </column>
    </datasource>
    <datasource caption='Returns' name='federated.returns'>
      <column datatype='integer' name='Status' role='measure' />
    </datasource>
  </datasources>
</workbook>`;

describe('buildWorkbookFieldContext', () => {
    const context = buildWorkbookFieldContext(XML, 'Book.twb', 'file:///workspace/Book.twb');

    it('preserves datasource identity when captions collide', () => {
        const statusFields = context.fields.filter(field => field.name === 'Status');
        expect(statusFields).toHaveLength(2);
        expect(statusFields.map(field => [field.datasource, field.datatype, field.role])).toEqual([
            ['Orders', 'string', 'dimension'],
            ['Returns', 'integer', 'measure'],
        ]);
        expect(statusFields[0].sourceLine).toBe(
            XML.split(/\r?\n/).findIndex(line => line.includes("datatype='string' name='Status'"))
        );
        expect(statusFields[1].sourceLine).toBe(
            XML.split(/\r?\n/).findIndex(line => line.includes("datatype='integer' name='Status'"))
        );
        expect(statusFields[0].sourceLine).not.toBe(statusFields[1].sourceLine);
    });

    it('flattens collisions without losing provenance for the LSP', () => {
        const status = context.definitions.find(field => field.name === 'Status');
        expect(status?.type).toBe('String | Number');
        expect(status?.datasource).toBe('Orders | Returns');
        expect(status?.description).toContain('Orders (string, dimension)');
        expect(status?.description).toContain('Returns (integer, measure)');
    });

    it('uses Tableau local-name instead of the physical remote-name', () => {
        expect(context.fields.some(field => field.name === 'Friendly Field')).toBe(true);
        expect(context.fields.some(field => field.name === 'raw_db_col')).toBe(false);
        const expectedLine = XML.split(/\r?\n/).findIndex(line => line.includes('<local-name>[Friendly Field]'));
        expect(context.definitions.find(field => field.name === 'Friendly Field')?.sourceLine)
            .toBe(expectedLine);
    });

    it('deduplicates a relation column against its captioned declaration', () => {
        const firstName = context.fields.filter(field =>
            field.name === 'Firstname' || field.internalName === 'FName'
        );
        expect(firstName).toHaveLength(1);
        expect(firstName[0].name).toBe('Firstname');
        const captionLine = XML.split(/\r?\n/).findIndex(line => line.includes("caption='Firstname'"));
        expect(context.definitions.find(field => field.name === 'Firstname')?.sourceLine)
            .toBe(captionLine);
    });

    it('classifies calculations and parameters and records source locations', () => {
        expect(context.fields.find(field => field.name === 'Profit Ratio')?.kind).toBe('calculation');
        expect(context.fields.find(field => field.name === 'Limit')?.kind).toBe('parameter');
        const status = context.definitions.find(field => field.name === 'Status');
        expect(status?.sourceUri).toBe('file:///workspace/Book.twb');
        expect(status?.sourceLine).toBeGreaterThanOrEqual(0);
    });
});
