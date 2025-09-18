// src/tests/performance/comprehensivePerformanceTests.test.ts

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Range } from 'vscode-languageserver';
import { performance } from 'perf_hooks';
import { parseDocument } from '../../documentModel';
import { getDiagnostics } from '../../diagnosticsProvider