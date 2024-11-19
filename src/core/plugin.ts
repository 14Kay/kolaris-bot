/*
 * @Description:
 * @Author: 14K
 * @Date: 2024-11-15 14:06:33
 * @LastEditTime: 2024-11-19 14:59:41
 * @LastEditors: 14K
 */
import type { BotPlugin } from './../plugin/types'
import type { Kolaris } from './index'
import type { PluginInfo } from './types'
import path from 'node:path'
import fsExtra from 'fs-extra'
import { Plugin } from './../plugin'
import { getDirName, KolarisError } from './../utils'

const resultTextMap = {
	success: '插件载入成功',
	error: '插件载入失败',
	uninstallSuccess: '插件卸载成功',
	uninstallError: '插件卸载失败',
}

const logError = function (this: Kolaris, message: string, error: Error) {
	this.log(message, 'error')
	this.log(error.message, 'error')
}

/**
 * @description: 获取本地插件列表
 * @param {Kolaris} this
 * @return {*}
 */
export async function getLocalPlugins(this: Kolaris) {
	const pluginNameList = getDirName(this.pluginDir)
	const pluginList: PluginInfo[] = pluginNameList.map((name) => {
		const config = fsExtra.readJSONSync(path.join(this.pluginDir, name, 'package.json'))
		return { name, info: config }
	})
	return pluginList
}

/**
 * @description: bot启动后 恢复启用的插件
 * @param {Kolaris} this
 * @return {*}
 */

export async function loadSavedPlugins(this: Kolaris) {
	// 重置插件状态
	this.pluginList.actived = []
	this.pluginList.error = []

	await Promise.all(
		this.pluginList.enabled.map(async (plugin) => {
			const pluginPath = path.join(this.pluginDir, plugin)
			try {
				await enablePlugin.call(this, pluginPath, plugin)
				this.pluginList.actived.push(plugin)
			} catch {
				this.pluginList.error.push(plugin)
			}
		}),
	)

	this.savePluginFile()
	return {
		success: this.pluginList.actived.length,
		error: this.pluginList.error.length,
	}
}

/**
 * @description: 启用单个
 * @param {Kolaris} this
 * @param {string} pluginPath
 * @param {string} name
 * @return {*}
 */
export async function enablePlugin(this: Kolaris, pluginPath: string, name: string) {
	this.log(`正在载入插件: ${name} ...`)
	try {
		const _plugin = await require(pluginPath)
		const plugin: BotPlugin = _plugin.default || _plugin
		const pkg = path.join(pluginPath, 'package.json')
		const config: PluginInfo['info'] = fsExtra.pathExistsSync(pkg)
			? fsExtra.readJSONSync(pkg)
			: {}
		if (plugin) {
			const pluginInstance = plugin.setup(this, config)
			this.pluginActivedMap.set(name, pluginInstance)
			return this.log(`${resultTextMap.success}: ${name}`)
		}
	} catch (e: any) {
		logError.call(this, `${resultTextMap.error}: ${name}`, e)
		if (this.pluginActivedMap.has(name)) {
			this.pluginActivedMap.delete(name)
		}
		throw new KolarisError(e.message)
	}
}

/**
 * @description: 禁用一个插件
 * @param {Kolaris} this
 * @param {string} name
 * @return {*}
 */
export async function disablePlugin(this: Kolaris, name: string) {
	this.log(`正在卸载插件: ${name}`)
	try {
		const plugin = this.pluginActivedMap.get(name)
		if (plugin && plugin instanceof Plugin) {
			plugin.destroy()
		}
		deleteCache(path.join(this.pluginDir, name))
		this.pluginActivedMap.delete(name)
		return this.log(`${resultTextMap.uninstallSuccess}: ${name}`)
	} catch (e: any) {
		logError.call(this, `${resultTextMap.uninstallError}: ${name}`, e)
		throw new KolarisError(e.message)
	}
}

export function deleteCache(modulePath: string) {
	const resolvedPath = require.resolve(modulePath)
	const mod = require.cache[resolvedPath]
	if (!mod) {
		return
	}
	const idx = require.main?.children.indexOf(mod) as number
	if (idx >= 0) {
		require.main?.children.splice(idx, 1)
	}

	Object.keys(require.cache).forEach((fullpath) => {
		const cachedMod = require.cache[fullpath]
		if (cachedMod?.id.startsWith(mod.path)) {
			delete require.cache[fullpath]
		}
	})

	delete require.cache[resolvedPath]
}
