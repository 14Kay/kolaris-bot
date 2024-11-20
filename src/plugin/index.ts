/*
 * @Description: 插件系统
 * @Author: 14K
 * @Date: 2024-11-14 14:56:37
 * @LastEditTime: 2024-11-20 17:12:51
 * @LastEditors: 14K
 */
import type { Client, GroupMessageEvent, PrivateMessageEvent, Sendable } from '@icqq-plus/icqq'
import type { DatabaseOptions } from 'classic-level'
import type { ScheduledTask } from 'node-cron'
import type { PluginConfig } from './types'
import Koa from 'koa'
import koaBodyParser from 'koa-bodyparser'
import KoaRouter from 'koa-router'
import * as nodeCron from 'node-cron'
import { getTargetType, PluginError } from './../utils'
import { Database } from './leveldb'

export type HttpHandler = (router: KoaRouter) => any
type Func = (...args: any[]) => any
export class Plugin {
	private handlers: Map<string, Func[]> = new Map()
	private httpServer: Map<string, any> = new Map()
	private dbMap: Map<string, Database<any>> = new Map()
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
					const reply = (content: Sendable, quote?: boolean) => {
						const shouldQuote = quote !== undefined ? quote : this.config.quote
						return event.group.sendMsg(content, shouldQuote ? event : undefined)
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

	http(port: number, fn: HttpHandler) {
		if (this.httpServer.has(port.toString())) {
			this.client.logger.warn(`KolarisPlugin - HTTP服务`, `HTTP服务已在端口：${port} 运行`)
			throw new PluginError(this.config.name, 'HTTP服务已在端口运行')
		}
		const server = this.startHttp(port, fn)
		return this.httpServer.set(port.toString(), server)
	}

	startHttp(port: number, fn: HttpHandler) {
		const app = new Koa()
		const router = new KoaRouter()
		app.use(koaBodyParser())
		app.use(router.routes())
		const server = app.listen(port, () => {
			this.client.logger.info(`KolarisPlugin - HTTP服务`, `HTTP服务已启动，端口：${port}`)
			fn(router)
		})

		server.on('error', (err) => {
			this.client.logger.error(`KolarisPlugin - HTTP服务`, `端口：${port} 的HTTP服务发生错误：${err.message}`)
		})

		return server
	}

	stopHttp(port: number) {
		const server = this.httpServer.get(port.toString())
		if (!server) {
			this.client.logger.warn(`KolarisPlugin - HTTP服务`, `未找到端口：${port} 的HTTP服务`)
			throw new PluginError(this.config.name, '未找到HTTP服务')
		}

		server.close(() => this.client.logger.info(`KolarisPlugin - HTTP服务`, `HTTP服务已关闭，端口：${port}`))
	}

	getLevelDB<T = Record<string, string>>(location: string) {
		if (!this.dbMap.has(location))
			throw new PluginError(this.config.name, `数据库${location}不存在`)
		return this.dbMap.get(location) as Database<T>
	}

	levelDB<T = Record<string, string>>(location: string, options?: DatabaseOptions<keyof T, T[keyof T]>) {
		if (this.dbMap.has(location))
			throw new PluginError(this.config.name, `数据库${location}已存在`)
		const db = new Database<T>(location, options)
		this.dbMap.set(location, db)
		return db
	}

	closeAllLevelDB() {
		for (const [location, db] of this.dbMap) {
			db.close()
			this.dbMap.delete(location)
		}
	}

	closeLevelDB(location: string) {
		const db = this.dbMap.get(location)
		if (!db) {
			this.client.logger.warn(`KolarisPlugin - LevelDB`, `未找到数据库：${location}`)
			throw new PluginError(this.config.name, '未找到数据库')
		}
		db.close()
		this.dbMap.delete(location)
	}

	private stopAllHttpServer() {
		for (const [eventName, handlers] of this.httpServer) {
			handlers.close(() => this.client.logger.info(`KolarisPlugin - HTTP服务`, `HTTP服务已关闭，端口：${eventName}`))
		}
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
		this.stopAllHttpServer()
		this.closeAllLevelDB()
		this.client.logger.mark(`KolarisPlugin - 插件 ${this.config.name} 已卸载`)
	}
}
