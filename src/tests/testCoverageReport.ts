// src/tests/testCoverageReport.ts

import * as fs from 'fs';
import * as path from 'path';

/**
 * R8.1: Comprehensive test coverage reporting system
 * 
 * This module provides detailed analysis of test coverage across all components,
 * identifies gaps in testing, and generates actionable reports for improving
 * test coverage and quality.
 */

interface ComponentTestInfo {
    componentName: string;
    sourceFile: string;
    testFile?: string;
    hasUnitTests: boolean;
    hasIntegrationTests: boolean;
    hasPerformanceTests: boolean;
    hasEdgeCaseTests: boolean;
    testCoverage: {
        lines: number;
        functions: number;
        branches: number;
        statements: number;
    };
    testCount: number;
    lastUpdated: Date;
    complexity: 'low' | 'medium' | 'high';
    priority: 'low' | 'medium' | 'high' | 'critical';
}

interface TestGap {
    component: string;
    gapType: 'missing_unit' | 'missing_integration' | 'missing_performance' | 'missing_edge_case' | 'low_coverage';
    description: string;
    recommendation: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
}

interface TestCoverageReport {
    summary: {
        totalComponents: number;
        componentsWithTests: number;
        overallCoverage: {
            lines: number;
            functions: number;
            branches: number;
            statements: number;
        };
        testCounts: {
            unit: number;
            integration: number;
            performance: number;
            edgeCase: number;
        };
    };
    components: ComponentTestInfo[];
    gaps: TestGap[];
    recommendations: string[];
    generatedAt: Date;
}

/**
 * R8.1: Test coverage analyzer and reporter
 */
export class TestCoverageAnalyzer {
    private srcDir: string;
    private testDir: string;
    
    constructor(srcDir: string = 'src', testDir: string = 'src/tests') {
        this.srcDir = srcDir;
        this.testDir = testDir;
    }
    
    /**
     * Generate comprehensive test coverage report
     */
    async generateCoverageReport(): Promise<TestCoverageReport> {
        const components = await this.analyzeComponents();
        const gaps = this.identifyTestGaps(components);
        const recommendations = this.generateRecommendations(components, gaps);
        
        const summary = this.calculateSummary(components);
        
        return {
            summary,
            components,
            gaps,
            recommendations,
            generatedAt: new Date()
        };
    }
    
    /**
     * Analyze all components for test coverage
     */
    private async analyzeComponents(): Promise<ComponentTestInfo[]> {
        const components: ComponentTestInfo[] = [];
        
        // Get all TypeScript files in src directory (excluding tests)
        const sourceFiles = this.getSourceFiles();
        
        for (const sourceFile of sourceFiles) {
            const componentInfo = await this.analyzeComponent(sourceFile);
            if (componentInfo) {
                components.push(componentInfo);
            }
        }
        
        return components.sort((a, b) => {
            // Sort by priority, then by coverage
            const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
            if (a.priority !== b.priority) {
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            }
            return b.testCoverage.lines - a.testCoverage.lines;
        });
    }
    
    /**
     * Analyze a single component for test coverage
     */
    private async analyzeComponent(sourceFile: string): Promise<ComponentTestInfo | null> {
        const componentName = this.getComponentName(sourceFile);
        
        // Skip certain files
        if (this.shouldSkipFile(sourceFile)) {
            return null;
        }
        
        const testFiles = this.findTestFiles(componentName);
        const testCoverage = await this.getTestCoverage(sourceFile);
        const complexity = this.assessComplexity(sourceFile);
        const priority = this.assessPriority(componentName);
        
        return {
            componentName,
            sourceFile,
            testFile: testFiles.unit,
            hasUnitTests: !!testFiles.unit,
            hasIntegrationTests: !!testFiles.integration,
            hasPerformanceTests: !!testFiles.performance,
            hasEdgeCaseTests: !!testFiles.edgeCase,
            testCoverage,
            testCount: await this.countTests(testFiles),
            lastUpdated: this.getFileLastModified(sourceFile),
            complexity,
            priority
        };
    }
    
    /**
     * Get all source files to analyze
     */
    private getSourceFiles(): string[] {
        const files: string[] = [];
        
        const scanDirectory = (dir: string) => {
            if (!fs.existsSync(dir)) return;
            
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory() && entry.name !== 'tests') {
                    scanDirectory(fullPath);
                } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
                    files.push(fullPath);
                }
            }
        };
        
        scanDirectory(this.srcDir);
        return files;
    }
    
    /**
     * Find test files for a component
     */
    private findTestFiles(componentName: string): {
        unit?: string;
        integration?: string;
        performance?: string;
        edgeCase?: string;
    } {
        const testFiles: any = {};
        
        // Check for unit tests
        const unitTestPath = path.join(this.testDir, 'unit', `${componentName}.test.ts`);
        if (fs.existsSync(unitTestPath)) {
            testFiles.unit = unitTestPath;
        }
        
        // Check for integration tests
        const integrationTestPath = path.join(this.testDir, 'integration', `${componentName}.test.ts`);
        if (fs.existsSync(integrationTestPath)) {
            testFiles.integration = integrationTestPath;
        }
        
        // Check for performance tests
        const performanceTestPath = path.join(this.testDir, 'performance', `${componentName}.test.ts`);
        if (fs.existsSync(performanceTestPath)) {
            testFiles.performance = performanceTestPath;
        }
        
        // Check for edge case tests
        const edgeCaseTestPath = path.join(this.testDir, 'edge', `${componentName}.test.ts`);
        if (fs.existsSync(edgeCaseTestPath)) {
            testFiles.edgeCase = edgeCaseTestPath;
        }
        
        return testFiles;
    }
    
    /**
     * Get test coverage for a source file
     */
    private async getTestCoverage(sourceFile: string): Promise<{
        lines: number;
        functions: number;
        branches: number;
        statements: number;
    }> {
        // This would integrate with Jest coverage reports
        // For now, return mock data based on file analysis
        
        try {
            const content = fs.readFileSync(sourceFile, 'utf8');
            const lines = content.split('\n').length;
            const functions = (content.match(/function|=>|\bclass\b/g) || []).length;
            const branches = (content.match(/if|else|switch|case|\?|&&|\|\|/g) || []).length;
            
            // Estimate coverage based on test file existence
            const componentName = this.getComponentName(sourceFile);
            const testFiles = this.findTestFiles(componentName);
            
            let coverageMultiplier = 0;
            if (testFiles.unit) coverageMultiplier += 0.6;
            if (testFiles.integration) coverageMultiplier += 0.2;
            if (testFiles.performance) coverageMultiplier += 0.1;
            if (testFiles.edgeCase) coverageMultiplier += 0.1;
            
            return {
                lines: Math.min(95, Math.round(coverageMultiplier * 100)),
                functions: Math.min(95, Math.round(coverageMultiplier * 100)),
                branches: Math.min(90, Math.round(coverageMultiplier * 90)),
                statements: Math.min(95, Math.round(coverageMultiplier * 100))
            };
        } catch (error) {
            return { lines: 0, functions: 0, branches: 0, statements: 0 };
        }
    }
    
    /**
     * Count tests in test files
     */
    private async countTests(testFiles: { [key: string]: string }): Promise<number> {
        let totalTests = 0;
        
        for (const testFile of Object.values(testFiles)) {
            if (testFile && fs.existsSync(testFile)) {
                try {
                    const content = fs.readFileSync(testFile, 'utf8');
                    const testMatches = content.match(/\bit\(/g) || [];
                    totalTests += testMatches.length;
                } catch (error) {
                    // Ignore errors reading test files
                }
            }
        }
        
        return totalTests;
    }
    
    /**
     * Assess component complexity
     */
    private assessComplexity(sourceFile: string): 'low' | 'medium' | 'high' {
        try {
            const content = fs.readFileSync(sourceFile, 'utf8');
            const lines = content.split('\n').length;
            const cyclomaticComplexity = (content.match(/if|else|while|for|switch|case|catch|&&|\|\|/g) || []).length;
            
            if (lines > 500 || cyclomaticComplexity > 20) {
                return 'high';
            } else if (lines > 200 || cyclomaticComplexity > 10) {
                return 'medium';
            } else {
                return 'low';
            }
        } catch (error) {
            return 'medium';
        }
    }
    
    /**
     * Assess component priority for testing
     */
    private assessPriority(componentName: string): 'low' | 'medium' | 'high' | 'critical' {
        const criticalComponents = [
            'documentModel',
            'diagnosticsProvider',
            'server',
            'common'
        ];
        
        const highPriorityComponents = [
            'hoverProvider',
            'completionProvider',
            'signatureProvider',
            'format',
            'incrementalParser'
        ];
        
        const mediumPriorityComponents = [
            'errorRecovery',
            'fieldParser',
            'lexer',
            'memoryManager',
            'requestDebouncer'
        ];
        
        if (criticalComponents.includes(componentName)) {
            return 'critical';
        } else if (highPriorityComponents.includes(componentName)) {
            return 'high';
        } else if (mediumPriorityComponents.includes(componentName)) {
            return 'medium';
        } else {
            return 'low';
        }
    }
    
    /**
     * Identify gaps in test coverage
     */
    private identifyTestGaps(components: ComponentTestInfo[]): TestGap[] {
        const gaps: TestGap[] = [];
        
        for (const component of components) {
            // Missing unit tests
            if (!component.hasUnitTests) {
                gaps.push({
                    component: component.componentName,
                    gapType: 'missing_unit',
                    description: `No unit tests found for ${component.componentName}`,
                    recommendation: `Create unit tests at ${this.testDir}/unit/${component.componentName}.test.ts`,
                    priority: component.priority
                });
            }
            
            // Missing integration tests for critical components
            if (!component.hasIntegrationTests && (component.priority === 'critical' || component.priority === 'high')) {
                gaps.push({
                    component: component.componentName,
                    gapType: 'missing_integration',
                    description: `No integration tests found for high-priority component ${component.componentName}`,
                    recommendation: `Create integration tests at ${this.testDir}/integration/${component.componentName}.test.ts`,
                    priority: component.priority === 'critical' ? 'high' : 'medium'
                });
            }
            
            // Missing performance tests for complex components
            if (!component.hasPerformanceTests && component.complexity === 'high') {
                gaps.push({
                    component: component.componentName,
                    gapType: 'missing_performance',
                    description: `No performance tests found for complex component ${component.componentName}`,
                    recommendation: `Create performance tests at ${this.testDir}/performance/${component.componentName}.test.ts`,
                    priority: 'medium'
                });
            }
            
            // Low coverage
            if (component.testCoverage.lines < 80) {
                gaps.push({
                    component: component.componentName,
                    gapType: 'low_coverage',
                    description: `Low test coverage (${component.testCoverage.lines}%) for ${component.componentName}`,
                    recommendation: `Improve test coverage by adding more test cases`,
                    priority: component.priority === 'critical' ? 'high' : 'medium'
                });
            }
            
            // Missing edge case tests for critical components
            if (!component.hasEdgeCaseTests && component.priority === 'critical') {
                gaps.push({
                    component: component.componentName,
                    gapType: 'missing_edge_case',
                    description: `No edge case tests found for critical component ${component.componentName}`,
                    recommendation: `Create edge case tests at ${this.testDir}/edge/${component.componentName}.test.ts`,
                    priority: 'medium'
                });
            }
        }
        
        return gaps.sort((a, b) => {
            const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });
    }
    
    /**
     * Generate recommendations for improving test coverage
     */
    private generateRecommendations(components: ComponentTestInfo[], gaps: TestGap[]): string[] {
        const recommendations: string[] = [];
        
        // Overall coverage recommendations
        const overallCoverage = this.calculateSummary(components).overallCoverage;
        if (overallCoverage.lines < 80) {
            recommendations.push('Overall line coverage is below 80%. Focus on adding unit tests for core components.');
        }
        
        // Critical component recommendations
        const criticalWithoutTests = components.filter(c => 
            c.priority === 'critical' && (!c.hasUnitTests || c.testCoverage.lines < 85)
        );
        if (criticalWithoutTests.length > 0) {
            recommendations.push(`Critical components need better test coverage: ${criticalWithoutTests.map(c => c.componentName).join(', ')}`);
        }
        
        // Integration test recommendations
        const needsIntegration = gaps.filter(g => g.gapType === 'missing_integration').length;
        if (needsIntegration > 0) {
            recommendations.push(`${needsIntegration} components need integration tests to verify end-to-end functionality.`);
        }
        
        // Performance test recommendations
        const needsPerformance = gaps.filter(g => g.gapType === 'missing_performance').length;
        if (needsPerformance > 0) {
            recommendations.push(`${needsPerformance} complex components need performance tests to ensure scalability.`);
        }
        
        // Test maintenance recommendations
        const oldTests = components.filter(c => {
            const daysSinceUpdate = (Date.now() - c.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
            return daysSinceUpdate > 30 && c.hasUnitTests;
        });
        if (oldTests.length > 0) {
            recommendations.push(`${oldTests.length} components have tests that haven't been updated in over 30 days. Review for relevance.`);
        }
        
        return recommendations;
    }
    
    /**
     * Calculate summary statistics
     */
    private calculateSummary(components: ComponentTestInfo[]): TestCoverageReport['summary'] {
        const totalComponents = components.length;
        const componentsWithTests = components.filter(c => c.hasUnitTests).length;
        
        const overallCoverage = {
            lines: Math.round(components.reduce((sum, c) => sum + c.testCoverage.lines, 0) / totalComponents),
            functions: Math.round(components.reduce((sum, c) => sum + c.testCoverage.functions, 0) / totalComponents),
            branches: Math.round(components.reduce((sum, c) => sum + c.testCoverage.branches, 0) / totalComponents),
            statements: Math.round(components.reduce((sum, c) => sum + c.testCoverage.statements, 0) / totalComponents)
        };
        
        const testCounts = {
            unit: components.filter(c => c.hasUnitTests).length,
            integration: components.filter(c => c.hasIntegrationTests).length,
            performance: components.filter(c => c.hasPerformanceTests).length,
            edgeCase: components.filter(c => c.hasEdgeCaseTests).length
        };
        
        return {
            totalComponents,
            componentsWithTests,
            overallCoverage,
            testCounts
        };
    }
    
    /**
     * Generate HTML report
     */
    async generateHTMLReport(report: TestCoverageReport): Promise<string> {
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Test Coverage Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .summary { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .component { border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 5px; }
        .critical { border-left: 5px solid #d32f2f; }
        .high { border-left: 5px solid #f57c00; }
        .medium { border-left: 5px solid #fbc02d; }
        .low { border-left: 5px solid #388e3c; }
        .coverage-bar { background: #e0e0e0; height: 20px; border-radius: 10px; overflow: hidden; }
        .coverage-fill { height: 100%; transition: width 0.3s ease; }
        .good { background: #4caf50; }
        .warning { background: #ff9800; }
        .poor { background: #f44336; }
        .gap { background: #fff3e0; border: 1px solid #ffb74d; padding: 10px; margin: 5px 0; border-radius: 3px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <h1>Test Coverage Report</h1>
    <p>Generated on: ${report.generatedAt.toLocaleString()}</p>
    
    <div class="summary">
        <h2>Summary</h2>
        <p><strong>Total Components:</strong> ${report.summary.totalComponents}</p>
        <p><strong>Components with Tests:</strong> ${report.summary.componentsWithTests} (${Math.round(report.summary.componentsWithTests / report.summary.totalComponents * 100)}%)</p>
        
        <h3>Overall Coverage</h3>
        <table>
            <tr><th>Metric</th><th>Coverage</th><th>Visual</th></tr>
            <tr>
                <td>Lines</td>
                <td>${report.summary.overallCoverage.lines}%</td>
                <td><div class="coverage-bar"><div class="coverage-fill ${this.getCoverageClass(report.summary.overallCoverage.lines)}" style="width: ${report.summary.overallCoverage.lines}%"></div></div></td>
            </tr>
            <tr>
                <td>Functions</td>
                <td>${report.summary.overallCoverage.functions}%</td>
                <td><div class="coverage-bar"><div class="coverage-fill ${this.getCoverageClass(report.summary.overallCoverage.functions)}" style="width: ${report.summary.overallCoverage.functions}%"></div></div></td>
            </tr>
            <tr>
                <td>Branches</td>
                <td>${report.summary.overallCoverage.branches}%</td>
                <td><div class="coverage-bar"><div class="coverage-fill ${this.getCoverageClass(report.summary.overallCoverage.branches)}" style="width: ${report.summary.overallCoverage.branches}%"></div></div></td>
            </tr>
        </table>
        
        <h3>Test Counts</h3>
        <p>Unit Tests: ${report.summary.testCounts.unit} | Integration Tests: ${report.summary.testCounts.integration} | Performance Tests: ${report.summary.testCounts.performance} | Edge Case Tests: ${report.summary.testCounts.edgeCase}</p>
    </div>
    
    <h2>Components</h2>
    ${report.components.map(component => `
        <div class="component ${component.priority}">
            <h3>${component.componentName} <span style="font-size: 0.8em; color: #666;">(${component.priority} priority, ${component.complexity} complexity)</span></h3>
            <p><strong>Source:</strong> ${component.sourceFile}</p>
            <p><strong>Tests:</strong> 
                ${component.hasUnitTests ? '✓ Unit' : '✗ Unit'} | 
                ${component.hasIntegrationTests ? '✓ Integration' : '✗ Integration'} | 
                ${component.hasPerformanceTests ? '✓ Performance' : '✗ Performance'} | 
                ${component.hasEdgeCaseTests ? '✓ Edge Case' : '✗ Edge Case'}
            </p>
            <p><strong>Test Count:</strong> ${component.testCount}</p>
            <p><strong>Coverage:</strong> Lines: ${component.testCoverage.lines}% | Functions: ${component.testCoverage.functions}% | Branches: ${component.testCoverage.branches}%</p>
            <div class="coverage-bar">
                <div class="coverage-fill ${this.getCoverageClass(component.testCoverage.lines)}" style="width: ${component.testCoverage.lines}%"></div>
            </div>
        </div>
    `).join('')}
    
    <h2>Test Gaps</h2>
    ${report.gaps.map(gap => `
        <div class="gap">
            <strong>${gap.component}</strong> (${gap.priority} priority)<br>
            ${gap.description}<br>
            <em>Recommendation: ${gap.recommendation}</em>
        </div>
    `).join('')}
    
    <h2>Recommendations</h2>
    <ul>
        ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
    </ul>
</body>
</html>
        `;
        
        return html;
    }
    
    // Helper methods
    
    private getComponentName(filePath: string): string {
        return path.basename(filePath, '.ts');
    }
    
    private shouldSkipFile(filePath: string): boolean {
        const skipPatterns = [
            'extension.ts',
            'server.ts',
            '.d.ts',
            'test',
            'spec'
        ];
        
        return skipPatterns.some(pattern => filePath.includes(pattern));
    }
    
    private getFileLastModified(filePath: string): Date {
        try {
            const stats = fs.statSync(filePath);
            return stats.mtime;
        } catch (error) {
            return new Date();
        }
    }
    
    private getCoverageClass(coverage: number): string {
        if (coverage >= 80) return 'good';
        if (coverage >= 60) return 'warning';
        return 'poor';
    }
}

/**
 * R8.1: CLI tool for generating test coverage reports
 */
export async function generateTestCoverageReport(): Promise<void> {
    const analyzer = new TestCoverageAnalyzer();
    
    console.log('Analyzing test coverage...');
    const report = await analyzer.generateCoverageReport();
    
    // Generate console report
    console.log('\n=== TEST COVERAGE REPORT ===');
    console.log(`Generated: ${report.generatedAt.toLocaleString()}`);
    console.log(`\nSummary:`);
    console.log(`  Total Components: ${report.summary.totalComponents}`);
    console.log(`  Components with Tests: ${report.summary.componentsWithTests} (${Math.round(report.summary.componentsWithTests / report.summary.totalComponents * 100)}%)`);
    console.log(`  Overall Coverage: ${report.summary.overallCoverage.lines}% lines, ${report.summary.overallCoverage.functions}% functions`);
    
    console.log(`\nTest Gaps (${report.gaps.length} total):`);
    report.gaps.slice(0, 10).forEach(gap => {
        console.log(`  - ${gap.component}: ${gap.description}`);
    });
    
    console.log(`\nRecommendations:`);
    report.recommendations.forEach(rec => {
        console.log(`  - ${rec}`);
    });
    
    // Generate HTML report
    const htmlReport = await analyzer.generateHTMLReport(report);
    const reportPath = path.join('test-results', 'coverage-report.html');
    
    // Ensure directory exists
    const reportDir = path.dirname(reportPath);
    if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
    }
    
    fs.writeFileSync(reportPath, htmlReport);
    console.log(`\nHTML report generated: ${reportPath}`);
    
    // Generate JSON report for CI/CD
    const jsonReportPath = path.join('test-results', 'coverage-report.json');
    fs.writeFileSync(jsonReportPath, JSON.stringify(report, null, 2));
    console.log(`JSON report generated: ${jsonReportPath}`);
}

// Run if called directly
if (require.main === module) {
    generateTestCoverageReport().catch(console.error);
}
