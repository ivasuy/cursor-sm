import * as vscode from "vscode";
import * as path from "path";

export function getWorkspaceKeyForUri(uri: vscode.Uri): string | null {
  if (vscode.workspace.workspaceFile) {
    return vscode.workspace.workspaceFile.fsPath;
  }
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  return folder ? folder.uri.fsPath : null;
}

export function getWorkspacePathForUri(uri: vscode.Uri): string | null {
  if (vscode.workspace.workspaceFile) {
    return path.dirname(vscode.workspace.workspaceFile.fsPath);
  }
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  return folder ? folder.uri.fsPath : null;
}

export function getRelativePathForUri(uri: vscode.Uri): string | null {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) {
    return null;
  }
  const relativePath = path.relative(folder.uri.fsPath, uri.fsPath);
  if (vscode.workspace.workspaceFile) {
    return path.join(folder.name, relativePath);
  }
  return relativePath;
}

export function getPrimaryWorkspaceKey(): string | null {
  if (vscode.workspace.workspaceFile) {
    return vscode.workspace.workspaceFile.fsPath;
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? folder.uri.fsPath : null;
}

export function getPrimaryWorkspacePath(): string | null {
  if (vscode.workspace.workspaceFile) {
    return path.dirname(vscode.workspace.workspaceFile.fsPath);
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? folder.uri.fsPath : null;
}

export function getWorkspaceContextForCommand(): {
  workspaceKey: string;
  summaryDirectory: string;
} | null {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri) {
    const workspaceKey = getWorkspaceKeyForUri(activeUri);
    const summaryDirectory = getWorkspacePathForUri(activeUri);
    if (workspaceKey && summaryDirectory) {
      return { workspaceKey, summaryDirectory };
    }
  }
  const workspaceKey = getPrimaryWorkspaceKey();
  const summaryDirectory = getPrimaryWorkspacePath();
  if (!workspaceKey || !summaryDirectory) {
    return null;
  }
  return { workspaceKey, summaryDirectory };
}
