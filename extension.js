const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const sjsonParser = require('./sjsonParser');
const tableSchema = require('./tableSchema');


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "jbeam-editor" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with  registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand('jbeam-editor.helloWorld', function () {
    // The code you place here will be executed every time your command is executed

    // Display a message box to the user
    vscode.window.showInformationMessage('Hello World from Jbeam editor!');
  });

  context.subscriptions.push(disposable);


  let webPanel
  let disposable2 = vscode.commands.registerCommand('jbeam-editor.show3DScene', function () {
    // Create and show a new webview
    webPanel = vscode.window.createWebviewPanel(
      'sceneView', // Identifies the type of the webview
      '3D Scene View', // Title of the panel displayed to the user
      vscode.ViewColumn.Beside, // Editor column to show the new webview panel in
      {
        enableScripts: true,  // Allow scripts to run in the webview
        retainContextWhenHidden: true,  // Optionally, you can retain the state even when webview is not visible
        localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'webview'))]
      }
    )
    webPanel.webview.html = getWebviewContent(webPanel);
    function goToLine(message) {
      let targetEditor = vscode.window.visibleTextEditors.find(editor => {
        return editor.document.uri.toString() === message.uri;
      })
      if (targetEditor) {
        const range = targetEditor.document.lineAt(message.line - 1).range;
        targetEditor.selection = new vscode.Selection(range.start, range.end);
        targetEditor.revealRange(range);
      }
    }
    webPanel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'selectLine':
            goToLine(message);
            break;
          case 'loadDae':
            const uri = vscode.Uri.file(path.join(context.extensionPath, 'webview', message.path)); // Convert to a file URI
            const webviewUri = webPanel.webview.asWebviewUri(uri); // Convert to a webview URI
            console.log(">loadDae> ", message.path, webviewUri.toString())
            webPanel.webview.postMessage({
              command: 'loadDaeFinal',
              uri: webviewUri.toString(),
            });
            break;
        }
      },
      undefined,
      context.subscriptions
    );

    function parseAndPostData(doc) {
      const text = doc.getText()
      const uri = doc.uri.toString()
      try {
        let parsedData = sjsonParser.decodeSJSON(text);
        //console.log("PARSED:", parsedData);
        let tableInterpretedData = {}
        const keys = Object.keys(parsedData).filter(key => key !== '__line' && key !== '__isarray')
        for (let partNameIdx in keys) {
          let partName = keys[partNameIdx]
          if (!parsedData.hasOwnProperty(partName)) continue;
          let part = parsedData[partName];
          let result = tableSchema.processPart(part, false, false);
            
          if (result !== true) {
            console.error("An error occurred while processing the data.");
          }
          tableInterpretedData[partName] = part
        }
        // Do something with the parsed data, like show it in an information message
        vscode.window.showInformationMessage('Document parsed successfully. Check the console for the data.');
        //console.log("table expanded:", parsedData);
        webPanel.webview.postMessage({
          command: 'jbeamData',
          data: parsedData,
          uri: uri,
        });
      } catch (e) {
        // If there's an error in parsing, show it to the user
        vscode.window.showErrorMessage(`Error parsing SJSON: ${e.message}`);
      }
    }


    // Listen for when the active editor changes
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        parseAndPostData(editor.document);
      }
    });

    // Listen for changes in the document of the active editor
    let disposable3 = vscode.workspace.onDidChangeTextDocument(event => {
      if (webPanel.visible && event.document === vscode.window.activeTextEditor.document) {
        parseAndPostData(event.document);
      }
    });

    // Initial parse and post
    if (vscode.window.activeTextEditor) {
      parseAndPostData(vscode.window.activeTextEditor.document);
    }

    let selectionChangeDisposable = vscode.window.onDidChangeTextEditorSelection(event => {
      if (event.textEditor === vscode.window.activeTextEditor) {
        let newLineNumber = event.selections[0].start.line + 1; // Line numbers are 0-based
        if (webPanel && webPanel.visible) {
          webPanel.webview.postMessage({
            command: 'lineChanged',
            lineNumber: newLineNumber
          });
        }
      }
    });
  
  });

  context.subscriptions.push(disposable2);

  vscode.window.onDidChangeTextEditorSelection(event => {
    if (event.textEditor === vscode.window.activeTextEditor) {
      let line = event.selections[0].start.line;
      let text = event.textEditor.document.lineAt(line).text;
      // Send this text to your webview

      webPanel.webview.postMessage({
        command: 'update',
        text: text
      });
    }
  });
  
}

function getWebviewContent(webPanel) {
  const webviewPath = path.join(__dirname, 'webview', 'index.html');
  let content = fs.readFileSync(webviewPath, 'utf8');
  
  content = content.replace(/<!-- LocalResource:(.*?) -->/g, (match, resourceName) => {
    return webPanel.webview.asWebviewUri(vscode.Uri.file(path.join(__dirname, 'webview', resourceName)));
  });

  return content;
}


// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate
}
