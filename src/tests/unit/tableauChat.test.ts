import { buildWorkbookDigest } from '../../chat/workbookDigest.js';
import { TWB_AGENT_PRIMER } from '../../chat/twbPrimer.js';
import { composeTableauMessages, describeChatError } from '../../chat/tableauChatParticipant.js';

const FIXTURE = `<?xml version='1.0' encoding='utf-8' ?>
<workbook version='18.1'>
  <preferences />
  <datasources>
    <datasource caption='Sample' name='federated.abc'>
      <column caption='City' datatype='string' name='[City]' role='dimension' type='nominal' />
      <column caption='Salary' datatype='integer' name='[Salary]' role='measure' type='quantitative' />
      <column caption='Profit Ratio' datatype='real' name='[Calculation_100]' role='measure' type='quantitative'>
        <calculation class='tableau' formula='SUM([Salary])/100' />
      </column>
      <column caption='Double Ratio' datatype='real' name='[Calculation_200]' role='measure' type='quantitative'>
        <calculation class='tableau' formula='[Calculation_100]*2' />
      </column>
    </datasource>
  </datasources>
  <worksheets>
    <worksheet name='Border'>
      <table>
        <view />
        <style>
          <style-rule element='cell'>
            <format attr='border-style' value='solid' />
            <format attr='border-color' value='#000000' />
          </style-rule>
          <style-rule element='table-div'>
            <format attr='div-level' scope='rows' value='2' />
          </style-rule>
        </style>
        <panes>
          <pane>
            <style>
              <style-rule element='pane'>
                <format attr='minwidth' value='-1' />
              </style-rule>
            </style>
          </pane>
        </panes>
      </table>
    </worksheet>
    <worksheet name='Plain'>
      <table>
        <view />
        <panes />
      </table>
    </worksheet>
  </worksheets>
  <thumbnails>
    <thumbnail height='129' name='Border' width='192'>
      iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==
    </thumbnail>
  </thumbnails>
</workbook>`;

describe('buildWorkbookDigest — full digest', () => {
    const digest = buildWorkbookDigest(FIXTURE);

    it('lists every worksheet', () => {
        expect(digest).toContain('## Worksheets (2)');
        expect(digest).toContain('- Border');
        expect(digest).toContain('- Plain');
    });

    it('reports per-worksheet style rules with format details', () => {
        expect(digest).toContain('### Border');
        expect(digest).toContain('style-rule cell: border-style=solid, border-color=#000000');
        expect(digest).toContain('style-rule table-div: div-level (rows)=2');
    });

    it('marks style-less worksheets as inheriting defaults', () => {
        const plainSection = digest.slice(digest.indexOf('### Plain'));
        expect(plainSection).toContain('(no explicit style — inherits defaults)');
    });

    it('reports no workbook-level style for this fixture', () => {
        expect(digest).toContain('(none — worksheets inherit Tableau defaults)');
    });

    it('resolves calculation references to captions', () => {
        expect(digest).toContain('**Profit Ratio**');
        expect(digest).toContain('**Double Ratio**');
        expect(digest).toContain('[Profit Ratio]*2');
        expect(digest).not.toContain('[Calculation_100]*2');
    });

    it('lists datasource fields without treating calcs as fields', () => {
        expect(digest).toContain('- City (string, dimension)');
        expect(digest).toContain('- Salary (integer, measure)');
        const fieldsSection = digest.slice(digest.indexOf('## Datasource fields'), digest.indexOf('## Thumbnails'));
        expect(fieldsSection).not.toContain('Profit Ratio');
    });

    it('inventories thumbnails without leaking base64 payloads', () => {
        expect(digest).toContain('## Thumbnails (1)');
        expect(digest).toContain('- Border: 192x129');
        expect(digest).not.toContain('iVBORw0KGgo');
    });

    it('includes the formatting scan with strippable counts', () => {
        expect(digest).toMatch(/- borders: \d+ — .*solid/);
    });
});

describe('buildWorkbookDigest — focus modes', () => {
    it('borders focus keeps styles and drops calcs/fields/thumbnails', () => {
        const digest = buildWorkbookDigest(FIXTURE, 'borders');
        expect(digest).toContain('## Worksheet table styles');
        expect(digest).not.toContain('## Calculations');
        expect(digest).not.toContain('## Datasource fields');
        expect(digest).not.toContain('## Thumbnails');
    });

    it('calcs focus keeps only calculations', () => {
        const digest = buildWorkbookDigest(FIXTURE, 'calcs');
        expect(digest).toContain('## Calculations (2)');
        expect(digest).not.toContain('## Worksheet table styles');
        expect(digest).not.toContain('## Datasource fields');
    });

    it('fields focus keeps only fields', () => {
        const digest = buildWorkbookDigest(FIXTURE, 'fields');
        expect(digest).toContain('## Datasource fields (2)');
        expect(digest).not.toContain('## Calculations');
        expect(digest).not.toContain('## Worksheet table styles');
    });
});

describe('buildWorkbookDigest — caps', () => {
    it('truncates oversized digests with an explicit note', () => {
        const manySheets = Array.from({ length: 400 }, (_, i) =>
            `<worksheet name='Sheet ${i}'><table><view /><style><style-rule element='cell'><format attr='border-style' value='solid' /></style-rule></style></table></worksheet>`
        ).join('\n');
        const xml = `<workbook><worksheets>${manySheets}</worksheets></workbook>`;
        const digest = buildWorkbookDigest(xml);
        expect(digest.length).toBeLessThan(12300);
        expect(digest).toContain('[digest truncated at 12k chars');
    });
});

describe('TWB_AGENT_PRIMER', () => {
    it('contains every required instruction section', () => {
        for (const tag of ['<role>', '<twb_anatomy>', '<border_model>', '<calculations>', '<thumbnails>', '<edit_guidance>', '<answer_rules>']) {
            expect(TWB_AGENT_PRIMER).toContain(tag);
        }
    });

    it('states the inheritance rule and neutralise-not-delete guidance', () => {
        expect(TWB_AGENT_PRIMER).toContain('Absence of a node never means "no border"');
        expect(TWB_AGENT_PRIMER).toMatch(/NEUTRALISE borders/);
    });
});

describe('composeTableauMessages', () => {
    it('puts the primer and digest in the context message and the prompt in the question', () => {
        const { context, question } = composeTableauMessages(FIXTURE, 'What borders does Border have?');
        expect(context.startsWith('<TABLEAU_AGENT_INSTRUCTION>')).toBe(true);
        expect(context).toContain('# Workbook digest');
        expect(context).toContain('border-style=solid');
        expect(question).toBe('What borders does Border have?');
    });

    it('uses the command default question when the prompt is empty', () => {
        const { question } = composeTableauMessages(FIXTURE, '  ', 'borders');
        expect(question).toContain('border and divider setting');
    });

    it('falls back to an overview question with no prompt and no command', () => {
        const { question } = composeTableauMessages(FIXTURE, '');
        expect(question).toBe('Give me an overview of this workbook.');
    });

    it('narrows the digest when a known command is given', () => {
        const { context } = composeTableauMessages(FIXTURE, '', 'calcs');
        expect(context).toContain('## Calculations');
        expect(context).not.toContain('## Thumbnails');
    });

    it('ignores unknown commands rather than throwing', () => {
        const { context } = composeTableauMessages(FIXTURE, 'hi', 'bogus');
        expect(context).toContain('## Thumbnails');
    });
});

describe('describeChatError', () => {
    it('maps missing-model errors to the Copilot-required message', () => {
        expect(describeChatError({ code: 'NotFound' })).toContain('Copilot subscription');
    });

    it('maps blocked requests to the policy message', () => {
        expect(describeChatError({ code: 'Blocked' })).toContain('declined');
    });

    it('falls back to the error message text', () => {
        expect(describeChatError(new Error('boom'))).toContain('boom');
    });
});
