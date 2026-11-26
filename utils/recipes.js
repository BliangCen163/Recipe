const CUISINE_TAGS = [
	'川菜',
	'粤菜',
	'湘菜',
	'鲁菜',
	'浙菜',
	'苏菜',
	'闽菜',
	'徽菜',
	'东北菜',
	'西北菜',
	'云南菜',
	'贵州菜',
	'新疆菜',
	'湖北菜',
	'北京菜',
	'上海菜',
	'家常菜',
	'素菜',
	'凉菜',
	'汤羹',
	'小吃',
	'主食',
	'烘焙',
	'甜品',
	'饮品',
	'西餐',
	'日式',
	'韩式',
	'泰式'
]

export const EIGHT_MAJOR_CUISINES = [
	'川菜',
	'粤菜',
	'湘菜',
	'鲁菜',
	'浙菜',
	'苏菜',
	'闽菜',
	'徽菜'
]

export const REGIONAL_CUISINE_ORDER = [
	'北京菜',
	'上海菜',
	'东北菜',
	'西北菜',
	'新疆菜',
	'云南菜',
	'贵州菜',
	'湖北菜'
]

export const TYPE_CATEGORY_ORDER = [
	'地方风味',
	'家常菜',
	'主食',
	'小吃夜宵',
	'凉菜',
	'汤羹煲汤',
	'素菜轻食',
	'烘焙甜品',
	'饮品',
	'异国料理'
]

export const SCENE_CATEGORY_ORDER = [
	'家常下饭',
	'早餐早午餐',
	'一人食',
	'聚餐宴客',
	'下午茶甜点',
	'夜宵小聚',
	'健康轻食'
]

const FOREIGN_CUISINES = ['日式', '韩式', '泰式', '西餐']
const EIGHT_MAJOR_SET = new Set(EIGHT_MAJOR_CUISINES)
const REGIONAL_CUISINE_SET = new Set(REGIONAL_CUISINE_ORDER)
const FOREIGN_CUISINE_SET = new Set(FOREIGN_CUISINES)

export const DISPLAY_CUISINE_ORDER = [
	'家常菜',
	...EIGHT_MAJOR_CUISINES,
	...REGIONAL_CUISINE_ORDER,
	...FOREIGN_CUISINES,
	'烘焙',
	'甜品',
	'饮品',
	'早餐',
	'主食',
	'小吃',
	'凉菜',
	'汤羹',
	'素菜',
	'未分类'
]

const MODE_DEFINITIONS = {
	cuisine: {
		key: 'cuisine',
		label: '按菜系',
		title: '八大菜系',
		description: '优先保留八大菜系，其余菜品合并到“其他菜系”。',
		options: [...EIGHT_MAJOR_CUISINES, '其他菜系']
	},
	region: {
		key: 'region',
		label: '按地域',
		title: '地方风味',
		description: '适合看北京菜、上海菜、新疆菜这类地方特色。',
		options: [...REGIONAL_CUISINE_ORDER, '其他地域']
	},
	type: {
		key: 'type',
		label: '按类型',
		title: '菜品类型',
		description: '把菜谱聚合成主食、小吃、汤羹、甜品等更少的类型选项。',
		options: TYPE_CATEGORY_ORDER
	},
	scene: {
		key: 'scene',
		label: '按场景',
		title: '就餐场景',
		description: '按家常下饭、早餐、聚餐、下午茶等真实使用场景浏览。',
		options: SCENE_CATEGORY_ORDER
	}
}

export const RECIPE_CLASSIFICATION_MODES = Object.values(MODE_DEFINITIONS)

const normalizeText = (value) => String(value || '').trim()

const includesAny = (text, keywords = []) => keywords.some((keyword) => text.includes(keyword))

const createOrderSorter = (order = []) => {
	const orderMap = new Map(order.map((name, index) => [name, index]))

	return (names = []) => {
		return [...names].sort((a, b) => {
			const aIndex = orderMap.has(a) ? orderMap.get(a) : Number.MAX_SAFE_INTEGER
			const bIndex = orderMap.has(b) ? orderMap.get(b) : Number.MAX_SAFE_INTEGER

			if (aIndex !== bIndex) {
				return aIndex - bIndex
			}

			return String(a).localeCompare(String(b), 'zh-Hans-CN')
		})
	}
}

const sortWithOrder = createOrderSorter(DISPLAY_CUISINE_ORDER)

const getTextItems = (recipe = {}) => {
	const items = [
		recipe.title,
		recipe.intro,
		recipe.cuisine,
		recipe.category,
		recipe.majorCuisine,
		recipe.regionalCuisine,
		recipe.dishCategory,
		recipe.sceneCategory
	]

	if (Array.isArray(recipe.categories)) {
		items.push(...recipe.categories)
	}

	if (Array.isArray(recipe.tags)) {
		items.push(...recipe.tags)
	}

	if (Array.isArray(recipe.ingredients)) {
		recipe.ingredients.forEach((ingredient) => {
			if (!ingredient) return
			if (typeof ingredient === 'string') {
				items.push(ingredient)
				return
			}
			items.push(ingredient.name, ingredient.amount)
		})
	}

	return items.map(normalizeText).filter(Boolean)
}

const getSearchText = (recipe = {}) => getTextItems(recipe).join(' ')

const getStoredCategory = (recipe = {}, keys = []) => {
	for (const key of keys) {
		const value = normalizeText(recipe?.[key])
		if (value) {
			return value
		}
	}

	return ''
}

export const normalizeCover = (cover) => {
	if (!cover) return ''
	return String(cover).replace(/^http:\/\//, 'https://')
}

export const getRecipeCuisine = (recipe = {}) => {
	if (recipe.cuisine) {
		return String(recipe.cuisine).trim()
	}

	if (Array.isArray(recipe.categories) && recipe.categories.length) {
		const firstCategory = recipe.categories.find((item) => String(item || '').trim())
		if (firstCategory) {
			return String(firstCategory).trim()
		}
	}

	if (recipe.category) {
		return String(recipe.category).trim()
	}

	if (Array.isArray(recipe.tags)) {
		const matchedTag = recipe.tags.find((tag) => CUISINE_TAGS.includes(String(tag).trim()))
		if (matchedTag) {
			return String(matchedTag).trim()
		}
	}

	return '未分类'
}

const inferMajorCuisine = (recipe = {}, cuisine = getRecipeCuisine(recipe)) => {
	const stored = getStoredCategory(recipe, ['majorCuisine'])
	if (stored) {
		return stored
	}

	return EIGHT_MAJOR_SET.has(cuisine) ? cuisine : '其他菜系'
}

const inferRegionalCuisine = (recipe = {}, cuisine = getRecipeCuisine(recipe)) => {
	const stored = getStoredCategory(recipe, ['regionalCuisine'])
	if (stored) {
		return stored
	}

	return REGIONAL_CUISINE_SET.has(cuisine) ? cuisine : '其他地域'
}

const inferDishCategory = (recipe = {}, cuisine = getRecipeCuisine(recipe)) => {
	const stored = getStoredCategory(recipe, ['dishCategory'])
	if (stored) {
		return stored
	}

	const text = getSearchText(recipe)

	if (includesAny(text, ['奶茶', '果汁', '咖啡', '饮品', '茶饮', '豆浆', '奶昔'])) {
		return '饮品'
	}

	if (includesAny(text, ['烘焙', '面包', '蛋糕', '吐司', '曲奇', '饼干', '布丁', '慕斯', '甜品', '糖水'])) {
		return '烘焙甜品'
	}

	if (includesAny(text, ['主食', '面', '米饭', '炒饭', '盖饭', '焖饭', '河粉', '米线', '饺子', '包子', '馄饨'])) {
		return '主食'
	}

	if (includesAny(text, ['小吃', '夜宵', '烧烤', '串串', '零食'])) {
		return '小吃夜宵'
	}

	if (includesAny(text, ['凉菜', '凉拌', '沙拉', '拌菜'])) {
		return '凉菜'
	}

	if (includesAny(text, ['汤', '羹', '煲汤', '老火汤', '炖盅'])) {
		return '汤羹煲汤'
	}

	if (includesAny(text, ['素菜', '素食', '轻食', '减脂', '低卡'])) {
		return '素菜轻食'
	}

	if (FOREIGN_CUISINE_SET.has(cuisine)) {
		return '异国料理'
	}

	if (cuisine === '家常菜') {
		return '家常菜'
	}

	if (cuisine === '主食') {
		return '主食'
	}

	if (cuisine === '小吃') {
		return '小吃夜宵'
	}

	if (cuisine === '凉菜') {
		return '凉菜'
	}

	if (cuisine === '汤羹') {
		return '汤羹煲汤'
	}

	if (cuisine === '素菜') {
		return '素菜轻食'
	}

	if (['烘焙', '甜品'].includes(cuisine)) {
		return '烘焙甜品'
	}

	if (cuisine === '饮品') {
		return '饮品'
	}

	if (EIGHT_MAJOR_SET.has(cuisine) || REGIONAL_CUISINE_SET.has(cuisine)) {
		return '地方风味'
	}

	return '家常菜'
}

const inferSceneCategory = (recipe = {}, dishCategory = inferDishCategory(recipe)) => {
	const stored = getStoredCategory(recipe, ['sceneCategory'])
	if (stored) {
		return stored
	}

	const text = getSearchText(recipe)

	if (includesAny(text, ['早餐', '早午餐', '早餐饼'])) {
		return '早餐早午餐'
	}

	if (includesAny(text, ['一人食', '单身食谱'])) {
		return '一人食'
	}

	if (includesAny(text, ['朋友聚餐', '聚餐', '宴客', '年夜饭', '节日'])) {
		return '聚餐宴客'
	}

	if (includesAny(text, ['下酒菜', '夜宵', '烧烤']) || dishCategory === '小吃夜宵') {
		return '夜宵小聚'
	}

	if (includesAny(text, ['下午茶']) || ['烘焙甜品', '饮品'].includes(dishCategory)) {
		return '下午茶甜点'
	}

	if (includesAny(text, ['减脂', '低卡', '轻食', '素食']) || dishCategory === '素菜轻食') {
		return '健康轻食'
	}

	return '家常下饭'
}

export const getRecipeClassification = (recipe = {}) => {
	const cuisine = getRecipeCuisine(recipe)
	const majorCuisine = inferMajorCuisine(recipe, cuisine)
	const regionalCuisine = inferRegionalCuisine(recipe, cuisine)
	const dishCategory = inferDishCategory(recipe, cuisine)
	const sceneCategory = inferSceneCategory(recipe, dishCategory)

	return {
		cuisine,
		majorCuisine,
		regionalCuisine,
		dishCategory,
		sceneCategory
	}
}

export const getRecipeModeCategory = (recipe = {}, modeKey = 'cuisine') => {
	const classification = getRecipeClassification(recipe)

	switch (modeKey) {
		case 'region':
			return classification.regionalCuisine
		case 'type':
			return classification.dishCategory
		case 'scene':
			return classification.sceneCategory
		case 'cuisine':
		default:
			return classification.majorCuisine
	}
}

export const getModeDefinition = (modeKey = 'cuisine') => MODE_DEFINITIONS[modeKey] || MODE_DEFINITIONS.cuisine

export const sortModeCategoryNames = (modeKey = 'cuisine', names = []) => {
	const mode = getModeDefinition(modeKey)
	return createOrderSorter(mode.options)(names)
}

export const matchesRecipeKeyword = (recipe = {}, keyword = '') => {
	const normalizedKeyword = normalizeText(keyword).toLowerCase()
	if (!normalizedKeyword) return true

	return getSearchText(recipe).toLowerCase().includes(normalizedKeyword)
}

export const buildRecipeIntro = (recipe = {}) => {
	if (recipe.intro) {
		return String(recipe.intro).trim()
	}

	const title = String(recipe.title || '').trim() || '这道菜'
	const ingredientNames = Array.isArray(recipe.ingredients)
		? recipe.ingredients.map((item) => item?.name).filter(Boolean).slice(0, 4)
		: []
	const cuisine = getRecipeCuisine(recipe)
	const tagText = Array.isArray(recipe.tags) && recipe.tags.length
		? recipe.tags.slice(0, 3).join('、')
		: ''
	const ingredientText = ingredientNames.length
		? `主要食材有${ingredientNames.join('、')}`
		: '食材搭配比较常见'
	const cuisineText = cuisine && cuisine !== '未分类'
		? `，偏${cuisine}风味`
		: ''
	const tagsSuffix = tagText ? `，特点是${tagText}` : ''

	return `${title}${cuisineText}，${ingredientText}${tagsSuffix}。`
}

export const normalizeIngredients = (ingredients) => {
	if (!Array.isArray(ingredients)) return []

	return ingredients
		.map((item) => {
			if (!item) return null

			if (typeof item === 'string') {
				return {
					name: item,
					amount: '适量'
				}
			}

			const name = String(item.name || item.ingredient || '').trim()
			if (!name) return null

			return {
				name,
				amount: String(item.amount || item.value || '适量').trim() || '适量'
			}
		})
		.filter(Boolean)
}

export const normalizeSteps = (steps) => {
	if (!Array.isArray(steps)) return []

	return steps
		.map((item, index) => {
			if (!item) return null

			if (typeof item === 'string') {
				return {
					stepNum: index + 1,
					desc: item,
					timerMinute: 0
				}
			}

			const desc = String(item.desc || item.content || '').trim()
			if (!desc) return null

			return {
				stepNum: Number(item.stepNum) || index + 1,
				desc,
				timerMinute: Number(item.timerMinute) || 0
			}
		})
		.filter(Boolean)
}

export const normalizeRecipeCard = (recipe = {}) => {
	const classification = getRecipeClassification(recipe)

	return {
		...recipe,
		id: String(recipe._id || recipe.id || ''),
		title: String(recipe.title || '未命名菜谱').trim(),
		cover: normalizeCover(recipe.cover),
		tags: Array.isArray(recipe.tags) ? recipe.tags.slice(0, 3) : [],
		author: recipe.author || recipe.nickname || '云端菜谱',
		cuisine: classification.cuisine,
		majorCuisine: classification.majorCuisine,
		regionalCuisine: classification.regionalCuisine,
		dishCategory: classification.dishCategory,
		sceneCategory: classification.sceneCategory
	}
}

export const normalizeRecipeDetail = (recipe = {}) => {
	const normalizedIngredients = normalizeIngredients(recipe.ingredients)
	const normalizedSteps = normalizeSteps(recipe.steps)
	const classification = getRecipeClassification({
		...recipe,
		ingredients: normalizedIngredients
	})

	return {
		...recipe,
		_id: recipe._id || '',
		id: recipe.id || recipe._id || '',
		title: String(recipe.title || 'AI 私房菜').trim(),
		intro: buildRecipeIntro({
			...recipe,
			ingredients: normalizedIngredients
		}),
		cover: normalizeCover(recipe.cover),
		tags: Array.isArray(recipe.tags) ? recipe.tags : [],
		ingredients: normalizedIngredients,
		steps: normalizedSteps,
		tips: recipe.tips || '出锅前先试味，再按口味微调。',
		author: recipe.author || recipe.nickname || '云端菜谱',
		cuisine: classification.cuisine,
		majorCuisine: classification.majorCuisine,
		regionalCuisine: classification.regionalCuisine,
		dishCategory: classification.dishCategory,
		sceneCategory: classification.sceneCategory
	}
}

export const sortCuisineNames = (names = []) => sortWithOrder(names)

const AMOUNT_PATTERN = /^\s*(\d+(?:\.\d+)?)\s*([^\d\s].*)?$/

export const parseAmountText = (text) => {
	const raw = String(text || '').trim()
	if (!raw) return null

	const matched = raw.match(AMOUNT_PATTERN)
	if (!matched) return null

	const value = Number(matched[1])
	if (!Number.isFinite(value)) return null

	return { value, unit: String(matched[2] || '').trim() }
}

export const formatAmountText = (value, unit = '') => {
	if (!Number.isFinite(value)) return ''

	const rounded = Math.round(value * 100) / 100
	const numberText = Number.isInteger(rounded)
		? String(rounded)
		: String(rounded).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')

	if (!unit) return numberText
	return /^[\u4e00-\u9fa5]/.test(unit) ? `${numberText} ${unit}` : `${numberText}${unit}`
}

export const scaleAmountText = (amount, ratio = 1) => {
	const raw = String(amount || '').trim()
	if (!raw || !Number.isFinite(ratio) || ratio <= 0 || ratio === 1) return raw

	const parsed = parseAmountText(raw)
	if (!parsed) return raw

	return formatAmountText(parsed.value * ratio, parsed.unit)
}

export const mergeAmountText = (left, right) => {
	const base = String(left || '').trim()
	const extra = String(right || '').trim()
	if (!base) return extra
	if (!extra) return base

	const a = parseAmountText(base)
	const b = parseAmountText(extra)
	if (!a || !b) return `${base} + ${extra}`
	if (a.unit !== b.unit) return `${base} + ${extra}`

	return formatAmountText(a.value + b.value, a.unit)
}
