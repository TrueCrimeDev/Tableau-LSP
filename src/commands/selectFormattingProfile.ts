import * as vscode from 'vscode';

interface FormattingProfilePick extends vscode.QuickPickItem {
    profile: 'readable' | 'compact' | 'expanded';
}

export async function selectFormattingProfileCommand(): Promise<void> {
    const picks: FormattingProfilePick[] = [
        {
            label: '$(list-tree) Readable',
            description: 'Balanced wrapping for everyday Tableau calculations',
            profile: 'readable',
        },
        {
            label: '$(list-flat) Compact',
            description: 'Keep function arguments and conditions on fewer lines',
            profile: 'compact',
        },
        {
            label: '$(list-selection) Expanded',
            description: 'One function argument per line with earlier condition wrapping',
            profile: 'expanded',
        },
    ];
    const selected = await vscode.window.showQuickPick(picks, {
        placeHolder: 'Choose how Tableau calculations should be formatted',
    });
    if (!selected) {
        return;
    }

    const resource = vscode.window.activeTextEditor?.document.uri;
    const config = vscode.workspace.getConfiguration('tableau-language-support.formatting', resource);
    const target = resource && vscode.workspace.getWorkspaceFolder(resource)
        ? vscode.ConfigurationTarget.WorkspaceFolder
        : vscode.ConfigurationTarget.Workspace;
    await config.update('profile', selected.profile, target);
    vscode.window.setStatusBarMessage(`Tableau formatter: ${selected.profile}`, 2500);
}
