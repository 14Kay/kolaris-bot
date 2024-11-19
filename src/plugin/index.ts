/*
 * @Description: 插件系统
 * @Author: 14K
 * @Date: 2024-11-14 14:56:37
 * @LastEditTime: 2024-11-19 15:54:14
 * @LastEditors: 14K
 */
import type { Client, GroupMessageEvent, PrivateMessageEvent, Sendable } from '@icqq-plus/icqq'
import type { ScheduledTask } from 'node-cron'
import type { PluginConfig } from './types'
import * as nodeCron from 'node-cron'
import { getTargetType, PluginError } from './../utils'

type Func = (...args: any[]) => any
export class Plugin {
	private handlers: Map<string, Func[]> = new Map()
	private cronTasks: ScheduledTask[] = []
	constructor(public client: Client, public config: PluginConfig = {}) {
		client.logger.info(`KolarisPlugin - 插件实例化成功: ${config.name}`)
	}

	private onMessage(eventType: 'group' | 'private', callback: (data: any) => void) {
		const handler = (data: PrivateMessageEvent | GroupMessageEvent) => {
			const textMessage = getTargetType(data.message, 'text').map(item => item.text.trim()).join('')
			if (this.checkStatus(data) && this.checkPrefix(textMessage)) {
				if (eventType === 'group') {
					const event = data as GroupMessageEvent
					const reply = (content: Sendable, quote: boolean = false) => {
						return event.group.sendMsg(content, quote ? event : (this.config.quote ? event : undefined))
					}
					return callback({ ...data, reply })
				}
				return callback(data)
			}
		}

		this.client.on(`message.${eventType}`, handler)
		this.addListener(`message.${eventType}`, handler)
		return this
	}

	onGroupMessage(callback: (data: GroupMessageEvent) => any) {
		return this.onMessage('group', callback)
	}

	onPrivateMessage(callback: (data: PrivateMessageEvent) => any) {
		return this.onMessage('private', callback)
	}

	checkStatus(event: PrivateMessageEvent | GroupMessageEvent): boolean {
		if (event.message_type === 'private') {
			return this.checkUser(event.sender.user_id)
		}
		return this.checkUser(event.sender.user_id) && this.checkGroup(event.group_id)
	}

	checkUser(userId: number): boolean {
		return this.config.blackUsers?.includes(userId) || true
	}

	checkGroup(groupId: number): boolean {
		return this.config.blackGroups?.includes(groupId) || true
	}

	checkPrefix(message: string): boolean {
		return message.startsWith(this.config.prefix || '')
	}

	cron(cronExpression: string, fn: (client: Client) => any): ScheduledTask {
		const isSytaxOK = nodeCron.validate(cronExpression)
		if (!isSytaxOK) {
			throw new PluginError('cron', '无效的 cron 表达式')
		}
		const task = nodeCron.schedule(cronExpression, () => fn(this.client))
		this.cronTasks.push(task)
		return task
	}

	clearCronTasks() {
		this.cronTasks.forEach(task => task.stop())
	}

	private addListener(eventName: string, handler: Func) {
		const handlers = this.handlers.get(eventName)
		this.handlers.set(eventName, handlers ? [...handlers, handler] : [handler])
	}

	private removeListeners() {
		for (const [key, handlers] of this.handlers) {
			handlers.forEach(handler => this.client.offTrap(key, handler))
		}
	}

	destroy() {
		this.removeListeners()
		this.client.logger.mark(`KolarisPlugin - 插件 ${this.config.name} 已卸载`)
	}
}
