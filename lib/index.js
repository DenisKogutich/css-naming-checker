'use strict';

const _ = require('lodash');
const path = require('path');
const postcss = require('postcss');
const glob = require('glob');
const fs = require('fs');
const bemNaming = require('@bem/sdk.naming.entity');

/**
 * Возвращает массив с прямыми потомками корневого узла css дерева, у которых тип равен 'rule'
 *
 * @param {postcss.Root} root Корневой узел css дерева
 * @return {Array<postcss.Rule>}
 */
const getStrictDescendantRules = (root) => {
	const classNameRegExp = /\..+/;

	return root.nodes.reduce((children, node) => {
		return node.type === 'rule' && classNameRegExp.test(node.selector)
			? [...children, node]
			: children;
	}, []);
};

/**
 * Проверяет соответствие между селектором и путем файла
 * Пример корректной пары: .block и ../../block1/block1.post.css
 *
 * @param {String} selector селектор
 * @param {String} filePath путь до файла
 */
const checkSelectorAccordance = (selector, filePath) => {
	// Представление селектора без точки в начале
	const rawSelector = selector.slice(1);
	// Имя файла без расширения .post.css, block.post.css -> block
	const fileNameWithoutExt = path.basename(filePath, '.post.css');

	// Проверяем, что название файла соответствует селектору в файле
	if (rawSelector !== fileNameWithoutExt) {
		throw new Error(`css selector "${selector}" does not match filename`);
	}

	const bemName = bemNaming.parse(rawSelector);

	if (!bemName) {
		throw new Error(`css selector "${selector}" not in BEM methodology`);
	}

	const {block, elem, mod} = bemName;
	const splittedPath = filePath.split(path.sep);
	const splittedPathLen = splittedPath.length;
	let ok;

	// Проверяем, что файловая структура соответствует селектору
	// Например для .block__elem структура должна быть ../../block/__elem/block__elem.post.css
	if (!elem && !mod) { // Рассматривается сам блок, без модификаторов и прочего
		ok = splittedPath[splittedPathLen - 2] === block;
	} else if (!elem) { // Рассматривается модификатор блока
		ok = _.every([
			splittedPath[splittedPathLen - 3] === block,
			splittedPath[splittedPathLen - 2] === `_${mod.name}`
		]);
	} else if (mod) { // Рассматривается элемент с модификатором
		ok = _.every([
			splittedPath[splittedPathLen - 4] === block,
			splittedPath[splittedPathLen - 3] === `__${elem}`,
			splittedPath[splittedPathLen - 2] === `_${mod.name}`
		]);
	} else { // Рассматривается элемент без модификатора
		ok = _.every([
			splittedPath[splittedPathLen - 3] === block,
			splittedPath[splittedPathLen - 2] === `__${elem}`
		]);
	}

	if (!ok) {
		throw new Error(`css selector ${selector} does not match file structure`);
	}
};

/**
 * Функция проверки корректного нейминга файлов и селекторов
 * Проверяет как соответствие имен, так и файловой структуры
 *
 * @param {String} cssDir Путь до директории
 */
const checkNaming = (cssDir) => {
	const cssFilesPaths = glob.sync(`${cssDir}/**/*.post.css`);

	cssFilesPaths.forEach((filePath) => {
		const css = fs.readFileSync(filePath);
		const cssAstRoot = postcss.parse(css);
		const descendantRules = getStrictDescendantRules(cssAstRoot);

		// Отсутствие обычных css-селекторов cчитаем нормой,
		// в файле могут быть объявления переменных например и ничего больше
		if (!descendantRules.length) {
			return;
		}

		if (descendantRules.length > 1) {
			throw new Error(`too much selectors in file "${filePath}"`);
		}

		const [{selector}] = descendantRules;

		try {
			checkSelectorAccordance(selector, filePath);
		} catch (err) {
			throw new Error(`in file ${filePath}, details: ${err.message}`);
		}
	});
};

module.exports = checkNaming;
