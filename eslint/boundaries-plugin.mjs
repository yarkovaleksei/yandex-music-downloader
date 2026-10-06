/**
 * Локальный ESLint-плагин исполняемых границ ADR-001.
 * Правила получают всю матрицу из eslint/boundaries.config.mjs и не принимают
 * опций: частичная перенастройка flat-config не может ослабить запрет.
 */
import { builtinModules } from 'node:module';
import path from 'node:path';
import {
  allowedEdges,
  forbiddenModulesByGroup,
  globalScopeObjects,
  isTestFile,
  sharedForbiddenGlobals,
  sharedTestAllowedModules,
  testingConsumerGroups,
  workspacePackages,
  workspaceScope,
  yandexProviderDir,
  yandexSdkModules,
} from './boundaries.config.mjs';

const builtinSet = new Set(builtinModules);
const knownCoreNames = new Set(
  workspacePackages
    .filter((p) => p.group.startsWith('core/'))
    .map((p) => p.group),
);
const packageByName = new Map(workspacePackages.map((p) => [p.name, p]));
const providerNames = new Set(['providers']);

/** Определяет владельца файла по POSIX-пути относительно корня репозитория. */
export function classify(relativePath) {
  const segments = relativePath.split('/');
  const [top, second, third] = segments;
  if (top === 'apps' && second !== undefined && segments.length > 2) {
    return { group: 'app', dir: `apps/${second}` };
  }
  if (top !== 'packages' || second === undefined || segments.length < 3) {
    return { group: null, dir: null };
  }
  if (second === 'core' && third !== undefined && segments.length > 3) {
    const group = `core/${third}`;
    return {
      group: knownCoreNames.has(group) ? group : `unknown:${group}`,
      dir: `packages/core/${third}`,
    };
  }
  if (providerNames.has(second) && third !== undefined && segments.length > 3) {
    return { group: 'provider', dir: `packages/providers/${third}` };
  }
  const known = workspacePackages.find((p) => p.dir === `packages/${second}`);
  return {
    group: known ? known.group : `unknown:${second}`,
    dir: `packages/${second}`,
  };
}

function isBuiltin(specifier) {
  if (specifier.startsWith('node:')) return true;
  const root = specifier.split('/')[0] ?? specifier;
  return builtinSet.has(specifier) || builtinSet.has(root);
}

function matchesModule(specifier, entry) {
  if (entry.prefix) return specifier.startsWith(entry.module);
  return specifier === entry.module || specifier.startsWith(`${entry.module}/`);
}

const schemePattern = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const windowsAbsolutePattern = /^[a-zA-Z]:[\\/]/;

/**
 * Сопоставляет сегмент после последнего `node_modules/` имени пакета.
 * Возвращает `null`, если `node_modules` в пути нет.
 */
function nodeModulesSpecifier(posixPath) {
  const segments = posixPath.split('/');
  const index = segments.lastIndexOf('node_modules');
  if (index === -1) return null;
  const rest = segments.slice(index + 1);
  const nameLength = rest[0]?.startsWith('@') ? 2 : 1;
  if (rest.length < nameLength || rest.slice(0, nameLength).includes('')) {
    return '';
  }
  return rest.join('/');
}

/** Классифицирует «голый» specifier (имя пакета, built-in или workspace). */
function resolveBare(specifier, byRelative) {
  if (specifier.startsWith(workspaceScope)) {
    const [scope, name, ...rest] = specifier.split('/');
    const known = packageByName.get(`${scope}/${name}`);
    return {
      kind: 'workspace',
      group: known ? known.group : `unknown:${name}`,
      dir: known ? known.dir : `unknown:${name}`,
      byRelative,
      deep: rest.length > 0,
      specifier,
    };
  }
  if (isBuiltin(specifier)) return { kind: 'builtin', specifier };
  return { kind: 'external', specifier };
}

/**
 * Разбирает specifier в целевую запись. Неразрешимые формы (абсолютные пути,
 * URL-схемы, `#`-imports, выход за корень репозитория или за workspace-пакеты,
 * `..` в «голом» specifier) возвращают `kind: 'unresolvable'` — fail-closed.
 */
function resolveTarget(specifier, fromRelative) {
  const unresolvable = (reason) => ({
    kind: 'unresolvable',
    reason,
    specifier,
  });
  if (specifier === '' || specifier.includes('\\')) {
    return unresolvable('path');
  }
  if (specifier.startsWith('#')) return unresolvable('alias');
  if (specifier.startsWith('/') || windowsAbsolutePattern.test(specifier)) {
    return unresolvable('path');
  }
  if (schemePattern.test(specifier) && !specifier.startsWith('node:')) {
    return unresolvable('scheme');
  }
  if (specifier.startsWith('.')) {
    // Node ESM отбрасывает ?query/#fragment и декодирует %XX, поэтому такие
    // относительные specifier-ы нельзя классифицировать как обычный путь.
    if (/[?#%]/.test(specifier)) return unresolvable('path');
    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(fromRelative), specifier),
    );
    if (resolved === '..' || resolved.startsWith('../')) {
      return unresolvable('path');
    }
    const mapped = nodeModulesSpecifier(resolved);
    if (mapped !== null) {
      return mapped === '' ? unresolvable('path') : resolveBare(mapped, true);
    }
    const owner = classify(resolved);
    return owner.group === null
      ? unresolvable('path')
      : {
          kind: 'workspace',
          ...owner,
          byRelative: true,
          deep: false,
          specifier,
        };
  }
  if (
    specifier.split('/').some((segment) => segment === '..' || segment === '.')
  ) {
    return unresolvable('path');
  }
  return resolveBare(specifier, false);
}

function literalValue(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string')
    return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? null;
  }
  return null;
}

function propertyName(member) {
  if (!member.computed && member.property.type === 'Identifier')
    return member.property.name;
  return literalValue(member.property);
}

function currentFile(context) {
  const relative = path
    .relative(context.cwd, context.filename)
    .split(path.sep)
    .join('/');
  const owner = classify(relative);
  return { relative, ...owner, isTest: isTestFile(relative) };
}

/** Вызывает `onImport` для каждого статического/динамического specifier. */
function collectImports(onImport) {
  const fromLiteral = (node, spec, typeOnly) => {
    const value = literalValue(spec);
    onImport({ node, value, typeOnly });
  };
  return {
    ImportDeclaration: (node) =>
      onImport({
        node,
        value: node.source.value,
        typeOnly: node.importKind === 'type',
      }),
    ExportNamedDeclaration: (node) => {
      if (node.source)
        onImport({
          node,
          value: node.source.value,
          typeOnly: node.exportKind === 'type',
        });
    },
    ExportAllDeclaration: (node) =>
      onImport({
        node,
        value: node.source.value,
        typeOnly: node.exportKind === 'type',
      }),
    ImportExpression: (node) => fromLiteral(node, node.source, false),
    CallExpression: (node) => {
      if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
        fromLiteral(node, node.arguments[0], false);
      }
    },
    TSImportType: (node) => {
      // `source` — актуальное поле typescript-eslint; `argument` оставлено для старых версий.
      const argument = node.source ?? node.argument;
      const spec =
        argument?.type === 'TSLiteralType' ? argument.literal : argument;
      fromLiteral(node, spec, true);
    },
    TSImportEqualsDeclaration: (node) => {
      if (node.moduleReference?.type === 'TSExternalModuleReference') {
        fromLiteral(
          node,
          node.moduleReference.expression,
          node.importKind === 'type',
        );
      }
    },
  };
}

const meta = (messages, description) => ({
  type: 'problem',
  docs: { description },
  schema: [],
  messages,
});

const dependency = {
  meta: meta(
    {
      forbiddenEdge:
        'Импорт {{from}} -> {{to}} нарушает направление зависимостей ADR-001{{kind}}.',
      crossRelative:
        'Относительный импорт в другой workspace-пакет запрещён: используйте имя пакета.',
      deepImport:
        'Deep-import внутрь workspace-пакета запрещён: {{specifier}}.',
    },
    'Направление зависимостей между пакетами ADR-001',
  ),
  create(context) {
    const file = currentFile(context);
    if (file.group === null) return {};
    return collectImports(({ node, value, typeOnly }) => {
      if (typeof value !== 'string') return;
      const target = resolveTarget(value, file.relative);
      if (target.kind !== 'workspace' || target.dir === file.dir) return;
      if (target.byRelative) {
        context.report({ node, messageId: 'crossRelative' });
      }
      if (target.deep) {
        context.report({
          node,
          messageId: 'deepImport',
          data: { specifier: value },
        });
      }
      const edges = allowedEdges(file.group);
      let allowed;
      if (target.group === 'testing') {
        allowed = file.isTest && testingConsumerGroups.includes(file.group);
      } else {
        allowed =
          edges.value.includes(target.group) ||
          (typeOnly && edges.typeOnly.includes(target.group));
      }
      if (!allowed) {
        context.report({
          node,
          messageId: 'forbiddenEdge',
          data: {
            from: file.group,
            to: target.group,
            kind: typeOnly ? ' (type-only не разрешён для этого ребра)' : '',
          },
        });
      }
    });
  },
};

const external = {
  meta: meta(
    {
      yandexSdk:
        '@dvxch/yandex-music разрешён только в packages/providers/yandex-music (PRN-001).',
      forbiddenModule: 'Модуль {{module}} запрещён в {{group}} ({{origin}}).',
      sharedBuiltin:
        'packages/shared не использует Node built-ins: {{specifier}} (ADR-001 п.5).',
      sharedExternal:
        'packages/shared не имеет сторонних зависимостей: {{specifier}}.',
    },
    'Запрещённые внешние модули и чистота packages/shared',
  ),
  create(context) {
    const file = currentFile(context);
    return collectImports(({ node, value }) => {
      if (typeof value !== 'string') return;
      const target = resolveTarget(value, file.relative);
      if (target.kind === 'unresolvable') return;
      const specifier = target.specifier;
      if (
        yandexSdkModules.some(
          (name) => specifier === name || specifier.startsWith(`${name}/`),
        )
      ) {
        if (file.dir !== yandexProviderDir)
          context.report({ node, messageId: 'yandexSdk' });
        return;
      }
      if (file.group === null) return;
      const bucket = file.group.startsWith('core/') ? 'core' : file.group;
      for (const entry of forbiddenModulesByGroup[bucket] ?? []) {
        if (matchesModule(specifier, entry)) {
          context.report({
            node,
            messageId: 'forbiddenModule',
            data: { module: specifier, group: bucket, origin: entry.origin },
          });
        }
      }
      if (file.group === 'shared') {
        if (target.kind === 'builtin') {
          context.report({
            node,
            messageId: 'sharedBuiltin',
            data: { specifier },
          });
        } else if (target.kind === 'external') {
          const allowed =
            file.isTest && sharedTestAllowedModules.includes(specifier);
          if (!allowed) {
            context.report({
              node,
              messageId: 'sharedExternal',
              data: { specifier },
            });
          }
        }
      }
    });
  },
};

const bypass = {
  meta: meta(
    {
      computedSpecifier:
        'Вычисляемый specifier нельзя проверить статически; запрещено (fail-closed).',
      unresolvableSpecifier:
        'Specifier {{specifier}} нельзя отнести к пакету (абсолютный путь, URL-схема, #-import или выход за пределы workspace-пакетов); запрещено (fail-closed).',
      createRequire:
        'createRequire обходит статический анализ импортов; запрещён.',
      requireAlias:
        'require вне прямого вызова require("x") и module.require обходят статический анализ импортов; запрещены.',
      sharedGlobal:
        'packages/shared не использует I/O-глобал {{name}} (ADR-001 п.5).',
      sharedAmbient:
        'packages/shared не объявляет ambient-имя I/O-глобала {{name}} (ADR-001 п.5).',
    },
    'Обходы статического анализа границ',
  ),
  create(context) {
    const file = currentFile(context);
    if (file.group === null) return {};
    const handlers = collectImports(({ node, value }) => {
      if (value === null) {
        context.report({ node, messageId: 'computedSpecifier' });
        return;
      }
      if (typeof value !== 'string') return;
      const target = resolveTarget(value, file.relative);
      if (target.kind === 'unresolvable') {
        context.report({
          node,
          messageId: 'unresolvableSpecifier',
          data: { specifier: value },
        });
      }
    });
    const originalCall = handlers.CallExpression;
    handlers.CallExpression = (node) => {
      originalCall(node);
      const callee = node.callee;
      if (callee.type === 'Identifier' && callee.name === 'createRequire') {
        context.report({ node, messageId: 'createRequire' });
      }
      if (
        callee.type === 'MemberExpression' &&
        propertyName(callee) === 'require'
      ) {
        context.report({ node, messageId: 'requireAlias' });
      }
    };
    handlers.MemberExpression = (node) => {
      if (propertyName(node) === 'createRequire')
        context.report({ node, messageId: 'createRequire' });
    };
    handlers.ImportSpecifier = (node) => {
      if (node.imported?.name === 'createRequire')
        context.report({ node, messageId: 'createRequire' });
    };
    handlers.Property = (node) => {
      if (
        node.parent?.type === 'ObjectPattern' &&
        (node.key?.name === 'createRequire' ||
          literalValue(node.key) === 'createRequire')
      ) {
        context.report({ node, messageId: 'createRequire' });
      }
    };
    handlers.Identifier = (node) => {
      if (node.name !== 'require') return;
      const parent = node.parent;
      if (parent?.type === 'CallExpression' && parent.callee === node) return;
      if (
        parent?.type === 'MemberExpression' &&
        parent.property === node &&
        !parent.computed
      ) {
        return;
      }
      if (
        parent?.type === 'Property' &&
        parent.key === node &&
        !parent.computed
      ) {
        return;
      }
      if (parent?.type === 'TSTypeQuery') return;
      context.report({ node, messageId: 'requireAlias' });
    };
    if (file.group === 'shared') {
      const banned = new Set([
        ...sharedForbiddenGlobals,
        ...globalScopeObjects,
      ]);
      const reportAmbient = (identifier) => {
        if (identifier?.type === 'Identifier' && banned.has(identifier.name)) {
          context.report({
            node: identifier,
            messageId: 'sharedAmbient',
            data: { name: identifier.name },
          });
        }
      };
      const inAmbientBlock = (node) =>
        context.sourceCode
          .getAncestors(node)
          .some((ancestor) => ancestor.type === 'TSModuleDeclaration');
      handlers.VariableDeclaration = (node) => {
        if (!node.declare && !inAmbientBlock(node)) return;
        for (const declarator of node.declarations)
          reportAmbient(declarator.id);
      };
      handlers.TSDeclareFunction = (node) => reportAmbient(node.id);
      handlers.TSModuleDeclaration = (node) => reportAmbient(node.id);
      handlers.ClassDeclaration = (node) => {
        if (node.declare || inAmbientBlock(node)) reportAmbient(node.id);
      };
      handlers.TSEnumDeclaration = (node) => {
        if (node.declare || inAmbientBlock(node)) reportAmbient(node.id);
      };
      handlers.FunctionDeclaration = (node) => {
        if (inAmbientBlock(node)) reportAmbient(node.id);
      };
      handlers['Program:exit'] = (program) => {
        const globalScope = context.sourceCode.getScope(program);
        const references = [
          ...globalScope.through,
          ...globalScope.variables
            .filter((v) => banned.has(v.name))
            .flatMap((v) => v.references),
        ];
        for (const reference of references) {
          if (banned.has(reference.identifier.name)) {
            context.report({
              node: reference.identifier,
              messageId: 'sharedGlobal',
              data: { name: reference.identifier.name },
            });
          }
        }
      };
    }
    return handlers;
  },
};

export default { rules: { dependency, external, bypass } };
