import { extractFieldsFromXml } from '../../extract/xml.js';

const XML = `<?xml version='1.0' encoding='utf-8' ?>
<workbook version='18.1'>
  <datasources>
    <datasource caption='Sample' name='federated.abc'>
      <column datatype='string' name='Name' ordinal='0' />
      <column datatype='table' name='[__tableau_internal_object_id__].[X]' role='measure' />
      <column caption='City' datatype='string' name='[City]' role='dimension' type='nominal' />
      <column caption='MaxRows' datatype='integer' name='[Parameter 1]' param-domain-type='range' role='measure' value='500'>
        <calculation class='tableau' formula='500' />
      </column>
      <column caption='Profit Ratio' datatype='real' name='[Calculation_100]' role='measure'>
        <calculation class='tableau' formula='SUM([Salary])/100' />
      </column>
    </datasource>
  </datasources>
</workbook>`;

describe('extractFieldsFromXml — calculation and parameter flags', () => {
    const fields = extractFieldsFromXml(XML, 'test.twb');

    it('flags columns with a calculation child', () => {
        const calc = fields.find(f => f.caption === 'Profit Ratio');
        expect(calc?.isCalculation).toBe(true);
    });

    it('flags parameter columns', () => {
        const param = fields.find(f => f.caption === 'MaxRows');
        expect(param?.isParameter).toBe(true);
        expect(param?.isCalculation).toBe(true); // parameters carry a default-value calculation
    });

    it('leaves plain fields unflagged', () => {
        const name = fields.find(f => f.name === 'Name');
        expect(name?.isCalculation).toBe(false);
        expect(name?.isParameter).toBe(false);
        const city = fields.find(f => f.caption === 'City');
        expect(city?.isCalculation).toBe(false);
        expect(city?.isParameter).toBe(false);
    });

    it('attributes every field to its datasource caption', () => {
        expect(new Set(fields.map(f => f.datasource))).toEqual(new Set(['Sample']));
    });
});

const NESTED_XML = `<?xml version='1.0' encoding='utf-8' ?>
<workbook version='18.1'>
  <datasources>
    <datasource caption='Nested' name='federated.xyz'>
      <connection class='federated'>
        <_.fcp.ObjectModelEncapsulateLegacy.false...relation connection='excel.0' name='Data' table='[Data$]' type='table'>
          <columns header='yes'>
            <column datatype='string' name='Name' ordinal='0' />
            <column datatype='integer' name='Age' ordinal='1' />
          </columns>
        </_.fcp.ObjectModelEncapsulateLegacy.false...relation>
        <metadata-records>
          <metadata-record class='column'>
            <remote-name>Region</remote-name>
            <local-name>[Region]</local-name>
            <local-type>string</local-type>
          </metadata-record>
          <metadata-record class='column'>
            <remote-name>Name</remote-name>
            <local-name>[Name]</local-name>
            <local-type>string</local-type>
          </metadata-record>
        </metadata-records>
      </connection>
      <column caption='Age Renamed' datatype='integer' name='[Age]' role='dimension' />
    </datasource>
  </datasources>
</workbook>`;

describe('extractFieldsFromXml — nested relation columns and metadata fallback', () => {
    const fields = extractFieldsFromXml(NESTED_XML, 'nested.twb');
    const names = fields.map(f => f.caption ?? f.name);

    it('collects columns nested inside FCP-mangled relation tags', () => {
        expect(names).toContain('Name');
    });

    it('prefers the captioned declaration when a field is declared twice', () => {
        const age = fields.filter(f => f.name.toLowerCase() === 'age');
        expect(age).toHaveLength(1);
        expect(age[0].caption).toBe('Age Renamed');
    });

    it('fills in metadata-record-only fields without duplicating column fields', () => {
        expect(names).toContain('Region');
        expect(fields.filter(f => f.name.toLowerCase() === 'name')).toHaveLength(1);
    });
});

it('keeps Tableau local-name when metadata remote-name is a physical column name', () => {
    const xml = `<workbook><datasources><datasource caption='DS'>
      <metadata-records><metadata-record class='column'>
        <remote-name>raw_db_col</remote-name>
        <local-name>[Friendly Field]</local-name>
        <local-type>real</local-type>
      </metadata-record></metadata-records>
    </datasource></datasources></workbook>`;

    const fields = extractFieldsFromXml(xml, 'metadata.twb');
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe('Friendly Field');
    expect(fields[0].caption).toBeUndefined();
});

it('extracts metadata-only measures as fields with a measure role', () => {
    const xml = `<workbook><datasources><datasource caption='DS'>
      <metadata-records><metadata-record class='measure'>
        <remote-name>Total Sales</remote-name>
        <local-name>[Total Sales]</local-name>
        <local-type>real</local-type>
      </metadata-record></metadata-records>
    </datasource></datasources></workbook>`;

    const fields = extractFieldsFromXml(xml, 'measure.twb');
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
        name: 'Total Sales',
        datatype: 'real',
        role: 'measure',
    });
});
