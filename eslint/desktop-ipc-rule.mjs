/** ADR-016: Electron IPC доступен только transport-адаптерам и generated channels. */
export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      transport: 'Прямой IPC разрешён только transport-адаптеру DesktopApi.',
      channel: 'Канал должен происходить из единого contract module.',
      renderer: 'Renderer не импортирует Electron или Node.js.',
    },
  },
  create(context) {
    const file = context.filename.replaceAll('\\', '/');
    const renderer = file.includes('/apps/desktop/src/renderer/');
    const transport = file.includes('/apps/desktop/src/transport/');
    const importedIpc = new Set(['ipcMain', 'ipcRenderer']);
    const generated = new Set();
    function ipcObject(node) {
      if (node.type === 'Identifier') return importedIpc.has(node.name);
      return (
        node.type === 'MemberExpression' &&
        node.property.type === 'Identifier' &&
        ['ipcMain', 'ipcRenderer', 'webContents'].includes(node.property.name)
      );
    }
    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (
          renderer &&
          (source === 'electron' ||
            source.startsWith('node:') ||
            ['fs', 'path', 'child_process', 'os', 'module'].includes(source))
        )
          context.report({ node, messageId: 'renderer' });
        if (source === 'electron')
          for (const item of node.specifiers)
            if (
              item.type === 'ImportSpecifier' &&
              ['ipcMain', 'ipcRenderer'].includes(item.imported.name)
            )
              importedIpc.add(item.local.name);
        if (source.endsWith('/contract/desktop-api.js'))
          for (const item of node.specifiers)
            if (
              item.type === 'ImportSpecifier' &&
              ['channel', 'eventChannel'].includes(item.imported.name)
            )
              generated.add(item.local.name);
      },
      CallExpression(node) {
        if (
          node.callee.type !== 'MemberExpression' ||
          !ipcObject(node.callee.object)
        )
          return;
        if (
          node.callee.object.type === 'MemberExpression' &&
          node.callee.object.property.type === 'Identifier' &&
          node.callee.object.property.name === 'webContents' &&
          (node.callee.property.type !== 'Identifier' ||
            node.callee.property.name !== 'send')
        )
          return;
        if (!transport) {
          context.report({ node, messageId: 'transport' });
          return;
        }
        const argument = node.arguments[0];
        const valid =
          (argument?.type === 'Identifier' && generated.has(argument.name)) ||
          (argument?.type === 'CallExpression' &&
            argument.callee.type === 'Identifier' &&
            generated.has(argument.callee.name));
        if (!valid) context.report({ node, messageId: 'channel' });
      },
    };
  },
};
