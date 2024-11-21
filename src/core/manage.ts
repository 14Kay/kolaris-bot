import type { Forwardable } from '@icqq-plus/icqq'
import type { Kolaris } from './index'
import type { PluginInfo } from './types'
import path from 'node:path'
import { segment } from '@icqq-plus/icqq'
import { disablePlugin, enablePlugin, getLocalPlugins } from './plugin'

export async function management(this: Kolaris, command: string, pluginName: string) {
	const pluginCmdList = ['on', 'off', 'reboot', 'list', 'active']
	if (!pluginCmdList.includes(command.toLowerCase())) {
		return `未知命令 ${command}`
	}

	// 插件相关操作的命令需要插件名称
	if ((command === 'on' || command === 'off' || command === 'reboot') && !pluginName) {
		return '请输入插件名称'
	}

	const pluginList = await getLocalPlugins.call(this)
	const plugin = pluginList.find(plugin => plugin.name === pluginName)
	type PluginHandler = (pluginName: string, plugin: PluginInfo) => Promise<string>
	const lowerCommand = command.toLowerCase()
	type CommandType = 'on' | 'off' | 'reboot'
	const commandHandlers: Record<CommandType, PluginHandler> = {
		on: handlePluginOn,
		off: handlePluginOff,
		reboot: handlePluginReboot,
	}
	if (commandHandlers[lowerCommand as CommandType]) {
		if (!plugin)
			return `未找到插件 ${pluginName}`
		return await commandHandlers[lowerCommand as CommandType].call(this, pluginName, plugin)
	}
	switch (lowerCommand) {
		case 'list':
			return generatePluginList.call(this, pluginList)

		case 'active':
			return generateActivePluginList.call(this)
	}
}

async function handlePluginOn(this: Kolaris, pluginName: string, plugin: PluginInfo): Promise<string> {
	if (this.pluginActivedMap.has(pluginName)) {
		return `插件 ${pluginName} 已经启用，无需重复操作`
	}
	try {
		await enablePlugin.call(this, path.join(this.pluginDir, plugin.name), plugin.name)
		this.pluginList.enabled.push(plugin.name)
		this.pluginList.actived.push(plugin.name)
		this.pluginList.enabled = Array.from(new Set(this.pluginList.enabled))
		this.pluginList.actived = Array.from(new Set(this.pluginList.actived))
		return `启用插件 ${pluginName} 成功`
	} catch (e: any) {
		return `启用插件 ${pluginName} 失败\n${e.message}`
	}
}

async function handlePluginOff(this: Kolaris, pluginName: string) {
	if (!this.pluginActivedMap.has(pluginName)) {
		return `插件 ${pluginName} 已禁用 无需重复操作`
	}
	try {
		await disablePlugin.call(this, pluginName)
		this.pluginList.enabled.splice(this.pluginList.enabled.indexOf(pluginName), 1)
		this.pluginList.actived.splice(this.pluginList.actived.indexOf(pluginName), 1)
		return `禁用插件 ${pluginName} 成功`
	} catch (e: any) {
		return `禁用插件 ${pluginName} 失败\n${e.message}`
	}
}

async function handlePluginReboot(this: Kolaris, pluginName: string, plugin: PluginInfo) {
	try {
		if (!this.pluginActivedMap.has(pluginName)) {
			await enablePlugin.call(this, path.join(this.pluginDir, plugin.name), plugin.name)
			this.pluginList.enabled.push(plugin.name)
			this.pluginList.actived.push(plugin.name)
			this.pluginList.enabled = Array.from(new Set(this.pluginList.enabled))
			this.pluginList.actived = Array.from(new Set(this.pluginList.actived))
			return `启用插件 ${pluginName} 成功`
		}
		await disablePlugin.call(this, pluginName)
		await enablePlugin.call(this, path.join(this.pluginDir, plugin.name), plugin.name)
		return `重启插件 ${pluginName} 成功`
	} catch (e: any) {
		return `重启插件 ${pluginName} 失败\n${e.message}`
	}
}

async function generatePluginList(this: Kolaris, pluginList: PluginInfo[]) {
	const messages: Forwardable[] = pluginList.map(plugin => ({
		nickname: this.nickname,
		time: Math.round(new Date().getTime() / 1000),
		user_id: this.uin,
		message: [
			plugin.name,
			`版本: ${plugin.info.version}`,
			`描述: ${plugin.info.description}`,
		].join('\n'),
	}))

	const xml = await this.makeForwardMsg(messages)
	return segment.json(xml.data)
}

async function generateActivePluginList(this: Kolaris) {
	const activePlugins = Array.from(this.pluginActivedMap.keys())
	if (activePlugins.length === 0) {
		return '当前没有启用的插件'
	}

	const active: Forwardable[] = activePlugins.map((plugin) => {
		const info = this.pluginActivedMap.get(plugin)
		return {
			nickname: this.nickname,
			time: Math.round(new Date().getTime() / 1000),
			user_id: this.uin,
			message: [
				plugin,
				`版本: ${info?.config.version}`,
				`描述: ${info?.config.description}`,
			].join('\n'),
		}
	})

	const xml = await this.makeForwardMsg(active)
	return segment.json(xml.data)
}
