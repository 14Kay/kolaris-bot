import process from 'node:process'
import { MessageMiddleware } from './../middleware'
import { management } from './manage'
import { getLocalPlugins, loadSavedPlugins } from './plugin'
/*
 * @Description: 上线事件
 * @Author: 14K
 * @Date: 2024-11-15 14:01:29
 * @LastEditTime: 2024-11-18 23:36:23
 * @LastEditors: 14K
 */
import type { Kolaris } from './index'

export async function online(this: Kolaris) {
	const errorHandler = (e: Error) => {
		this.logger.error(e.message)
	}
	process.on('unhandledRejection', errorHandler)
	process.on('uncaughtException', errorHandler)

	this.on('message.private.friend', async (event) => {
		new MessageMiddleware()
			.sender(event.sender.user_id)
			.startsWith(this.kolarisConfig.command)
			.type('text')
			.command([
				{
					command: 'command',
					alias: 'c',
					description: '命令',
					type: 'string',
					required: true,
				},
				{
					command: 'plugin',
					alias: 'p',
					type: 'string',
					description: '插件名称',
					required: false,
				},
			], errMsg => event.reply(errMsg))
			.run(event, async ({ command }) => {
				return event.reply(await management.call(this, command?.c || command?.command, command?.p || command?.plugin) || '未知命令')
			})
	})

	const pluginList = await getLocalPlugins.call(this)
	const { error, success } = await loadSavedPlugins.call(this)
	this.log(`共找到 ${pluginList.length} 个插件\n加载了 ${success} 个插件。\n加载失败 ${error} 个插件。`)
	this.logger.info('Kolaris 初始化完成')
	this.sendMessage2Masters(`Kolaris 初始化完成\n共找到 ${pluginList.length} 个插件\n加载了 ${success} 个插件。\n加载失败 ${error} 个插件。`)
}
